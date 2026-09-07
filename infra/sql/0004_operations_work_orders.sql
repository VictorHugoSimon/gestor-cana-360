ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS farm_id uuid REFERENCES farms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS target_area_ha numeric(12,4),
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS check_in_longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS completed_by text,
  ADD COLUMN IF NOT EXISTS completion_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='work_orders_priority_check'
      AND conrelid='public.work_orders'::regclass
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_priority_check
      CHECK (priority IN ('low','normal','high','critical'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS work_orders_number_uidx ON work_orders(number);
CREATE INDEX IF NOT EXISTS work_orders_org_season_schedule_idx
  ON work_orders(organization_id, season_id, scheduled_for);
CREATE INDEX IF NOT EXISTS work_orders_org_farm_status_idx
  ON work_orders(organization_id, farm_id, status);

CREATE TABLE IF NOT EXISTS work_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'created','updated','status_changed','check_in','note','cost_updated','completed','cancelled'
  )),
  from_status text,
  to_status text,
  actor_id text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_order_events_order_created_idx
  ON work_order_events(work_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_order_events_org_created_idx
  ON work_order_events(organization_id, created_at DESC);
