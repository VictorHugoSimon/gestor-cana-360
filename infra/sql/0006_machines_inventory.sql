CREATE TABLE IF NOT EXISTS machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  farm_id uuid REFERENCES farms(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  machine_type text NOT NULL,
  brand text,
  model text,
  year integer,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','inactive')),
  hour_meter numeric(14,2),
  odometer_km numeric(14,2),
  fuel_type text,
  hourly_cost numeric(14,2),
  last_maintenance_at timestamptz,
  next_maintenance_hours numeric(14,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS machines_org_farm_status_idx
  ON machines(organization_id, farm_id, status);

CREATE TABLE IF NOT EXISTS machine_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  usage_type text NOT NULL DEFAULT 'operation' CHECK (usage_type IN ('operation','maintenance','fuel','breakdown')),
  started_at timestamptz,
  finished_at timestamptz,
  start_hour_meter numeric(14,2),
  end_hour_meter numeric(14,2),
  fuel_liters numeric(14,3),
  fuel_unit_cost numeric(14,4),
  actual_cost numeric(14,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_hour_meter IS NULL OR start_hour_meter IS NULL OR end_hour_meter >= start_hour_meter)
);

CREATE INDEX IF NOT EXISTS machine_usages_org_machine_created_idx
  ON machine_usages(organization_id, machine_id, created_at DESC);
CREATE INDEX IF NOT EXISTS machine_usages_org_work_order_idx
  ON machine_usages(organization_id, work_order_id) WHERE work_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku text,
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL,
  current_quantity numeric(16,4) NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  minimum_quantity numeric(16,4) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  average_unit_cost numeric(16,4) NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
  supplier text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_org_sku_uidx
  ON inventory_items(organization_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_items_org_category_active_idx
  ON inventory_items(organization_id, category, active);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  field_id uuid REFERENCES fields(id) ON DELETE SET NULL,
  season_id uuid REFERENCES seasons(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('in','out','adjustment_in','adjustment_out')),
  quantity numeric(16,4) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(16,4) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  supplier text,
  document_number text,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_org_item_occurred_idx
  ON inventory_movements(organization_id, inventory_item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_org_work_order_idx
  ON inventory_movements(organization_id, work_order_id) WHERE work_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION gc360_apply_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_current numeric(16,4);
  v_old_cost numeric(16,4);
  v_new_qty numeric(16,4);
BEGIN
  SELECT current_quantity, average_unit_cost
    INTO v_current, v_old_cost
  FROM inventory_items
  WHERE id = NEW.inventory_item_id
    AND organization_id = NEW.organization_id
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_item_not_found';
  END IF;

  IF NEW.movement_type IN ('out','adjustment_out') THEN
    IF v_current < NEW.quantity THEN
      RAISE EXCEPTION 'insufficient_inventory';
    END IF;
    UPDATE inventory_items
      SET current_quantity = current_quantity - NEW.quantity,
          updated_at = now()
      WHERE id = NEW.inventory_item_id;
  ELSE
    v_new_qty := v_current + NEW.quantity;
    UPDATE inventory_items
      SET current_quantity = v_new_qty,
          average_unit_cost = CASE
            WHEN NEW.unit_cost IS NOT NULL AND v_new_qty > 0
              THEN ROUND(((v_current * v_old_cost) + (NEW.quantity * NEW.unit_cost)) / v_new_qty, 4)
            ELSE average_unit_cost
          END,
          updated_at = now()
      WHERE id = NEW.inventory_item_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gc360_inventory_movement ON inventory_movements;
CREATE TRIGGER trg_gc360_inventory_movement
BEFORE INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION gc360_apply_inventory_movement();

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL;

ALTER TABLE cost_entries
  ADD COLUMN IF NOT EXISTS machine_usage_id uuid REFERENCES machine_usages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_movement_id uuid REFERENCES inventory_movements(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cost_entries_machine_usage_uidx
  ON cost_entries(machine_usage_id) WHERE machine_usage_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cost_entries_inventory_movement_uidx
  ON cost_entries(inventory_movement_id) WHERE inventory_movement_id IS NOT NULL;
