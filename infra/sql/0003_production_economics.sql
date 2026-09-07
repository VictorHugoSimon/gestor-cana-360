ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS atr_price_per_kg numeric(12,6),
  ADD COLUMN IF NOT EXISTS revenue_amount numeric(14,2);

CREATE INDEX IF NOT EXISTS production_entries_org_season_field_idx
  ON production_entries (organization_id, season_id, field_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS cost_entries_org_season_field_idx
  ON cost_entries (organization_id, season_id, field_id, occurred_on DESC);

COMMENT ON COLUMN production_entries.atr_price_per_kg IS
  'Preço em R$/kg de ATR usado para estimar receita quando revenue_amount não for informado.';

COMMENT ON COLUMN production_entries.revenue_amount IS
  'Receita efetivamente apurada para o lançamento. Quando nula, a API estima tons * atr_kg_t * atr_price_per_kg.';
