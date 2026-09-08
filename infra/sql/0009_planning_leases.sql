ALTER TABLE field_seasons
  ADD COLUMN IF NOT EXISTS planned_planting_on date,
  ADD COLUMN IF NOT EXISTS planned_harvest_on date,
  ADD COLUMN IF NOT EXISTS row_spacing_m numeric(8,3),
  ADD COLUMN IF NOT EXISTS expected_tons numeric(16,3),
  ADD COLUMN IF NOT EXISTS budget_amount numeric(16,2),
  ADD COLUMN IF NOT EXISTS expected_revenue_amount numeric(16,2),
  ADD COLUMN IF NOT EXISTS planting_direction_deg numeric(8,3),
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS field_seasons_org_season_status_idx
  ON field_seasons(organization_id, season_id, status);

CREATE TABLE IF NOT EXISTS cultivation_design_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  season_id uuid REFERENCES seasons(id) ON DELETE CASCADE,
  feature_type text NOT NULL CHECK (feature_type IN ('planting_line','ab_line','contour_line','access','drainage','other')),
  name text,
  geometry geometry(MultiLineString,4326) NOT NULL,
  spacing_m numeric(10,3),
  length_m numeric(16,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cultivation_design_org_field_season_idx
  ON cultivation_design_features(organization_id, field_id, season_id);
CREATE INDEX IF NOT EXISTS cultivation_design_geometry_gix
  ON cultivation_design_features USING GIST(geometry);

CREATE TABLE IF NOT EXISTS leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
  contract_number text,
  lessor_name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  area_ha numeric(14,4) CHECK (area_ha IS NULL OR area_ha >= 0),
  calculation_basis text NOT NULL DEFAULT 'fixed' CHECK (calculation_basis IN ('fixed','per_ha','revenue_share','tons_equivalent')),
  annual_amount numeric(16,2) CHECK (annual_amount IS NULL OR annual_amount >= 0),
  price_per_ha numeric(16,2) CHECK (price_per_ha IS NULL OR price_per_ha >= 0),
  revenue_share_pct numeric(8,4) CHECK (revenue_share_pct IS NULL OR (revenue_share_pct >= 0 AND revenue_share_pct <= 100)),
  tons_equivalent numeric(16,3) CHECK (tons_equivalent IS NULL OR tons_equivalent >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  UNIQUE (organization_id, contract_number)
);

CREATE INDEX IF NOT EXISTS leases_org_farm_status_idx
  ON leases(organization_id, farm_id, status);

CREATE TABLE IF NOT EXISTS lease_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  due_on date NOT NULL,
  paid_on date,
  amount numeric(16,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','paid','cancelled')),
  document_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lease_payments_org_season_due_idx
  ON lease_payments(organization_id, season_id, due_on);
CREATE INDEX IF NOT EXISTS lease_payments_lease_idx
  ON lease_payments(lease_id, due_on);

ALTER TABLE cost_entries
  ADD COLUMN IF NOT EXISTS lease_payment_id uuid REFERENCES lease_payments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cost_entries_lease_payment_uidx
  ON cost_entries(lease_payment_id) WHERE lease_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION gc360_sync_paid_lease_cost()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_field_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    RAISE EXCEPTION 'paid_lease_payment_is_final';
  END IF;

  IF NEW.status = 'paid' THEN
    SELECT field_id INTO v_field_id
      FROM leases
      WHERE id = NEW.lease_id
        AND organization_id = NEW.organization_id;

    INSERT INTO cost_entries(
      organization_id, field_id, season_id, lease_payment_id,
      category, occurred_on, amount, quantity, unit, notes
    ) VALUES (
      NEW.organization_id, v_field_id, NEW.season_id, NEW.id,
      'Arrendamento', COALESCE(NEW.paid_on, CURRENT_DATE), NEW.amount,
      1, 'parcela', 'Pagamento de arrendamento'
    )
    ON CONFLICT (lease_payment_id) WHERE lease_payment_id IS NOT NULL
    DO UPDATE SET
      field_id = EXCLUDED.field_id,
      season_id = EXCLUDED.season_id,
      occurred_on = EXCLUDED.occurred_on,
      amount = EXCLUDED.amount,
      notes = EXCLUDED.notes;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gc360_sync_paid_lease_cost ON lease_payments;
CREATE TRIGGER trg_gc360_sync_paid_lease_cost
AFTER INSERT OR UPDATE OF status, amount, paid_on, season_id
ON lease_payments
FOR EACH ROW EXECUTE FUNCTION gc360_sync_paid_lease_cost();
