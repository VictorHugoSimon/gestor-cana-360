import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

type Role = 'owner' | 'admin' | 'manager' | 'agronomist' | 'operator' | 'viewer';
type OperationsEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: { authUserId: string; organizationId: string; role: Role };
};

type Db = any;
const manageRoles = new Set<Role>(['owner', 'admin', 'manager', 'agronomist']);
const executeRoles = new Set<Role>(['owner', 'admin', 'manager', 'agronomist', 'operator']);
const uuidSchema = z.uuid();
const statusSchema = z.enum(['planned','scheduled','in_progress','done','cancelled','overdue']);

const workOrderInput = z.object({
  seasonId: z.uuid(),
  farmId: z.uuid().optional(),
  fieldId: z.uuid().optional(),
  operationType: z.string().trim().min(2).max(100),
  title: z.string().trim().min(3).max(180),
  priority: z.enum(['low','normal','high','critical']).default('normal'),
  scheduledFor: z.iso.datetime({ offset: true }).optional(),
  assigneeName: z.string().trim().max(160).optional(),
  machineName: z.string().trim().max(160).optional(),
  productName: z.string().trim().max(160).optional(),
  dose: z.number().nonnegative().max(1_000_000).optional(),
  doseUnit: z.string().trim().max(40).optional(),
  targetAreaHa: z.number().positive().max(1_000_000).optional(),
  estimatedCost: z.number().nonnegative().max(1_000_000_000).optional(),
  notes: z.string().trim().max(4000).optional(),
});

const workOrderPatch = z.object({
  operationType: z.string().trim().min(2).max(100).optional(),
  title: z.string().trim().min(3).max(180).optional(),
  priority: z.enum(['low','normal','high','critical']).optional(),
  scheduledFor: z.iso.datetime({ offset: true }).nullable().optional(),
  assigneeName: z.string().trim().max(160).nullable().optional(),
  machineName: z.string().trim().max(160).nullable().optional(),
  productName: z.string().trim().max(160).nullable().optional(),
  dose: z.number().nonnegative().max(1_000_000).nullable().optional(),
  doseUnit: z.string().trim().max(40).nullable().optional(),
  targetAreaHa: z.number().positive().max(1_000_000).nullable().optional(),
  estimatedCost: z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

const checkInInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  notes: z.string().trim().max(1000).optional(),
});
const completeInput = z.object({
  actualCost: z.number().nonnegative().max(1_000_000_000).optional(),
  completionNotes: z.string().trim().max(4000).optional(),
});
const noteInput = z.object({ notes: z.string().trim().min(1).max(4000) });

function queryUuid(value: string | undefined) {
  if (!value) return { value: undefined as string | undefined, invalid: false };
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? { value: parsed.data, invalid: false } : { value: undefined, invalid: true };
}

async function resolveScope(db: Db, orgId: string, seasonId: string, farmId?: string, fieldId?: string) {
  const season = await db`SELECT id FROM seasons WHERE id=${seasonId} AND organization_id=${orgId} LIMIT 1`;
  if (!season[0]) return { error: 'season_not_found' } as const;

  if (fieldId) {
    const fields = await db`SELECT id, farm_id, area_ha FROM fields WHERE id=${fieldId} AND organization_id=${orgId} AND active=true LIMIT 1`;
    const field = fields[0] as { farm_id?: string; area_ha?: string | number } | undefined;
    if (!field?.farm_id) return { error: 'field_not_found' } as const;
    if (farmId && farmId !== field.farm_id) return { error: 'field_farm_mismatch' } as const;
    return { farmId: field.farm_id, fieldAreaHa: field.area_ha ?? null } as const;
  }

  if (!farmId) return { error: 'farm_required' } as const;
  const farm = await db`SELECT id FROM farms WHERE id=${farmId} AND organization_id=${orgId} LIMIT 1`;
  if (!farm[0]) return { error: 'farm_not_found' } as const;
  return { farmId, fieldAreaHa: null } as const;
}

