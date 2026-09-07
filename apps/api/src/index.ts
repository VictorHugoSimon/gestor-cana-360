import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

type Bindings = {
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  APP_ENV: string;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  AI?: { run(model: string, input: unknown): Promise<unknown> };
};

const app = new Hono<{ Bindings: Bindings }>();
app.use('*', secureHeaders());
app.use('*', async (c, next) => cors({ origin: c.env.CORS_ORIGIN || '*', allowMethods: ['GET','POST','PATCH','DELETE','OPTIONS'], allowHeaders: ['Content-Type','Authorization','X-Organization-Id'] })(c, next));

app.get('/health', (c) => c.json({ ok: true, service: 'gestor-cana-360-api', environment: c.env.APP_ENV }));

app.get('/api/v1/fields', async (c) => {
  const orgId = c.req.header('X-Organization-Id');
  if (!orgId) return c.json({ error: 'missing_organization' }, 400);
  const sql = neon(c.env.DATABASE_URL);
  const rows = await sql`SELECT id, farm_id, code, name, area_ha, variety, cycle, active, ST_AsGeoJSON(geometry)::jsonb AS geometry FROM fields WHERE organization_id = ${orgId} ORDER BY code`;
  return c.json({ data: rows });
});

const fieldInput = z.object({
  farmId: z.uuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().max(120).optional(),
  areaHa: z.number().positive().max(100000).optional(),
  variety: z.string().trim().max(80).optional(),
  cycle: z.string().trim().max(80).optional(),
  geometry: z.record(z.string(), z.unknown()).optional(),
});

app.post('/api/v1/fields', async (c) => {
  const orgId = c.req.header('X-Organization-Id');
  if (!orgId) return c.json({ error: 'missing_organization' }, 400);
  const parsed = fieldInput.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'validation_error', details: parsed.error.flatten() }, 422);
  const b = parsed.data;
  const geojson = b.geometry ? JSON.stringify(b.geometry) : null;
  const sql = neon(c.env.DATABASE_URL);
  const rows = await sql`INSERT INTO fields (organization_id, farm_id, code, name, area_ha, variety, cycle, geometry)
    VALUES (${orgId}, ${b.farmId}, ${b.code}, ${b.name ?? null}, ${b.areaHa ?? null}, ${b.variety ?? null}, ${b.cycle ?? null}, CASE WHEN ${geojson}::text IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}),4326)) END)
    RETURNING id, farm_id, code, name, area_ha, variety, cycle, active`;
  return c.json({ data: rows[0] }, 201);
});

app.get('/api/v1/dashboard/summary', async (c) => {
  const orgId = c.req.header('X-Organization-Id');
  const seasonId = c.req.query('seasonId');
  if (!orgId || !seasonId) return c.json({ error: 'missing_scope' }, 400);
  const sql = neon(c.env.DATABASE_URL);
  const [summary] = await sql`SELECT
      COALESCE(SUM(f.area_ha),0) AS mapped_area_ha,
      COALESCE((SELECT SUM(p.tons) FROM production_entries p WHERE p.organization_id=${orgId} AND p.season_id=${seasonId}),0) AS produced_tons,
      COALESCE((SELECT SUM(k.amount) FROM cost_entries k WHERE k.organization_id=${orgId} AND k.season_id=${seasonId}),0) AS total_cost,
      COALESCE((SELECT COUNT(*) FROM work_orders w WHERE w.organization_id=${orgId} AND w.season_id=${seasonId} AND w.status IN ('overdue','in_progress')),0) AS open_alerts
    FROM fields f WHERE f.organization_id=${orgId} AND f.active=true`;
  return c.json({ data: summary });
});

const aiInput = z.object({ question: z.string().trim().min(3).max(2000), context: z.record(z.string(), z.unknown()).optional() });
app.post('/api/v1/ai/ask', async (c) => {
  const parsed = aiInput.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'validation_error' }, 422);
  const prompt = `Você é o copiloto agronômico do Gestor Cana 360. Responda em português, cite incertezas e nunca invente dados. Pergunta: ${parsed.data.question}\nContexto JSON: ${JSON.stringify(parsed.data.context ?? {})}`;
  if ((c.env.AI_PROVIDER ?? 'cloudflare') === 'cloudflare' && c.env.AI) {
    const result = await c.env.AI.run(c.env.AI_MODEL || '@cf/meta/llama-3.2-3b-instruct', { messages: [{ role: 'system', content: 'Assistente agrícola focado em cana-de-açúcar e gestão operacional.' }, { role: 'user', content: prompt }] });
    return c.json({ provider: 'cloudflare', data: result });
  }
  if (c.env.AI_PROVIDER === 'openai' && c.env.OPENAI_API_KEY && c.env.OPENAI_MODEL) {
    const response = await fetch('https://api.openai.com/v1/responses', { method:'POST', headers:{ 'Authorization':`Bearer ${c.env.OPENAI_API_KEY}`,'Content-Type':'application/json' }, body:JSON.stringify({ model:c.env.OPENAI_MODEL, input:prompt }) });
    if (!response.ok) return c.json({ error:'ai_provider_error', status:response.status }, 502);
    return c.json({ provider:'openai', data: await response.json() });
  }
  return c.json({ error:'ai_not_configured' }, 503);
});

app.onError((err, c) => { console.error(err); return c.json({ error: 'internal_error' }, 500); });
export default app;
