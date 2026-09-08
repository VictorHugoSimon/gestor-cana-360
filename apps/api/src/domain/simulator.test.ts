import { describe, expect, it } from 'vitest';
import { calculateScenario } from './simulator';

describe('calculateScenario', () => {
  it('calcula receita, custo e margem de forma determinística', () => {
    const result = calculateScenario({
      areaHa: 100,
      tch: 80,
      atrKgT: 140,
      atrPricePerKg: 1.2,
      costPerHa: 7000,
      fixedCosts: 50000,
      leaseCost: 100000,
      harvestLossPct: 5,
    });

    expect(result.grossTons).toBe(8000);
    expect(result.netTons).toBe(7600);
    expect(result.atrMassKg).toBe(1_064_000);
    expect(result.revenue).toBe(1_276_800);
    expect(result.variableCost).toBe(700_000);
    expect(result.totalCost).toBe(850_000);
    expect(result.margin).toBe(426_800);
    expect(result.marginPerHa).toBe(4268);
    expect(result.marginPct).toBeCloseTo(33.43, 2);
  });

  it('retorna equilíbrio nulo quando não existe preço/ATR para gerar receita', () => {
    const result = calculateScenario({
      areaHa: 10,
      tch: 70,
      atrKgT: 0,
      atrPricePerKg: 0,
      costPerHa: 5000,
      fixedCosts: 0,
      leaseCost: 0,
      harvestLossPct: 0,
    });

    expect(result.revenue).toBe(0);
    expect(result.margin).toBe(-50_000);
    expect(result.marginPct).toBeNull();
    expect(result.breakEvenTch).toBeNull();
    expect(result.breakEvenAtrKgT).toBeNull();
  });

  it('incorpora perda de colheita na tonelagem líquida', () => {
    const noLoss = calculateScenario({ areaHa: 1, tch: 100, atrKgT: 100, atrPricePerKg: 1, costPerHa: 0, fixedCosts: 0, leaseCost: 0, harvestLossPct: 0 });
    const withLoss = calculateScenario({ areaHa: 1, tch: 100, atrKgT: 100, atrPricePerKg: 1, costPerHa: 0, fixedCosts: 0, leaseCost: 0, harvestLossPct: 10 });
    expect(noLoss.netTons).toBe(100);
    expect(withLoss.netTons).toBe(90);
    expect(withLoss.revenue).toBe(9000);
  });
});
