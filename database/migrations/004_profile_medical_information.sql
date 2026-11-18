BEGIN;

CREATE TABLE IF NOT EXISTS profile_medical_details (
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

DROP TRIGGER IF EXISTS profile_medical_details_set_updated_at
  ON profile_medical_details;

CREATE TRIGGER profile_medical_details_set_updated_at
BEFORE UPDATE ON profile_medical_details
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS profile_allergies (
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

CREATE INDEX IF NOT EXISTS profile_allergies_profile_active_idx
  ON profile_allergies (profile_id, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS profile_allergies_set_updated_at
  ON profile_allergies;

CREATE TRIGGER profile_allergies_set_updated_at
BEFORE UPDATE ON profile_allergies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS profile_medications (
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

CREATE INDEX IF NOT EXISTS profile_medications_profile_active_idx
  ON profile_medications (profile_id, is_active, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS profile_medications_set_updated_at
  ON profile_medications;

CREATE TRIGGER profile_medications_set_updated_at
BEFORE UPDATE ON profile_medications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
