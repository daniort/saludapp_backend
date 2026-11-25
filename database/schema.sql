BEGIN;

-- UUIDs generados por PostgreSQL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Mantiene updated_at sincronizado en las tablas que lo utilizan.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Cuentas autenticadas mediante Firebase Authentication.
-- No se almacenan contraseñas en esta base de datos.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(200),
  role_key VARCHAR(50) NOT NULL DEFAULT 'member',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT users_email_not_blank CHECK (BTRIM(email) <> ''),
  CONSTRAINT users_firebase_uid_not_blank CHECK (BTRIM(firebase_uid) <> ''),
  CONSTRAINT users_role_key_not_blank CHECK (BTRIM(role_key) <> '')
);

-- El correo es único sin distinguir mayúsculas y minúsculas entre usuarios
-- activos. Firebase continúa siendo la fuente de verdad para autenticación.
CREATE UNIQUE INDEX users_email_active_unique_idx
  ON users (LOWER(email))
  WHERE deleted_at IS NULL;

CREATE INDEX users_active_idx
  ON users (is_active)
  WHERE deleted_at IS NULL;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Personas a quienes pertenecen los datos de salud.
-- Un perfil puede existir sin tener una cuenta propia de Firebase.
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_type VARCHAR(20) NOT NULL,
  given_names VARCHAR(150) NOT NULL,
  paternal_surname VARCHAR(100),
  maternal_surname VARCHAR(100),
  birth_date DATE,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT profiles_type_valid
    CHECK (profile_type IN ('personal', 'dependent')),
  CONSTRAINT profiles_given_names_not_blank
    CHECK (BTRIM(given_names) <> ''),
  CONSTRAINT profiles_birth_date_not_future
    CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE),
  CONSTRAINT profiles_created_by_user_fk
    FOREIGN KEY (created_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT
);

CREATE INDEX profiles_created_by_user_idx
  ON profiles (created_by_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX profiles_type_idx
  ON profiles (profile_type)
  WHERE deleted_at IS NULL;

-- Un usuario solamente puede tener un perfil personal activo creado para sí.
-- Los perfiles dependent no participan en esta restricción.
CREATE UNIQUE INDEX profiles_one_active_personal_per_creator_idx
  ON profiles (created_by_user_id)
  WHERE profile_type = 'personal' AND deleted_at IS NULL;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Vincula cuentas con perfiles. En el MVP, quien crea un perfil se vincula
-- como propietario. En el futuro podrán existir vínculos sin propiedad y se
-- podrán agregar permisos específicos.
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  -- Se conserva temporalmente para compatibilidad con instalaciones previas.
  -- access_role es la fuente de verdad para autorización.
  is_owner BOOLEAN NOT NULL DEFAULT FALSE,
  access_role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  display_alias VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT user_profiles_user_fk
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT user_profiles_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT user_profiles_access_role_valid
    CHECK (access_role IN ('owner', 'viewer', 'editor'))
);

-- Evita duplicar el mismo vínculo mientras se encuentre activo.
CREATE UNIQUE INDEX user_profiles_active_relation_unique_idx
  ON user_profiles (user_id, profile_id)
  WHERE deleted_at IS NULL;

-- Inicialmente cada perfil tiene un solo propietario. Otros usuarios podrán
-- vincularse en el futuro sin ser propietarios.
CREATE UNIQUE INDEX user_profiles_one_active_owner_idx
  ON user_profiles (profile_id)
  WHERE is_owner = TRUE AND deleted_at IS NULL;

