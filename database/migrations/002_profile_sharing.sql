BEGIN;

-- Evoluciona los vínculos existentes sin romper temporalmente las consultas
-- que todavía utilicen is_owner.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS access_role VARCHAR(20);

UPDATE user_profiles
SET access_role = CASE
  WHEN is_owner = TRUE THEN 'owner'
  ELSE 'viewer'
END
WHERE access_role IS NULL;

ALTER TABLE user_profiles
  ALTER COLUMN access_role SET DEFAULT 'viewer',
  ALTER COLUMN access_role SET NOT NULL;

ALTER TABLE user_profiles
  ALTER COLUMN is_owner SET DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_access_role_valid'
      AND conrelid = 'user_profiles'::regclass
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_access_role_valid
      CHECK (access_role IN ('owner', 'viewer', 'editor'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS profile_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  invited_by_user_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  access_role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  context JSONB NOT NULL DEFAULT '{
    "flow": "family_profile_invitation",
    "version": 1,
    "resourceType": "profile",
    "redirectPath": "/family/invitations/accept",
    "requiresAuthentication": true
  }'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by_user_id UUID,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profile_invitations_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_invitations_invited_by_user_fk
    FOREIGN KEY (invited_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_invitations_accepted_by_user_fk
    FOREIGN KEY (accepted_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_invitations_access_role_valid
    CHECK (access_role IN ('viewer', 'editor')),
  CONSTRAINT profile_invitations_context_object
    CHECK (JSONB_TYPEOF(context) = 'object'),
  CONSTRAINT profile_invitations_expiration_valid
    CHECK (expires_at > created_at),
  CONSTRAINT profile_invitations_acceptance_complete
    CHECK (
      (accepted_by_user_id IS NULL AND accepted_at IS NULL)
      OR
      (accepted_by_user_id IS NOT NULL AND accepted_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS profile_invitations_profile_active_idx
  ON profile_invitations (profile_id, created_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS profile_invitations_expiration_idx
  ON profile_invitations (expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

DROP TRIGGER IF EXISTS profile_invitations_set_updated_at
  ON profile_invitations;

CREATE TRIGGER profile_invitations_set_updated_at
BEFORE UPDATE ON profile_invitations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
