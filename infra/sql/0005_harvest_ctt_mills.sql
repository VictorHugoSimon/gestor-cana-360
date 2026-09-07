CREATE TABLE IF NOT EXISTS mills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  municipality text,
  state text,
  distance_km numeric(10,2),
  default_atr_price_per_kg numeric(12,6),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS harvest_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  mill_id uuid REFERENCES mills(id) ON DELETE SET NULL,
  planned_start date,
  planned_end date,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  expected_tons numeric(14,3),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ready','harvesting','completed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS harvest_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  harvest_plan_id uuid REFERENCES harvest_plans(id) ON DELETE SET NULL,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  mill_id uuid REFERENCES mills(id) ON DELETE SET NULL,
  ticket_number text,
  vehicle_plate text,
  driver_name text,
  status text NOT NULL DEFAULT 'cutting' CHECK (status IN ('cutting','loaded','in_transit','arrived','delivered','rejected','cancelled')),
  cut_at timestamptz,
  loaded_at timestamptz,
  departed_at timestamptz,
  arrived_mill_at timestamptz,
  weighed_at timestamptz,
  milled_at timestamptz,
  net_tons numeric(14,3),
  atr_kg_t numeric(10,3),
  atr_price_per_kg numeric(12,6),
  revenue_amount numeric(14,2),
  impurities_pct numeric(7,4),
  fiber_pct numeric(7,4),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE production_entries
  ADD COLUMN IF NOT EXISTS harvest_load_id uuid REFERENCES harvest_loads(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS production_entries_harvest_load_uidx
  ON production_entries(harvest_load_id) WHERE harvest_load_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mills_org_active_idx ON mills(organization_id, active);
CREATE INDEX IF NOT EXISTS harvest_plans_scope_idx ON harvest_plans(organization_id, season_id, farm_id, status, planned_start);
CREATE INDEX IF NOT EXISTS harvest_loads_scope_idx ON harvest_loads(organization_id, season_id, farm_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS harvest_loads_field_idx ON harvest_loads(field_id, season_id, created_at DESC);
CREATE INDEX IF NOT EXISTS harvest_loads_mill_idx ON harvest_loads(mill_id, status, arrived_mill_at);

DROP TRIGGER IF EXISTS trg_mills_updated_at ON mills;
CREATE TRIGGER trg_mills_updated_at BEFORE UPDATE ON mills FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_harvest_plans_updated_at ON harvest_plans;
CREATE TRIGGER trg_harvest_plans_updated_at BEFORE UPDATE ON harvest_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_harvest_loads_updated_at ON harvest_loads;
CREATE TRIGGER trg_harvest_loads_updated_at BEFORE UPDATE ON harvest_loads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
