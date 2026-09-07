import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { neon } from '@neondatabase/serverless';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

type Role = 'owner' | 'admin' | 'manager' | 'agronomist' | 'operator' | 'viewer';

type Bindings = {
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  APP_ENV: string;
  NEON_AUTH_BASE_URL: string;
  NEON_AUTH_JWKS_URL: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
};

type Variables = {
  authUserId: string;
  organizationId: string;
  role: Role;
};

type AppEnv = { Bindings: Bindings; Variables: Variables };
type AppContext = Context<AppEnv>;

const app = new Hono<AppEnv>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const manageRoles = new Set<Role>(['owner', 'admin', 'manager']);
const fieldWriteRoles = new Set<Role>(['owner', 'admin', 'manager', 'agronomist', 'operator']);

function getJwks(url: string) {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

app.use('*', secureHeaders());
app.use('*', async (c, next) => cors({
  origin: c.env.CORS_ORIGIN || '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id'],
  credentials: true,
})(c, next));

app.get('/health', (c) => c.json({ ok: true, service: 'gestor-cana-360-api', environment: c.env.APP_ENV }));

app.use('/api/v1/*', async (c, next) => {
  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);

  const token = authorization.slice('Bearer '.length).trim();
  if (!token || !c.env.NEON_AUTH_BASE_URL || !c.env.NEON_AUTH_JWKS_URL) {
    return c.json({ error: 'auth_not_configured' }, 503);
  }

  try {
    const origin = new URL(c.env.NEON_AUTH_BASE_URL).origin;
    const { payload } = await jwtVerify(token, getJwks(c.env.NEON_AUTH_JWKS_URL), {
      issuer: origin,
      audience: origin,
    });
    if (!payload.sub) return c.json({ error: 'unauthorized' }, 401);
    c.set('authUserId', payload.sub);
  } catch (error) {
    console.warn('JWT validation failed', error instanceof Error ? error.message : 'unknown');
    return c.json({ error: 'unauthorized' }, 401);
  }

  if (c.req.path === '/api/v1/onboarding/claim') return next();

  const db = neon(c.env.DATABASE_URL);
  const requestedOrg = c.req.header('X-Organization-Id');
  const userId = c.get('authUserId');
  const memberships = requestedOrg
    ? await db`SELECT organization_id, role FROM organization_members WHERE auth_user_id=${userId} AND organization_id=${requestedOrg} LIMIT 1`
    : await db`SELECT organization_id, role FROM organization_members WHERE auth_user_id=${userId} ORDER BY created_at LIMIT 1`;

  const membership = memberships[0] as { organization_id?: string; role?: Role } | undefined;
  if (!membership?.organization_id || !membership.role) return c.json({ error: 'organization_membership_required' }, 403);

  c.set('organizationId', membership.organization_id);
  c.set('role', membership.role);
  return next();
});

app.post('/api/v1/onboarding/claim', async (c) => {
  if (c.env.APP_ENV !== 'development') return c.json({ error: 'not_available' }, 404);

  const db = neon(c.env.DATABASE_URL);
  const userId = c.get('authUserId');
  const created = await db`
    INSERT INTO organization_members (organization_id, auth_user_id, role)
    SELECT o.id, ${userId}, 'owner'
    FROM organizations o
    WHERE o.slug='gestor-cana-360-demo'
      AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id=o.id)
    ON CONFLICT (organization_id, auth_user_id) DO NOTHING
    RETURNING organization_id, role
  `;

  if (created[0]) {
    const row = created[0] as { organization_id: string; role: Role };
    await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id) VALUES (${row.organization_id}, ${userId}, 'claim_development_organization', 'organization', ${row.organization_id})`;
    return c.json({ data: row }, 201);
  }

  const existing = await db`
    SELECT m.organization_id, m.role
    FROM organization_members m
    JOIN organizations o ON o.id=m.organization_id
    WHERE m.auth_user_id=${userId} AND o.slug='gestor-cana-360-demo'
    LIMIT 1
  `;
  if (existing[0]) return c.json({ data: existing[0] });
  return c.json({ error: 'development_organization_already_claimed' }, 409);
});

app.get('/api/v1/me', async (c) => {
  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const orgs = await db`SELECT id, name, slug FROM organizations WHERE id=${orgId} LIMIT 1`;
  return c.json({
    data: {
      auth_user_id: c.get('authUserId'),
      role: c.get('role'),
      organization: orgs[0] ?? null,
    },
  });
});

const farmInput = z.object({
  name: z.string().trim().min(2).max(160),
  municipality: z.string().trim().max(120).optional(),
  state: z.string().trim().length(2).transform((v) => v.toUpperCase()).optional(),
  totalAreaHa: z.number().nonnegative().max(1_000_000).optional(),
});

app.get('/api/v1/farms', async (c) => {
  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const rows = await db`SELECT id, name, municipality, state, total_area_ha, created_at, updated_at FROM farms WHERE organization_id=${orgId} ORDER BY name`;
  return c.json({ data: rows });
});

app.post('/api/v1/farms', async (c) => {
  if (!manageRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
  const parsed = farmInput.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);

  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const b = parsed.data;
  const rows = await db`
    INSERT INTO farms (organization_id, name, municipality, state, total_area_ha)
    VALUES (${orgId}, ${b.name}, ${b.municipality ?? null}, ${b.state ?? null}, ${b.totalAreaHa ?? null})
    RETURNING id, name, municipality, state, total_area_ha, created_at, updated_at
  `;
  const row = rows[0] as { id: string };
  await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id) VALUES (${orgId}, ${c.get('authUserId')}, 'create', 'farm', ${row.id})`;
  return c.json({ data: row }, 201);
});

