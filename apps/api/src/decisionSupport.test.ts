import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { registerDecisionSupportRoutes } from './decisionSupport';

describe('POST /api/v1/simulator', () => {
  function createApp() {
    const app = new Hono<any>();
    registerDecisionSupportRoutes(app as never);
    return app;
  }

  it('retorna cálculo para cenário válido', async () => {
    const app = createApp();
    const response = await app.request('/api/v1/simulator', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ areaHa: 10, tch: 80, atrKgT: 140, atrPricePerKg: 1, costPerHa: 5000 }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.data.grossTons).toBe(800);
    expect(body.data.totalCost).toBe(50_000);
  });

  it('rejeita área zero e perda acima de 100%', async () => {
    const app = createApp();
    const response = await app.request('/api/v1/simulator', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ areaHa: 0, tch: 80, atrKgT: 140, atrPricePerKg: 1, costPerHa: 5000, harvestLossPct: 101 }),
    });
    expect(response.status).toBe(422);
    const body = await response.json() as any;
    expect(body.error).toBe('validation_error');
  });
});
