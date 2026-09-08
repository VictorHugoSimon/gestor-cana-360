CREATE TABLE IF NOT EXISTS soil_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  sample_code text NOT NULL,
  sampled_on date NOT NULL,
  depth_from_cm numeric(8,2) NOT NULL DEFAULT 0,
  depth_to_cm numeric(8,2) NOT NULL DEFAULT 20,
  location geometry(Point,4326),
  laboratory text,
  ph numeric(6,2),
  organic_matter_g_dm3 numeric(10,3),
  phosphorus_mg_dm3 numeric(10,3),
  potassium_mmolc_dm3 numeric(10,3),
  calcium_mmolc_dm3 numeric(10,3),
  magnesium_mmolc_dm3 numeric(10,3),
  sulfur_mg_dm3 numeric(10,3),
  boron_mg_dm3 numeric(10,3),
  zinc_mg_dm3 numeric(10,3),
  manganese_mg_dm3 numeric(10,3),
  copper_mg_dm3 numeric(10,3),
  iron_mg_dm3 numeric(10,3),
  cec_mmolc_dm3 numeric(10,3),
  base_saturation_pct numeric(8,3),
  clay_pct numeric(8,3),
  sand_pct numeric(8,3),
  silt_pct numeric(8,3),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sample_code),
  CHECK (depth_to_cm > depth_from_cm),
  CHECK (ph IS NULL OR (ph >= 0 AND ph <= 14)),
  CHECK (base_saturation_pct IS NULL OR (base_saturation_pct >= 0 AND base_saturation_pct <= 100)),
  CHECK (clay_pct IS NULL OR (clay_pct >= 0 AND clay_pct <= 100)),
  CHECK (sand_pct IS NULL OR (sand_pct >= 0 AND sand_pct <= 100)),
  CHECK (silt_pct IS NULL OR (silt_pct >= 0 AND silt_pct <= 100))
);

CREATE INDEX IF NOT EXISTS soil_samples_org_field_sampled_idx
  ON soil_samples(organization_id, field_id, sampled_on DESC);
CREATE INDEX IF NOT EXISTS soil_samples_location_gix
  ON soil_samples USING GIST(location);

CREATE TABLE IF NOT EXISTS pest_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('pest','disease','weed','other')),
  name text NOT NULL,
  observed_on date NOT NULL,
  severity smallint NOT NULL CHECK (severity BETWEEN 1 AND 5),
  infestation_pct numeric(8,3) CHECK (infestation_pct IS NULL OR (infestation_pct >= 0 AND infestation_pct <= 100)),
  infested_area_ha numeric(12,4) CHECK (infested_area_ha IS NULL OR infested_area_ha >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','monitoring','treated','closed')),
  location geometry(Point,4326),
  affected_geometry geometry(MultiPolygon,4326),
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pest_occurrences_org_field_status_idx
  ON pest_occurrences(organization_id, field_id, status, observed_on DESC);
CREATE INDEX IF NOT EXISTS pest_occurrences_location_gix
  ON pest_occurrences USING GIST(location);
CREATE INDEX IF NOT EXISTS pest_occurrences_geometry_gix
  ON pest_occurrences USING GIST(affected_geometry);

CREATE TABLE IF NOT EXISTS pest_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pest_occurrence_id uuid NOT NULL REFERENCES pest_occurrences(id) ON DELETE CASCADE,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  occurred_on date NOT NULL,
  product_name text,
  dose numeric(14,4),
  dose_unit text,
  result text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pest_actions_occurrence_created_idx
  ON pest_actions(pest_occurrence_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pest_actions_work_order_idx
  ON pest_actions(work_order_id) WHERE work_order_id IS NOT NULL;