app.patch('/api/v1/farms/:id', async (c) => {
  if (!manageRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
  const parsed = farmInput.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);

  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const farmId = c.req.param('id');
  const b = parsed.data;
  const rows = await db`
    UPDATE farms SET
      name=COALESCE(${b.name ?? null}, name),
      municipality=COALESCE(${b.municipality ?? null}, municipality),
      state=COALESCE(${b.state ?? null}, state),
      total_area_ha=COALESCE(${b.totalAreaHa ?? null}, total_area_ha),
      updated_at=now()
    WHERE id=${farmId} AND organization_id=${orgId}
    RETURNING id, name, municipality, state, total_area_ha, created_at, updated_at
  `;
  if (!rows[0]) return c.json({ error: 'farm_not_found' }, 404);
  await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id) VALUES (${orgId}, ${c.get('authUserId')}, 'update', 'farm', ${farmId})`;
  return c.json({ data: rows[0] });
});

const seasonInput = z.object({
  name: z.string().trim().min(2).max(80),
  startsOn: z.iso.date().optional(),
  endsOn: z.iso.date().optional(),
  status: z.enum(['planned', 'active', 'closed']).optional(),
});

app.get('/api/v1/seasons', async (c) => {
  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const rows = await db`SELECT id, name, starts_on, ends_on, status, created_at, updated_at FROM seasons WHERE organization_id=${orgId} ORDER BY starts_on DESC NULLS LAST, name DESC`;
  return c.json({ data: rows });
});

app.post('/api/v1/seasons', async (c) => {
  if (!manageRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
  const parsed = seasonInput.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);

  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const b = parsed.data;
  const rows = await db`
    INSERT INTO seasons (organization_id, name, starts_on, ends_on, status)
    VALUES (${orgId}, ${b.name}, ${b.startsOn ?? null}, ${b.endsOn ?? null}, ${b.status ?? 'planned'})
    RETURNING id, name, starts_on, ends_on, status, created_at, updated_at
  `;
  const row = rows[0] as { id: string };
  await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id) VALUES (${orgId}, ${c.get('authUserId')}, 'create', 'season', ${row.id})`;
  return c.json({ data: row }, 201);
});

