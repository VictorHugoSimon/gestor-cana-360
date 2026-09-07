CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  municipality text,
  state char(2),
  total_area_ha numeric(12,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date,
  ends_on date,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text,
  geometry geometry(MultiPolygon,4326),
  area_ha numeric(12,4),
  variety text,
  cycle text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, code)
);
CREATE INDEX IF NOT EXISTS idx_fields_org ON fields(organization_id);
CREATE INDEX IF NOT EXISTS idx_fields_geometry ON fields USING GIST(geometry);

CREATE TABLE IF NOT EXISTS field_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  variety text,
  cut_number integer CHECK (cut_number IS NULL OR cut_number >= 0),
  planted_on date,
  expected_harvest_on date,
  expected_tch numeric(10,3),
  expected_atr numeric(10,3),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','growing','ready','harvesting','harvested','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(field_id, season_id)
);

CREATE TABLE IF NOT EXISTS production_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  occurred_on date NOT NULL,
  tons numeric(14,3) NOT NULL CHECK (tons >= 0),
  atr_kg_t numeric(10,3),
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  category text NOT NULL,
  occurred_on date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  quantity numeric(14,3),
  unit text,
  supplier text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  number bigint GENERATED ALWAYS AS IDENTITY,
  operation_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','scheduled','in_progress','done','cancelled','overdue')),
  scheduled_for timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  assignee_name text,
  machine_name text,
  product_name text,
  dose numeric(14,4),
  dose_unit text,
  estimated_cost numeric(14,2),
  actual_cost numeric(14,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  organization_id uuid,
  actor_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