CREATE INDEX user_profiles_user_active_idx
  ON user_profiles (user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX user_profiles_profile_active_idx
  ON user_profiles (profile_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Invitaciones de un solo uso para compartir el acceso a un perfil. El token
-- original nunca se guarda: solamente se persiste su hash SHA-256.
CREATE TABLE profile_invitations (
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

CREATE INDEX profile_invitations_profile_active_idx
  ON profile_invitations (profile_id, created_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX profile_invitations_expiration_idx
  ON profile_invitations (expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TRIGGER profile_invitations_set_updated_at
BEFORE UPDATE ON profile_invitations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Datos médicos básicos de una sola fila por perfil. La altura representa el
-- valor actual; si se necesita historial se agregará height_readings.
CREATE TABLE profile_medical_details (
  profile_id UUID PRIMARY KEY,
  blood_type VARCHAR(3),
  height_cm NUMERIC(5, 2),
  created_by_user_id UUID NOT NULL,
  updated_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profile_medical_details_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_medical_details_created_by_user_fk
    FOREIGN KEY (created_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_medical_details_updated_by_user_fk
    FOREIGN KEY (updated_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_medical_details_blood_type_valid
    CHECK (blood_type IS NULL OR blood_type IN (
      'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
    )),
  CONSTRAINT profile_medical_details_height_valid
    CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm <= 300))
);

CREATE TRIGGER profile_medical_details_set_updated_at
BEFORE UPDATE ON profile_medical_details
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Alergias activas conocidas para un perfil.
CREATE TABLE profile_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  recorded_by_user_id UUID NOT NULL,
  allergen_name VARCHAR(200) NOT NULL,
  allergy_type VARCHAR(30) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'unknown',
  reaction TEXT,
  identified_on DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT profile_allergies_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_allergies_recorded_by_user_fk
    FOREIGN KEY (recorded_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_allergies_name_not_blank
    CHECK (BTRIM(allergen_name) <> ''),
  CONSTRAINT profile_allergies_type_valid
    CHECK (allergy_type IN ('food', 'medication', 'environmental', 'other')),
  CONSTRAINT profile_allergies_severity_valid
    CHECK (severity IN ('mild', 'moderate', 'severe', 'unknown')),
  CONSTRAINT profile_allergies_identified_on_valid
    CHECK (identified_on IS NULL OR identified_on <= CURRENT_DATE)
);

CREATE INDEX profile_allergies_profile_active_idx
  ON profile_allergies (profile_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER profile_allergies_set_updated_at
BEFORE UPDATE ON profile_allergies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Medicamentos habituales o de largo plazo. ended_on en NULL representa un
-- tratamiento sin fecha de término conocida.
CREATE TABLE profile_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  recorded_by_user_id UUID NOT NULL,
  medication_name VARCHAR(200) NOT NULL,
  dose_value NUMERIC(10, 3),
  dose_unit VARCHAR(30),
  frequency_text VARCHAR(150),
  route VARCHAR(30),
  indication VARCHAR(200),
  started_on DATE,
  ended_on DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT profile_medications_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_medications_recorded_by_user_fk
    FOREIGN KEY (recorded_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT profile_medications_name_not_blank
    CHECK (BTRIM(medication_name) <> ''),
  CONSTRAINT profile_medications_dose_positive
    CHECK (dose_value IS NULL OR dose_value > 0),
  CONSTRAINT profile_medications_route_valid
    CHECK (route IS NULL OR route IN (
      'oral',
      'subcutaneous',
      'intravenous',
      'intramuscular',
      'inhaled',
      'topical',
      'ophthalmic',
      'other'
    )),
  CONSTRAINT profile_medications_dates_valid
    CHECK (started_on IS NULL OR ended_on IS NULL OR ended_on >= started_on)
);

CREATE INDEX profile_medications_profile_active_idx
  ON profile_medications (profile_id, is_active, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER profile_medications_set_updated_at
BEFORE UPDATE ON profile_medications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Lecturas de presión arterial. La unidad del sistema es mmHg; el pulso se
-- expresa en latidos por minuto.
CREATE TABLE blood_pressure_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  recorded_by_user_id UUID NOT NULL,
  systolic SMALLINT NOT NULL,
  diastolic SMALLINT NOT NULL,
  pulse SMALLINT,
  notes TEXT,
  taken_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT blood_pressure_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT blood_pressure_recorded_by_user_fk
    FOREIGN KEY (recorded_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT blood_pressure_systolic_positive CHECK (systolic > 0),
  CONSTRAINT blood_pressure_diastolic_positive CHECK (diastolic > 0),
  CONSTRAINT blood_pressure_pulse_positive CHECK (pulse IS NULL OR pulse > 0)
);

CREATE INDEX blood_pressure_profile_taken_at_idx
  ON blood_pressure_readings (profile_id, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX blood_pressure_recorded_by_user_idx
  ON blood_pressure_readings (recorded_by_user_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER blood_pressure_readings_set_updated_at
BEFORE UPDATE ON blood_pressure_readings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Lecturas de glucosa. Todos los valores se almacenan en mg/dL.
CREATE TABLE glucose_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  recorded_by_user_id UUID NOT NULL,
  value NUMERIC(7, 2) NOT NULL,
  taken_context VARCHAR(30) NOT NULL DEFAULT 'unknown',
  notes TEXT,
  taken_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT glucose_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT glucose_recorded_by_user_fk
    FOREIGN KEY (recorded_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT glucose_value_positive CHECK (value > 0),
  CONSTRAINT glucose_taken_context_valid CHECK (
    taken_context IN (
      'fasting',
      'before_meal',
      'after_meal',
      'bedtime',
      'random',
      'unknown',
      'other'
    )
  )
);

CREATE INDEX glucose_profile_taken_at_idx
  ON glucose_readings (profile_id, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX glucose_recorded_by_user_idx
  ON glucose_readings (recorded_by_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX glucose_taken_context_idx
  ON glucose_readings (taken_context)
  WHERE deleted_at IS NULL;

CREATE TRIGGER glucose_readings_set_updated_at
BEFORE UPDATE ON glucose_readings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Lecturas de peso. Todos los valores se almacenan en kilogramos.
CREATE TABLE weight_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  recorded_by_user_id UUID NOT NULL,
  weight_kg NUMERIC(6, 2) NOT NULL,
  notes TEXT,
  taken_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT weight_readings_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT weight_readings_recorded_by_user_fk
    FOREIGN KEY (recorded_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT weight_readings_value_valid
    CHECK (weight_kg > 0 AND weight_kg <= 1000)
);

CREATE INDEX weight_readings_profile_taken_at_idx
  ON weight_readings (profile_id, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX weight_readings_recorded_by_user_idx
  ON weight_readings (recorded_by_user_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER weight_readings_set_updated_at
BEFORE UPDATE ON weight_readings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Lecturas de temperatura. Todos los valores se almacenan en grados Celsius.
CREATE TABLE temperature_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  recorded_by_user_id UUID NOT NULL,
  temperature_celsius NUMERIC(4, 2) NOT NULL,
  measurement_site VARCHAR(20) NOT NULL DEFAULT 'unknown',
  notes TEXT,
  taken_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT temperature_readings_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT temperature_readings_recorded_by_user_fk
    FOREIGN KEY (recorded_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT temperature_readings_value_valid
    CHECK (temperature_celsius > 20 AND temperature_celsius <= 50),
  CONSTRAINT temperature_readings_site_valid
    CHECK (measurement_site IN (
      'oral',
      'axillary',
      'tympanic',
      'temporal',
      'rectal',
      'other',
      'unknown'
    ))
);

CREATE INDEX temperature_readings_profile_taken_at_idx
  ON temperature_readings (profile_id, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX temperature_readings_recorded_by_user_idx
  ON temperature_readings (recorded_by_user_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER temperature_readings_set_updated_at
BEFORE UPDATE ON temperature_readings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Lecturas de oximetría. La saturación se expresa como porcentaje y el pulso
-- opcional en latidos por minuto.
CREATE TABLE oxygen_saturation_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  recorded_by_user_id UUID NOT NULL,
  oxygen_saturation_percent NUMERIC(5, 2) NOT NULL,
  pulse_bpm SMALLINT,
  notes TEXT,
  taken_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT oxygen_saturation_readings_profile_fk
    FOREIGN KEY (profile_id)
    REFERENCES profiles (id)
    ON DELETE RESTRICT,
  CONSTRAINT oxygen_saturation_readings_recorded_by_user_fk
    FOREIGN KEY (recorded_by_user_id)
    REFERENCES users (id)
    ON DELETE RESTRICT,
  CONSTRAINT oxygen_saturation_readings_value_valid
    CHECK (
      oxygen_saturation_percent > 0
      AND oxygen_saturation_percent <= 100
    ),
  CONSTRAINT oxygen_saturation_readings_pulse_valid
    CHECK (pulse_bpm IS NULL OR (pulse_bpm > 0 AND pulse_bpm <= 300))
);

CREATE INDEX oxygen_saturation_profile_taken_at_idx
  ON oxygen_saturation_readings (profile_id, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX oxygen_saturation_recorded_by_user_idx
  ON oxygen_saturation_readings (recorded_by_user_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER oxygen_saturation_readings_set_updated_at
BEFORE UPDATE ON oxygen_saturation_readings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Reglas que aplicará el backend al crear perfiles:
--
-- 1. Crear el perfil con created_by_user_id igual al usuario autenticado.
-- 2. Crear en la misma transacción el vínculo user_profiles con
--    is_owner = TRUE y access_role = 'owner'.
-- 3. Cada usuario puede tener un solo perfil personal propio.
-- 4. Un usuario puede ser propietario de varios perfiles dependent.
-- 5. recorded_by_user_id debe corresponder a un usuario con acceso al perfil.
--
-- Las reglas 3 y 5 dependen de datos en varias tablas y se validarán inicialmente
-- en el backend dentro de una transacción.

COMMIT;