app.patch('/api/v1/seasons/:id', async (c) => {
  if (!manageRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
  const parsed = seasonInput.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);

  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const seasonId = c.req.param('id');
  const b = parsed.data;
  const rows = await db`
    UPDATE seasons SET
      name=COALESCE(${b.name ?? null}, name),
      starts_on=COALESCE(${b.startsOn ?? null}, starts_on),
      ends_on=COALESCE(${b.endsOn ?? null}, ends_on),
      status=COALESCE(${b.status ?? null}, status),
      updated_at=now()
    WHERE id=${seasonId} AND organization_id=${orgId}
    RETURNING id, name, starts_on, ends_on, status, created_at, updated_at
  `;
  if (!rows[0]) return c.json({ error: 'season_not_found' }, 404);
  await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id) VALUES (${orgId}, ${c.get('authUserId')}, 'update', 'season', ${seasonId})`;
  return c.json({ data: rows[0] });
});

const polygonGeometryInput = z.object({
  type: z.enum(['Polygon', 'MultiPolygon']),
  coordinates: z.array(z.unknown()),
}).passthrough();

const fieldInput = z.object({
  farmId: z.uuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().max(120).optional(),
  areaHa: z.number().positive().max(100000).optional(),
  variety: z.string().trim().max(80).optional(),
  cycle: z.string().trim().max(80).optional(),
  geometry: polygonGeometryInput.optional(),
});

const fieldPatchInput = fieldInput.partial();

app.get('/api/v1/fields', async (c) => {
  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const farmId = c.req.query('farmId');
  const rows = farmId
    ? await db`SELECT id, farm_id, code, name, area_ha, variety, cycle, active, ST_AsGeoJSON(geometry)::jsonb AS geometry FROM fields WHERE organization_id=${orgId} AND farm_id=${farmId} AND active=true ORDER BY code`
    : await db`SELECT id, farm_id, code, name, area_ha, variety, cycle, active, ST_AsGeoJSON(geometry)::jsonb AS geometry FROM fields WHERE organization_id=${orgId} AND active=true ORDER BY code`;
  return c.json({ data: rows });
});

app.post('/api/v1/fields', async (c) => {
  if (!fieldWriteRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
  const parsed = fieldInput.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);

  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const b = parsed.data;
  const farm = await db`SELECT id FROM farms WHERE id=${b.farmId} AND organization_id=${orgId} LIMIT 1`;
  if (!farm[0]) return c.json({ error: 'farm_not_found' }, 404);

  const geojson = b.geometry ? JSON.stringify(b.geometry) : null;
  const rows = await db`
    WITH g AS (
      SELECT CASE
        WHEN ${geojson}::text IS NULL THEN NULL
        ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326))
      END AS geometry
    )
    INSERT INTO fields (organization_id, farm_id, code, name, area_ha, variety, cycle, geometry)
    SELECT ${orgId}, ${b.farmId}, ${b.code}, ${b.name ?? null},
      CASE WHEN g.geometry IS NULL THEN ${b.areaHa ?? null}
           ELSE ROUND((ST_Area(g.geometry::geography) / 10000)::numeric, 4) END,
      ${b.variety ?? null}, ${b.cycle ?? null}, g.geometry
    FROM g
    WHERE g.geometry IS NULL OR (ST_IsValid(g.geometry) AND NOT ST_IsEmpty(g.geometry))
    RETURNING id, farm_id, code, name, area_ha, variety, cycle, active, ST_AsGeoJSON(geometry)::jsonb AS geometry
  `;
  if (!rows[0]) return c.json({ error: 'invalid_geometry' }, 422);
  const row = rows[0] as { id: string };
  await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id) VALUES (${orgId}, ${c.get('authUserId')}, 'create', 'field', ${row.id})`;
  return c.json({ data: rows[0] }, 201);
});

