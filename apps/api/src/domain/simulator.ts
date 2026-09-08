export type SimulatorInput = {
  areaHa: number;
  tch: number;
  atrKgT: number;
  atrPricePerKg: number;
  costPerHa: number;
  fixedCosts: number;
  leaseCost: number;
  harvestLossPct: number;
};

export type SimulatorResult = {
  grossTons: number;
  netTons: number;
  atrMassKg: number;
  revenue: number;
  variableCost: number;
  totalCost: number;
  margin: number;
  marginPerHa: number;
  revenuePerHa: number;
  marginPct: number | null;
  breakEvenTch: number | null;
  breakEvenAtrKgT: number | null;
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateScenario(input: SimulatorInput): SimulatorResult {
  const grossTons = input.areaHa * input.tch;
  const netTons = grossTons * (1 - input.harvestLossPct / 100);
  const atrMassKg = netTons * input.atrKgT;
  const revenue = atrMassKg * input.atrPricePerKg;
  const variableCost = input.areaHa * input.costPerHa;
  const totalCost = variableCost + input.fixedCosts + input.leaseCost;
  const margin = revenue - totalCost;
  const marginPerHa = margin / input.areaHa;
  const revenuePerHa = revenue / input.areaHa;
  const tchDenominator = input.areaHa * (1 - input.harvestLossPct / 100) * input.atrKgT * input.atrPricePerKg;
  const atrDenominator = input.areaHa * (1 - input.harvestLossPct / 100) * input.tch * input.atrPricePerKg;

  return {
    grossTons: round(grossTons, 3),
    netTons: round(netTons, 3),
    atrMassKg: round(atrMassKg, 2),
    revenue: round(revenue),
    variableCost: round(variableCost),
    totalCost: round(totalCost),
    margin: round(margin),
    marginPerHa: round(marginPerHa),
    revenuePerHa: round(revenuePerHa),
    marginPct: revenue > 0 ? round((margin / revenue) * 100) : null,
    breakEvenTch: tchDenominator > 0 ? round(totalCost / tchDenominator, 2) : null,
    breakEvenAtrKgT: atrDenominator > 0 ? round(totalCost / atrDenominator, 2) : null,
  };
}
