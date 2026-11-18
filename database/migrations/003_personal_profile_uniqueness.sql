BEGIN;

-- La creación del índice falla de forma segura si ya existen duplicados. En
-- ese caso se deben revisar manualmente antes de volver a ejecutar la migración.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_active_personal_per_creator_idx
  ON profiles (created_by_user_id)
  WHERE profile_type = 'personal' AND deleted_at IS NULL;

COMMIT;