async function addEvent(db: Db, input: {
  orgId: string; orderId: string; type: string; actorId: string;
  fromStatus?: string | null; toStatus?: string | null; latitude?: number; longitude?: number;
  notes?: string | null; metadata?: Record<string, unknown>;
}) {
  await db`INSERT INTO work_order_events
    (organization_id, work_order_id, event_type, from_status, to_status, actor_id, latitude, longitude, notes, metadata)
    VALUES (${input.orgId}, ${input.orderId}, ${input.type}, ${input.fromStatus ?? null}, ${input.toStatus ?? null},
      ${input.actorId}, ${input.latitude ?? null}, ${input.longitude ?? null}, ${input.notes ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb)`;
}

export function registerOperationsRoutes(app: Hono<OperationsEnv>) {
  app.get('/api/v1/work-orders', async (c) => {
    const season = queryUuid(c.req.query('seasonId'));
    const farm = queryUuid(c.req.query('farmId'));
    const field = queryUuid(c.req.query('fieldId'));
    const statusRaw = c.req.query('status');
    const status = statusRaw ? statusSchema.safeParse(statusRaw) : null;
    if (!season.value) return c.json({ error: season.invalid ? 'invalid_season' : 'missing_season' }, 400);
    if (farm.invalid) return c.json({ error: 'invalid_farm' }, 400);
    if (field.invalid) return c.json({ error: 'invalid_field' }, 400);
    if (status && !status.success) return c.json({ error: 'invalid_status' }, 400);

    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const scope = await resolveScope(db, orgId, season.value, farm.value, field.value);
    if ('error' in scope && scope.error !== 'farm_required') return c.json({ error: scope.error }, 404);

    const statusValue = status?.success ? status.data : undefined;
    const rows = await db`
      SELECT wo.id, wo.number, wo.farm_id, wo.field_id, wo.season_id, wo.operation_type, wo.title,
        CASE WHEN wo.status IN ('planned','scheduled') AND wo.scheduled_for IS NOT NULL AND wo.scheduled_for < now()
          THEN 'overdue' ELSE wo.status END AS effective_status,
        wo.status, wo.priority, wo.scheduled_for, wo.started_at, wo.finished_at,
        wo.assignee_name, wo.machine_name, wo.product_name, wo.dose, wo.dose_unit,
        wo.target_area_ha, wo.estimated_cost, wo.actual_cost, wo.notes,
        wo.check_in_at, wo.check_in_latitude, wo.check_in_longitude, wo.completed_by, wo.completion_notes,
        wo.created_at, wo.updated_at, f.name AS farm_name, fld.code AS field_code
      FROM work_orders wo
      LEFT JOIN farms f ON f.id=wo.farm_id
      LEFT JOIN fields fld ON fld.id=wo.field_id
      WHERE wo.organization_id=${orgId} AND wo.season_id=${season.value}
        AND (${farm.value ?? null}::uuid IS NULL OR wo.farm_id=${farm.value ?? null}::uuid)
        AND (${field.value ?? null}::uuid IS NULL OR wo.field_id=${field.value ?? null}::uuid)
        AND (${statusValue ?? null}::text IS NULL OR
          (CASE WHEN wo.status IN ('planned','scheduled') AND wo.scheduled_for IS NOT NULL AND wo.scheduled_for < now()
            THEN 'overdue' ELSE wo.status END)=${statusValue ?? null}::text)
      ORDER BY
        CASE wo.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        wo.scheduled_for ASC NULLS LAST, wo.number DESC`;
    return c.json({ data: rows });
  });

  app.get('/api/v1/work-orders/:id', async (c) => {
    const id = uuidSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid_work_order' }, 400);
    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const rows = await db`SELECT wo.*, f.name AS farm_name, fld.code AS field_code,
      CASE WHEN wo.status IN ('planned','scheduled') AND wo.scheduled_for IS NOT NULL AND wo.scheduled_for < now()
        THEN 'overdue' ELSE wo.status END AS effective_status
      FROM work_orders wo LEFT JOIN farms f ON f.id=wo.farm_id LEFT JOIN fields fld ON fld.id=wo.field_id
      WHERE wo.id=${id.data} AND wo.organization_id=${orgId} LIMIT 1`;
    if (!rows[0]) return c.json({ error: 'work_order_not_found' }, 404);
    return c.json({ data: rows[0] });
  });

  app.post('/api/v1/work-orders', async (c) => {
    if (!manageRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
    const parsed = workOrderInput.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const b = parsed.data;
    const scope = await resolveScope(db, orgId, b.seasonId, b.farmId, b.fieldId);
    if ('error' in scope) return c.json({ error: scope.error }, scope.error === 'farm_required' ? 422 : 404);
    const initialStatus = b.scheduledFor ? 'scheduled' : 'planned';
    const rows = await db`INSERT INTO work_orders
      (organization_id, farm_id, field_id, season_id, operation_type, title, status, priority, scheduled_for,
       assignee_name, machine_name, product_name, dose, dose_unit, target_area_ha, estimated_cost, notes)
      VALUES (${orgId}, ${scope.farmId}, ${b.fieldId ?? null}, ${b.seasonId}, ${b.operationType}, ${b.title}, ${initialStatus},
       ${b.priority}, ${b.scheduledFor ?? null}, ${b.assigneeName ?? null}, ${b.machineName ?? null}, ${b.productName ?? null},
       ${b.dose ?? null}, ${b.doseUnit ?? null}, ${b.targetAreaHa ?? scope.fieldAreaHa ?? null}, ${b.estimatedCost ?? null}, ${b.notes ?? null})
      RETURNING *`;
    const row = rows[0] as { id: string; number: number | string };
    await addEvent(db, { orgId, orderId: row.id, type: 'created', actorId: c.get('authUserId'), toStatus: initialStatus, metadata: { number: row.number } });
    await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id)
      VALUES (${orgId}, ${c.get('authUserId')}, 'create', 'work_order', ${row.id})`;
    return c.json({ data: row }, 201);
  });

  app.patch('/api/v1/work-orders/:id', async (c) => {
    if (!manageRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
    const id = uuidSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid_work_order' }, 400);
    const parsed = workOrderPatch.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const b = parsed.data;
    const rows = await db`UPDATE work_orders SET
      operation_type=COALESCE(${b.operationType ?? null}, operation_type),
      title=COALESCE(${b.title ?? null}, title), priority=COALESCE(${b.priority ?? null}, priority),
      scheduled_for=CASE WHEN ${b.scheduledFor !== undefined}::boolean THEN ${b.scheduledFor ?? null}::timestamptz ELSE scheduled_for END,
      assignee_name=CASE WHEN ${b.assigneeName !== undefined}::boolean THEN ${b.assigneeName ?? null} ELSE assignee_name END,
      machine_name=CASE WHEN ${b.machineName !== undefined}::boolean THEN ${b.machineName ?? null} ELSE machine_name END,
      product_name=CASE WHEN ${b.productName !== undefined}::boolean THEN ${b.productName ?? null} ELSE product_name END,
      dose=CASE WHEN ${b.dose !== undefined}::boolean THEN ${b.dose ?? null}::numeric ELSE dose END,
      dose_unit=CASE WHEN ${b.doseUnit !== undefined}::boolean THEN ${b.doseUnit ?? null} ELSE dose_unit END,
      target_area_ha=CASE WHEN ${b.targetAreaHa !== undefined}::boolean THEN ${b.targetAreaHa ?? null}::numeric ELSE target_area_ha END,
      estimated_cost=CASE WHEN ${b.estimatedCost !== undefined}::boolean THEN ${b.estimatedCost ?? null}::numeric ELSE estimated_cost END,
      notes=CASE WHEN ${b.notes !== undefined}::boolean THEN ${b.notes ?? null} ELSE notes END,
      status=CASE WHEN status='planned' AND ${b.scheduledFor ?? null}::timestamptz IS NOT NULL THEN 'scheduled' ELSE status END,
      updated_at=now()
      WHERE id=${id.data} AND organization_id=${orgId} AND status NOT IN ('done','cancelled') RETURNING *`;
    if (!rows[0]) return c.json({ error: 'work_order_not_editable' }, 409);
    await addEvent(db, { orgId, orderId: id.data, type: 'updated', actorId: c.get('authUserId'), metadata: b as Record<string, unknown> });
    return c.json({ data: rows[0] });
  });

  app.post('/api/v1/work-orders/:id/start', async (c) => {
    if (!executeRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
    const id = uuidSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid_work_order' }, 400);
    const db = neon(c.env.DATABASE_URL); const orgId = c.get('organizationId');
    const rows = await db`UPDATE work_orders SET status='in_progress', started_at=COALESCE(started_at,now()), updated_at=now()
      WHERE id=${id.data} AND organization_id=${orgId} AND status IN ('planned','scheduled','overdue') RETURNING *, status AS effective_status`;
    if (!rows[0]) return c.json({ error: 'invalid_status_transition' }, 409);
    await addEvent(db, { orgId, orderId: id.data, type: 'status_changed', actorId: c.get('authUserId'), fromStatus: 'scheduled', toStatus: 'in_progress' });
    return c.json({ data: rows[0] });
  });

  app.post('/api/v1/work-orders/:id/check-in', async (c) => {
    if (!executeRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
    const id = uuidSchema.safeParse(c.req.param('id'));
    const parsed = checkInInput.safeParse(await c.req.json());
    if (!id.success) return c.json({ error: 'invalid_work_order' }, 400);
    if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
    const db = neon(c.env.DATABASE_URL); const orgId = c.get('organizationId'); const b = parsed.data;
    const existing = await db`SELECT status FROM work_orders WHERE id=${id.data} AND organization_id=${orgId} LIMIT 1`;
    const fromStatus = (existing[0] as { status?: string } | undefined)?.status;
    if (!fromStatus || !['planned','scheduled','overdue','in_progress'].includes(fromStatus)) return c.json({ error: 'invalid_status_transition' }, 409);
    const rows = await db`UPDATE work_orders SET status='in_progress', started_at=COALESCE(started_at,now()), check_in_at=now(),
      check_in_latitude=${b.latitude}, check_in_longitude=${b.longitude}, updated_at=now()
      WHERE id=${id.data} AND organization_id=${orgId} RETURNING *, status AS effective_status`;
    await addEvent(db, { orgId, orderId: id.data, type: 'check_in', actorId: c.get('authUserId'), fromStatus, toStatus: 'in_progress', latitude: b.latitude, longitude: b.longitude, notes: b.notes });
    return c.json({ data: rows[0] });
  });

  app.post('/api/v1/work-orders/:id/complete', async (c) => {
    if (!executeRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
    const id = uuidSchema.safeParse(c.req.param('id'));
    const parsed = completeInput.safeParse(await c.req.json());
    if (!id.success) return c.json({ error: 'invalid_work_order' }, 400);
    if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
    const db = neon(c.env.DATABASE_URL); const orgId = c.get('organizationId'); const b = parsed.data;
    const rows = await db`UPDATE work_orders SET status='done', finished_at=now(), actual_cost=COALESCE(${b.actualCost ?? null},actual_cost),
      completed_by=${c.get('authUserId')}, completion_notes=${b.completionNotes ?? null}, updated_at=now()
      WHERE id=${id.data} AND organization_id=${orgId} AND status='in_progress' RETURNING *`;
    const row = rows[0] as { id?: string; field_id?: string; season_id?: string; operation_type?: string; actual_cost?: string | number } | undefined;
    if (!row?.id) return c.json({ error: 'invalid_status_transition' }, 409);
    if (row.season_id && row.actual_cost != null) {
      await db`INSERT INTO cost_entries (organization_id, field_id, season_id, work_order_id, category, occurred_on, amount, notes)
        VALUES (${orgId}, ${row.field_id ?? null}, ${row.season_id}, ${row.id}, ${`OS - ${row.operation_type ?? 'Operação'}`},
          (now() AT TIME ZONE 'America/Sao_Paulo')::date, ${row.actual_cost}, ${b.completionNotes ?? null})
        ON CONFLICT (work_order_id) WHERE work_order_id IS NOT NULL DO UPDATE SET amount=EXCLUDED.amount, notes=EXCLUDED.notes`;
    }
    await addEvent(db, { orgId, orderId: id.data, type: 'completed', actorId: c.get('authUserId'), fromStatus: 'in_progress', toStatus: 'done', notes: b.completionNotes, metadata: { actualCost: b.actualCost ?? null } });
    return c.json({ data: row });
  });

  app.post('/api/v1/work-orders/:id/cancel', async (c) => {
    if (!manageRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
    const id = uuidSchema.safeParse(c.req.param('id'));
    const parsed = noteInput.partial().safeParse(await c.req.json().catch(() => ({})));
    if (!id.success) return c.json({ error: 'invalid_work_order' }, 400);
    if (!parsed.success) return c.json({ error: 'validation_error' }, 422);
    const db = neon(c.env.DATABASE_URL); const orgId = c.get('organizationId');
    const existing = await db`SELECT status FROM work_orders WHERE id=${id.data} AND organization_id=${orgId} LIMIT 1`;
    const fromStatus = (existing[0] as { status?: string } | undefined)?.status;
    if (!fromStatus || ['done','cancelled'].includes(fromStatus)) return c.json({ error: 'invalid_status_transition' }, 409);
    const rows = await db`UPDATE work_orders SET status='cancelled', updated_at=now() WHERE id=${id.data} AND organization_id=${orgId} RETURNING *`;
    await addEvent(db, { orgId, orderId: id.data, type: 'cancelled', actorId: c.get('authUserId'), fromStatus, toStatus: 'cancelled', notes: parsed.data.notes });
    return c.json({ data: rows[0] });
  });

  app.post('/api/v1/work-orders/:id/notes', async (c) => {
    if (!executeRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
    const id = uuidSchema.safeParse(c.req.param('id')); const parsed = noteInput.safeParse(await c.req.json());
    if (!id.success) return c.json({ error: 'invalid_work_order' }, 400);
    if (!parsed.success) return c.json({ error: 'validation_error' }, 422);
    const db = neon(c.env.DATABASE_URL); const orgId = c.get('organizationId');
    const exists = await db`SELECT id FROM work_orders WHERE id=${id.data} AND organization_id=${orgId} LIMIT 1`;
    if (!exists[0]) return c.json({ error: 'work_order_not_found' }, 404);
    await addEvent(db, { orgId, orderId: id.data, type: 'note', actorId: c.get('authUserId'), notes: parsed.data.notes });
    return c.json({ data: { ok: true } }, 201);
  });

  app.get('/api/v1/work-orders/:id/events', async (c) => {
    const id = uuidSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid_work_order' }, 400);
    const db = neon(c.env.DATABASE_URL); const orgId = c.get('organizationId');
    const rows = await db`SELECT id, event_type, from_status, to_status, actor_id, latitude, longitude, notes, metadata, created_at
      FROM work_order_events WHERE work_order_id=${id.data} AND organization_id=${orgId} ORDER BY created_at DESC`;
    return c.json({ data: rows });
  });

  app.get('/api/v1/operations/summary', async (c) => {
    const season = queryUuid(c.req.query('seasonId')); const farm = queryUuid(c.req.query('farmId'));
    if (!season.value) return c.json({ error: season.invalid ? 'invalid_season' : 'missing_season' }, 400);
    if (farm.invalid) return c.json({ error: 'invalid_farm' }, 400);
    const db = neon(c.env.DATABASE_URL); const orgId = c.get('organizationId');
    const [row] = await db`WITH scoped AS (
      SELECT *, CASE WHEN status IN ('planned','scheduled') AND scheduled_for IS NOT NULL AND scheduled_for < now()
        THEN 'overdue' ELSE status END AS effective_status
      FROM work_orders WHERE organization_id=${orgId} AND season_id=${season.value}
        AND (${farm.value ?? null}::uuid IS NULL OR farm_id=${farm.value ?? null}::uuid)
    ) SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE effective_status='planned') AS planned,
      COUNT(*) FILTER (WHERE effective_status='scheduled') AS scheduled,
      COUNT(*) FILTER (WHERE effective_status='in_progress') AS in_progress,
      COUNT(*) FILTER (WHERE effective_status='overdue') AS overdue,
      COUNT(*) FILTER (WHERE effective_status='done') AS done,
      COUNT(*) FILTER (WHERE effective_status='cancelled') AS cancelled,
      COUNT(*) FILTER (WHERE scheduled_for IS NOT NULL AND (scheduled_for AT TIME ZONE 'America/Sao_Paulo')::date=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND effective_status NOT IN ('done','cancelled')) AS due_today,
      COALESCE(SUM(target_area_ha) FILTER (WHERE effective_status NOT IN ('done','cancelled')),0) AS open_area_ha,
      COALESCE(SUM(estimated_cost),0) AS estimated_cost,
      COALESCE(SUM(actual_cost),0) AS actual_cost
      FROM scoped`;
    return c.json({ data: row ?? {} });
  });
}
