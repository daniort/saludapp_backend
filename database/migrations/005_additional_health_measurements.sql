BEGIN;

-- Historial de peso. La unidad canónica es kilogramo y no se almacena el IMC:
-- se calcula a partir del peso y la altura vigente del perfil.
CREATE TABLE IF NOT EXISTS weight_readings (
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

CREATE INDEX IF NOT EXISTS weight_readings_profile_taken_at_idx
  ON weight_readings (profile_id, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS weight_readings_recorded_by_user_idx
  ON weight_readings (recorded_by_user_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS weight_readings_set_updated_at ON weight_readings;

CREATE TRIGGER weight_readings_set_updated_at
BEFORE UPDATE ON weight_readings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Historial de temperatura. La unidad canónica es grado Celsius. Se conserva el
-- lugar o método corporal porque puede afectar la interpretación de la lectura.
CREATE TABLE IF NOT EXISTS temperature_readings (
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

CREATE INDEX IF NOT EXISTS temperature_readings_profile_taken_at_idx
  ON temperature_readings (profile_id, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS temperature_readings_recorded_by_user_idx
  ON temperature_readings (recorded_by_user_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS temperature_readings_set_updated_at
  ON temperature_readings;

CREATE TRIGGER temperature_readings_set_updated_at
BEFORE UPDATE ON temperature_readings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Historial de oximetría. La saturación se expresa como porcentaje y el pulso
-- que entrega el mismo oxímetro se conserva opcionalmente en bpm.
CREATE TABLE IF NOT EXISTS oxygen_saturation_readings (
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

CREATE INDEX IF NOT EXISTS oxygen_saturation_profile_taken_at_idx
  ON oxygen_saturation_readings (profile_id, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS oxygen_saturation_recorded_by_user_idx
  ON oxygen_saturation_readings (recorded_by_user_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS oxygen_saturation_readings_set_updated_at
  ON oxygen_saturation_readings;

CREATE TRIGGER oxygen_saturation_readings_set_updated_at
BEFORE UPDATE ON oxygen_saturation_readings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
