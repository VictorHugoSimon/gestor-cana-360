CREATE TABLE IF NOT EXISTS weather_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'internal',
  location geometry(Point,4326),
  elevation_m numeric(10,2),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS weather_stations_org_farm_active_idx
  ON weather_stations(organization_id, farm_id, active);
CREATE INDEX IF NOT EXISTS weather_stations_location_gix
  ON weather_stations USING GIST(location);

CREATE TABLE IF NOT EXISTS weather_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  weather_station_id uuid NOT NULL REFERENCES weather_stations(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  temperature_c numeric(8,3),
  relative_humidity_pct numeric(8,3),
  rainfall_mm numeric(10,3),
  wind_speed_ms numeric(10,3),
  wind_gust_ms numeric(10,3),
  wind_direction_deg numeric(8,3),
  solar_radiation_w_m2 numeric(12,3),
  atmospheric_pressure_hpa numeric(10,3),
  leaf_wetness_pct numeric(8,3),
  soil_temperature_c numeric(8,3),
  soil_moisture_pct numeric(8,3),
  evapotranspiration_mm numeric(10,3),
  source text NOT NULL DEFAULT 'manual',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (weather_station_id, observed_at),
  CHECK (relative_humidity_pct IS NULL OR (relative_humidity_pct >= 0 AND relative_humidity_pct <= 100)),
  CHECK (wind_direction_deg IS NULL OR (wind_direction_deg >= 0 AND wind_direction_deg <= 360)),
  CHECK (leaf_wetness_pct IS NULL OR (leaf_wetness_pct >= 0 AND leaf_wetness_pct <= 100)),
  CHECK (soil_moisture_pct IS NULL OR (soil_moisture_pct >= 0 AND soil_moisture_pct <= 100))
);

CREATE INDEX IF NOT EXISTS weather_observations_station_observed_idx
  ON weather_observations(weather_station_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS weather_observations_org_observed_idx
  ON weather_observations(organization_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS satellite_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'copernicus',
  collection_id text NOT NULL,
  external_item_id text NOT NULL,
  acquired_at timestamptz NOT NULL,
  cloud_cover_pct numeric(8,3),
  footprint geometry(MultiPolygon,4326),
  thumbnail_url text,
  catalogue_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, external_item_id),
  CHECK (cloud_cover_pct IS NULL OR (cloud_cover_pct >= 0 AND cloud_cover_pct <= 100))
);

CREATE INDEX IF NOT EXISTS satellite_scenes_org_field_acquired_idx
  ON satellite_scenes(organization_id, field_id, acquired_at DESC);
CREATE INDEX IF NOT EXISTS satellite_scenes_footprint_gix
  ON satellite_scenes USING GIST(footprint);

CREATE TABLE IF NOT EXISTS vegetation_index_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  satellite_scene_id uuid REFERENCES satellite_scenes(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  index_type text NOT NULL CHECK (index_type IN ('ndvi','ndre','evi','ndwi','other')),
  observed_at timestamptz NOT NULL,
  mean_value numeric(12,6),
  min_value numeric(12,6),
  max_value numeric(12,6),
  stddev_value numeric(12,6),
  p10_value numeric(12,6),
  p50_value numeric(12,6),
  p90_value numeric(12,6),
  raster_url text,
  source text NOT NULL DEFAULT 'processor',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vegetation_indices_org_field_type_observed_idx
  ON vegetation_index_observations(organization_id, field_id, index_type, observed_at DESC);