app.patch('/api/v1/fields/:id', async (c) => {
  if (!fieldWriteRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
  const parsed = fieldPatchInput.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);

  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const fieldId = c.req.param('id');
  const b = parsed.data;

  const existing = await db`SELECT id, farm_id FROM fields WHERE id=${fieldId} AND organization_id=${orgId} AND active=true LIMIT 1`;
  if (!existing[0]) return c.json({ error: 'field_not_found' }, 404);

  if (b.farmId) {
    const farm = await db`SELECT id FROM farms WHERE id=${b.farmId} AND organization_id=${orgId} LIMIT 1`;
    if (!farm[0]) return c.json({ error: 'farm_not_found' }, 404);
  }

  const geometrySupplied = b.geometry !== undefined;
  const geojson = b.geometry ? JSON.stringify(b.geometry) : null;
  const rows = await db`
    WITH g AS (
      SELECT CASE
        WHEN ${geometrySupplied}::boolean = false THEN NULL
        ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326))
      END AS geometry
    )
    UPDATE fields f SET
      farm_id=COALESCE(${b.farmId ?? null}, f.farm_id),
      code=COALESCE(${b.code ?? null}, f.code),
      name=COALESCE(${b.name ?? null}, f.name),
      variety=COALESCE(${b.variety ?? null}, f.variety),
      cycle=COALESCE(${b.cycle ?? null}, f.cycle),
      geometry=CASE WHEN ${geometrySupplied}::boolean THEN g.geometry ELSE f.geometry END,
      area_ha=CASE
        WHEN ${geometrySupplied}::boolean THEN ROUND((ST_Area(g.geometry::geography) / 10000)::numeric, 4)
        WHEN ${b.areaHa ?? null}::numeric IS NOT NULL THEN ${b.areaHa ?? null}::numeric
        ELSE f.area_ha
      END,
      updated_at=now()
    FROM g
    WHERE f.id=${fieldId} AND f.organization_id=${orgId}
      AND (NOT ${geometrySupplied}::boolean OR (g.geometry IS NOT NULL AND ST_IsValid(g.geometry) AND NOT ST_IsEmpty(g.geometry)))
    RETURNING f.id, f.farm_id, f.code, f.name, f.area_ha, f.variety, f.cycle, f.active, ST_AsGeoJSON(f.geometry)::jsonb AS geometry
  `;
  if (!rows[0]) return c.json({ error: 'invalid_geometry' }, 422);
  await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id) VALUES (${orgId}, ${c.get('authUserId')}, 'update', 'field', ${fieldId})`;
  return c.json({ data: rows[0] });
});

app.delete('/api/v1/fields/:id', async (c) => {
  if (!manageRoles.has(c.get('role'))) return c.json({ error: 'forbidden' }, 403);
  const db = neon(c.env.DATABASE_URL);
  const orgId = c.get('organizationId');
  const fieldId = c.req.param('id');
  const rows = await db`UPDATE fields SET active=false, updated_at=now() WHERE id=${fieldId} AND organization_id=${orgId} AND active=true RETURNING id`;
  if (!rows[0]) return c.json({ error: 'field_not_found' }, 404);
  await db`INSERT INTO audit_log (organization_id, actor_id, action, entity_type, entity_id) VALUES (${orgId}, ${c.get('authUserId')}, 'archive', 'field', ${fieldId})`;
  return c.json({ data: { id: fieldId, active: false } });
});

app.get('/api/v1/dashboard/summary', async (c) => {
  const orgId = c.get('organizationId');
  const seasonId = c.req.query('seasonId');
  if (!seasonId) return c.json({ error: 'missing_season' }, 400);
  const db = neon(c.env.DATABASE_URL);
  const [summary] = await db`SELECT
      COALESCE(SUM(f.area_ha),0) AS mapped_area_ha,
      COALESCE((SELECT SUM(p.tons) FROM production_entries p WHERE p.organization_id=${orgId} AND p.season_id=${seasonId}),0) AS produced_tons,
      COALESCE((SELECT SUM(k.amount) FROM cost_entries k WHERE k.organization_id=${orgId} AND k.season_id=${seasonId}),0) AS total_cost,
      COALESCE((SELECT COUNT(*) FROM work_orders w WHERE w.organization_id=${orgId} AND w.season_id=${seasonId} AND w.status IN ('overdue','in_progress')),0) AS open_alerts
    FROM fields f WHERE f.organization_id=${orgId} AND f.active=true`;
  return c.json({ data: summary });
});

const aiInput = z.object({
  question: z.string().trim().min(3).max(2000),
  context: z.record(z.string(), z.unknown()).optional(),
});

async function handleAi(c: AppContext): Promise<Response> {
  const parsed = aiInput.safeParse(await c.req.json());
  if (!parsed.success) return jsonResponse({ error: 'validation_error' }, 422);

  const env = c.env;
  const prompt = `Você é o copiloto agronômico do Gestor Cana 360. Responda em português, cite incertezas e nunca invente dados. Pergunta: ${parsed.data.question}\nContexto JSON: ${JSON.stringify(parsed.data.context ?? {})}`;

  if ((env.AI_PROVIDER ?? 'cloudflare') === 'cloudflare' && env.AI) {
    const result = await env.AI.run(env.AI_MODEL || '@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        { role: 'system', content: 'Assistente agrícola focado em cana-de-açúcar e gestão operacional.' },
        { role: 'user', content: prompt },
      ],
    });
    return jsonResponse({ provider: 'cloudflare', data: result });
  }

  if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY && env.OPENAI_MODEL) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: env.OPENAI_MODEL, input: prompt }),
    });
    if (!response.ok) return jsonResponse({ error: 'ai_provider_error', status: response.status }, 502);
    return jsonResponse({ provider: 'openai', data: await response.json() });
  }

  return jsonResponse({ error: 'ai_not_configured' }, 503);
}

app.post('/api/v1/ai/ask', handleAi);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

export default app;
