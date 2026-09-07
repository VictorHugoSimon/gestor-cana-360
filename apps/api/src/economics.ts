import { Hono } from 'hono';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

type Role = 'owner' | 'admin' | 'manager' | 'agronomist' | 'operator' | 'viewer';

type EconomicsEnv = {
  Bindings: { DATABASE_URL: string };
  Variables: {
    authUserId: string;
    organizationId: string;
    role: Role;
  };
};

const productionWriteRoles = new Set<Role>(['owner', 'admin', 'manager', 'agronomist', 'operator']);
const costWriteRoles = new Set<Role>(['owner', 'admin', 'manager']);
const uuidQuery = z.uuid();

const productionInput = z.object({
  fieldId: z.uuid(),
  seasonId: z.uuid(),
  occurredOn: z.iso.date(),
  tons: z.number().positive().max(1_000_000),
  atrKgT: z.number().positive().max(500).optional(),
  atrPricePerKg: z.number().nonnegative().max(100).optional(),
  revenueAmount: z.number().nonnegative().max(1_000_000_000).optional(),
  source: z.string().trim().min(1).max(80).default('manual'),
  notes: z.string().trim().max(2000).optional(),
});

const costInput = z.object({
  fieldId: z.uuid().optional(),
  seasonId: z.uuid(),
  category: z.string().trim().min(2).max(120),
  occurredOn: z.iso.date(),
  amount: z.number().nonnegative().max(1_000_000_000),
  quantity: z.number().nonnegative().max(1_000_000_000).optional(),
  unit: z.string().trim().max(40).optional(),
  supplier: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function parseUuidQuery(value: string | undefined) {
  if (!value) return { value: undefined as string | undefined, error: false };
  const parsed = uuidQuery.safeParse(value);
  return parsed.success
    ? { value: parsed.data, error: false }
    : { value: undefined as string | undefined, error: true };
}

async function validateSeasonAndField(
  db: any,
  orgId: string,
  seasonId: string,
  fieldId?: string,
) {
  const season = await db`SELECT id FROM seasons WHERE id=${seasonId} AND organization_id=${orgId} LIMIT 1`;
  if (!season[0]) return 'season_not_found';
  if (fieldId) {
    const field = await db`SELECT id FROM fields WHERE id=${fieldId} AND organization_id=${orgId} AND active=true LIMIT 1`;
    if (!field[0]) return 'field_not_found';
  }
  return null;
}

export function registerEconomicsRoutes(app: Hono<EconomicsEnv>) {
  app.get('/api/v1/production', async (c) => {
    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const season = parseUuidQuery(c.req.query('seasonId'));
    const field = parseUuidQuery(c.req.query('fieldId'));
    if (!season.value) return c.json({ error: season.error ? 'invalid_season' : 'missing_season' }, 400);
    if (field.error) return c.json({ error: 'invalid_field' }, 400);

    const scopeError = await validateSeasonAndField(db, orgId, season.value, field.value);
    if (scopeError) return c.json({ error: scopeError }, 404);

    const rows = field.value
      ? await db`SELECT p.id, p.field_id, p.season_id, p.occurred_on, p.tons, p.atr_kg_t, p.atr_price_per_kg, p.revenue_amount,
          CASE WHEN p.revenue_amount IS NOT NULL THEN p.revenue_amount
               WHEN p.atr_kg_t IS NOT NULL AND p.atr_price_per_kg IS NOT NULL THEN ROUND((p.tons * p.atr_kg_t * p.atr_price_per_kg)::numeric, 2)
               ELSE NULL END AS calculated_revenue,
          p.source, p.notes, p.created_at, f.code AS field_code
        FROM production_entries p JOIN fields f ON f.id=p.field_id
        WHERE p.organization_id=${orgId} AND p.season_id=${season.value} AND p.field_id=${field.value}
        ORDER BY p.occurred_on DESC, p.created_at DESC`
      : await db`SELECT p.id, p.field_id, p.season_id, p.occurred_on, p.tons, p.atr_kg_t, p.atr_price_per_kg, p.revenue_amount,
          CASE WHEN p.revenue_amount IS NOT NULL THEN p.revenue_amount
               WHEN p.atr_kg_t IS NOT NULL AND p.atr_price_per_kg IS NOT NULL THEN ROUND((p.tons * p.atr_kg_t * p.atr_price_per_kg)::numeric, 2)
               ELSE NULL END AS calculated_revenue,
          p.source, p.notes, p.created_at, f.code AS field_code
        FROM production_entries p JOIN fields f ON f.id=p.field_id
        WHERE p.organization_id=${orgId} AND p.season_id=${season.value}
        ORDER BY p.occurred_on DESC, p.created_at DESC`;
    return c.json({ data: rows });
  });

  app.post('/api/v1/production', async (c) => {
    if (!productionWriteRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
    const parsed = productionInput.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);

    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const b = parsed.data;
    const scopeError = await validateSeasonAndField(db, orgId, b.seasonId, b.fieldId);
    if (scopeError) return c.json({ error: scopeError }, 404);

    const rows = await db`INSERT INTO production_entries
      (organization_id, field_id, season_id, occurred_on, tons, atr_kg_t, atr_price_per_kg, revenue_amount, source, notes)
      VALUES (${orgId}, ${b.fieldId}, ${b.seasonId}, ${b.occurredOn}, ${b.tons}, ${b.atrKgT ?? null}, ${b.atrPricePerKg ?? null}, ${b.revenueAmount ?? null}, ${b.source}, ${b.notes ?? null})
      RETURNING id, field_id, season_id, occurred_on, tons, atr_kg_t, atr_price_per_kg, revenue_amount, source, notes, created_at`;
    const row = rows[0] as { id: string };
    await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
      VALUES (${orgId}, ${c.get('authUserId')}, 'create', 'production_entry', ${row.id}, ${JSON.stringify({ fieldId: b.fieldId, seasonId: b.seasonId })}::jsonb)`;
    return c.json({ data: row }, 201);
  });

  app.get('/api/v1/costs', async (c) => {
    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const season = parseUuidQuery(c.req.query('seasonId'));
    const field = parseUuidQuery(c.req.query('fieldId'));
    if (!season.value) return c.json({ error: season.error ? 'invalid_season' : 'missing_season' }, 400);
    if (field.error) return c.json({ error: 'invalid_field' }, 400);

    const scopeError = await validateSeasonAndField(db, orgId, season.value, field.value);
    if (scopeError) return c.json({ error: scopeError }, 404);

    const rows = field.value
      ? await db`SELECT c.id, c.field_id, c.season_id, c.category, c.occurred_on, c.amount, c.quantity, c.unit, c.supplier, c.notes, c.created_at, f.code AS field_code
        FROM cost_entries c LEFT JOIN fields f ON f.id=c.field_id
        WHERE c.organization_id=${orgId} AND c.season_id=${season.value} AND c.field_id=${field.value}
        ORDER BY c.occurred_on DESC, c.created_at DESC`
      : await db`SELECT c.id, c.field_id, c.season_id, c.category, c.occurred_on, c.amount, c.quantity, c.unit, c.supplier, c.notes, c.created_at, f.code AS field_code
        FROM cost_entries c LEFT JOIN fields f ON f.id=c.field_id
        WHERE c.organization_id=${orgId} AND c.season_id=${season.value}
        ORDER BY c.occurred_on DESC, c.created_at DESC`;
    return c.json({ data: rows });
  });

  app.post('/api/v1/costs', async (c) => {
    if (!costWriteRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
    const parsed = costInput.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);

    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const b = parsed.data;
    const scopeError = await validateSeasonAndField(db, orgId, b.seasonId, b.fieldId);
    if (scopeError) return c.json({ error: scopeError }, 404);

    const rows = await db`INSERT INTO cost_entries
      (organization_id, field_id, season_id, category, occurred_on, amount, quantity, unit, supplier, notes)
      VALUES (${orgId}, ${b.fieldId ?? null}, ${b.seasonId}, ${b.category}, ${b.occurredOn}, ${b.amount}, ${b.quantity ?? null}, ${b.unit ?? null}, ${b.supplier ?? null}, ${b.notes ?? null})
      RETURNING id, field_id, season_id, category, occurred_on, amount, quantity, unit, supplier, notes, created_at`;
    const row = rows[0] as { id: string };
    await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id, metadata)
      VALUES (${orgId}, ${c.get('authUserId')}, 'create', 'cost_entry', ${row.id}, ${JSON.stringify({ fieldId: b.fieldId ?? null, seasonId: b.seasonId })}::jsonb)`;
    return c.json({ data: row }, 201);
  });

  app.get('/api/v1/economics/fields', async (c) => {
    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const season = parseUuidQuery(c.req.query('seasonId'));
    const farm = parseUuidQuery(c.req.query('farmId'));
    if (!season.value) return c.json({ error: season.error ? 'invalid_season' : 'missing_season' }, 400);
    if (farm.error) return c.json({ error: 'invalid_farm' }, 400);

    const scopeError = await validateSeasonAndField(db, orgId, season.value);
    if (scopeError) return c.json({ error: scopeError }, 404);

    const rows = await db`
      WITH p AS (
        SELECT field_id,
          SUM(tons) AS tons,
          SUM(CASE WHEN atr_kg_t IS NOT NULL THEN tons ELSE 0 END) AS tons_with_atr,
          SUM(CASE WHEN atr_kg_t IS NOT NULL THEN tons * atr_kg_t ELSE 0 END) AS atr_kg_total,
          SUM(COALESCE(revenue_amount,
              CASE WHEN atr_kg_t IS NOT NULL AND atr_price_per_kg IS NOT NULL
                   THEN tons * atr_kg_t * atr_price_per_kg ELSE 0 END)) AS revenue
        FROM production_entries
        WHERE organization_id=${orgId} AND season_id=${season.value}
        GROUP BY field_id
      ), cst AS (
        SELECT field_id, SUM(amount) AS cost
        FROM cost_entries
        WHERE organization_id=${orgId} AND season_id=${season.value} AND field_id IS NOT NULL
        GROUP BY field_id
      )
      SELECT f.id AS field_id, f.code, f.name, f.farm_id, f.area_ha, f.variety, f.cycle,
        fs.cut_number, fs.expected_tch, fs.expected_atr,
        COALESCE(p.tons,0) AS tons,
        CASE WHEN COALESCE(p.tons_with_atr,0)>0 THEN ROUND((p.atr_kg_total/p.tons_with_atr)::numeric,2) ELSE NULL END AS atr_kg_t,
        CASE WHEN COALESCE(f.area_ha,0)>0 THEN ROUND((COALESCE(p.tons,0)/f.area_ha)::numeric,2) ELSE NULL END AS tch,
        CASE WHEN COALESCE(f.area_ha,0)>0 THEN ROUND(((COALESCE(p.atr_kg_total,0)/1000)/f.area_ha)::numeric,3) ELSE NULL END AS tah,
        ROUND(COALESCE(p.revenue,0)::numeric,2) AS revenue,
        ROUND(COALESCE(cst.cost,0)::numeric,2) AS cost,
        ROUND((COALESCE(p.revenue,0)-COALESCE(cst.cost,0))::numeric,2) AS margin,
        CASE WHEN COALESCE(f.area_ha,0)>0 THEN ROUND((COALESCE(cst.cost,0)/f.area_ha)::numeric,2) ELSE NULL END AS cost_per_ha,
        CASE WHEN COALESCE(f.area_ha,0)>0 THEN ROUND(((COALESCE(p.revenue,0)-COALESCE(cst.cost,0))/f.area_ha)::numeric,2) ELSE NULL END AS margin_per_ha
      FROM fields f
      LEFT JOIN field_seasons fs ON fs.field_id=f.id AND fs.season_id=${season.value} AND fs.organization_id=${orgId}
      LEFT JOIN p ON p.field_id=f.id
      LEFT JOIN cst ON cst.field_id=f.id
      WHERE f.organization_id=${orgId} AND f.active=true
        AND (${farm.value ?? null}::uuid IS NULL OR f.farm_id=${farm.value ?? null}::uuid)
      ORDER BY margin_per_ha DESC NULLS LAST, f.code`;
    return c.json({ data: rows });
  });

  app.get('/api/v1/economics/summary', async (c) => {
    const db = neon(c.env.DATABASE_URL);
    const orgId = c.get('organizationId');
    const season = parseUuidQuery(c.req.query('seasonId'));
    const farm = parseUuidQuery(c.req.query('farmId'));
    if (!season.value) return c.json({ error: season.error ? 'invalid_season' : 'missing_season' }, 400);
    if (farm.error) return c.json({ error: 'invalid_farm' }, 400);

    const scopeError = await validateSeasonAndField(db, orgId, season.value);
    if (scopeError) return c.json({ error: scopeError }, 404);

    const [row] = await db`
      WITH scoped_fields AS (
        SELECT id, area_ha FROM fields
        WHERE organization_id=${orgId} AND active=true
          AND (${farm.value ?? null}::uuid IS NULL OR farm_id=${farm.value ?? null}::uuid)
      ), p AS (
        SELECT p.* FROM production_entries p JOIN scoped_fields f ON f.id=p.field_id
        WHERE p.organization_id=${orgId} AND p.season_id=${season.value}
      ), field_cost AS (
        SELECT c.* FROM cost_entries c JOIN scoped_fields f ON f.id=c.field_id
        WHERE c.organization_id=${orgId} AND c.season_id=${season.value}
      )
      SELECT
        COALESCE((SELECT SUM(area_ha) FROM scoped_fields),0) AS area_ha,
        COALESCE((SELECT SUM(tons) FROM p),0) AS tons,
        CASE WHEN COALESCE((SELECT SUM(CASE WHEN atr_kg_t IS NOT NULL THEN tons ELSE 0 END) FROM p),0)>0
          THEN ROUND(((SELECT SUM(CASE WHEN atr_kg_t IS NOT NULL THEN tons*atr_kg_t ELSE 0 END) FROM p) /
                      NULLIF((SELECT SUM(CASE WHEN atr_kg_t IS NOT NULL THEN tons ELSE 0 END) FROM p),0))::numeric,2)
          ELSE NULL END AS atr_kg_t,
        COALESCE((SELECT SUM(COALESCE(revenue_amount,
          CASE WHEN atr_kg_t IS NOT NULL AND atr_price_per_kg IS NOT NULL THEN tons*atr_kg_t*atr_price_per_kg ELSE 0 END)) FROM p),0) AS revenue,
        COALESCE((SELECT SUM(amount) FROM field_cost),0) AS field_cost,
        CASE WHEN ${farm.value ?? null}::uuid IS NULL
          THEN COALESCE((SELECT SUM(amount) FROM cost_entries c WHERE c.organization_id=${orgId} AND c.season_id=${season.value} AND c.field_id IS NULL),0)
          ELSE 0 END AS unallocated_cost`;

    const result = row as Record<string, unknown>;
    const area = Number(result.area_ha ?? 0);
    const tons = Number(result.tons ?? 0);
    const revenue = Number(result.revenue ?? 0);
    const fieldCost = Number(result.field_cost ?? 0);
    const unallocatedCost = Number(result.unallocated_cost ?? 0);
    const totalCost = fieldCost + unallocatedCost;
    return c.json({ data: {
      ...result,
      total_cost: totalCost,
      margin: revenue - totalCost,
      tch: area > 0 ? tons / area : null,
      margin_per_ha: area > 0 ? (revenue - totalCost) / area : null,
    } });
  });
}
