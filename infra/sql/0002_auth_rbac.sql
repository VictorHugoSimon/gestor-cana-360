CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  auth_user_id text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','manager','agronomist','operator','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
