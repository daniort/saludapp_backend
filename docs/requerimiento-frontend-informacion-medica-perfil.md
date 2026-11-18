# Requerimiento frontend: información médica del perfil

## 1. Objetivo

Permitir consultar y administrar información médica complementaria de cualquier perfil al que el usuario tenga acceso, incluyendo perfiles personales y dependientes.

La primera versión contempla:

- Tipo sanguíneo.
- Altura actual en centímetros.
- Alergias.
- Medicamentos habituales o de largo plazo.

Todos los endpoints requieren autenticación Firebase:

```http
Authorization: Bearer <firebase-id-token>
```

## 2. Permisos

| Rol sobre el perfil | Consultar | Crear, editar y eliminar |
|---|---:|---:|
| `owner` | Sí | Sí |
| `viewer` | Sí | No |
| `editor` | Sí | No por el momento |

Frontend debe ocultar las acciones de modificación cuando:

```text
profile.accessRole !== "owner"
```

El backend aplica la autorización definitiva. Ocultar botones no sustituye esta validación.

## 3. Navegación sugerida

Dentro del detalle de cada perfil debe existir una sección `Información médica` con tres apartados:

1. Datos médicos básicos.
2. Alergias.
3. Medicamentos habituales.

La misma interfaz debe funcionar para perfiles `personal` y `dependent` utilizando siempre el `profileId` seleccionado.

## 4. Datos médicos básicos

### 4.1 Campos

| Campo | Tipo | Descripción |
|---|---|---|
| `bloodType` | `string \| null` | Tipo sanguíneo. |
| `heightCm` | `number \| null` | Altura actual en centímetros. |

Valores permitidos para `bloodType`:

```text
A+
A-
B+
B-
AB+
AB-
O+
O-
```

La altura debe ser positiva, no superar `300` y admitir máximo dos decimales.

### 4.2 Consultar

```http
GET /api/v1/profiles/:profileId/medical-details
Authorization: Bearer <firebase-id-token>
```

Respuesta `200 OK`:

```json
{
  "data": {
    "medicalDetails": {
      "profileId": "uuid",
      "bloodType": "O+",
      "heightCm": 172.5,
      "createdAt": "2026-11-18T12:00:00.000Z",
      "updatedAt": "2026-11-18T12:00:00.000Z"
    }
  }
}
```

Si todavía no se ha capturado información, el endpoint devuelve `200` con valores nulos:

```json
{
  "data": {
    "medicalDetails": {
      "profileId": "uuid",
      "bloodType": null,
      "heightCm": null,
      "createdAt": null,
      "updatedAt": null
    }
  }
}
```

### 4.3 Crear o actualizar

Se utiliza `PATCH` porque ambos campos son opcionales y pueden capturarse en momentos diferentes.

```http
PATCH /api/v1/profiles/:profileId/medical-details
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "bloodType": "O+",
  "heightCm": 172.5
}
```

Enviar explícitamente `null` elimina el valor existente:

```json
{
  "heightCm": null
}
```

## 5. Alergias

### 5.1 Modelo

```json
{
  "id": "uuid",
  "profileId": "uuid",
  "recordedByUserId": "uuid",
  "allergenName": "Penicilina",
  "allergyType": "medication",
  "severity": "severe",
  "reaction": "Dificultad respiratoria",
  "identifiedOn": "2020-05-01",
  "notes": null,
  "createdAt": "2026-11-18T12:00:00.000Z",
  "updatedAt": "2026-11-18T12:00:00.000Z"
}
```

Tipos de alergia:

| Valor | Etiqueta sugerida |
|---|---|
| `food` | Alimento |
| `medication` | Medicamento |
| `environmental` | Ambiental |
| `other` | Otra |

Severidad:

| Valor | Etiqueta sugerida |
|---|---|
| `mild` | Leve |
| `moderate` | Moderada |
| `severe` | Grave |
| `unknown` | No especificada |

Una alergia con severidad `severe` debe destacarse visualmente, sin sustituir recomendaciones médicas profesionales.

### 5.2 Crear

```http
POST /api/v1/profiles/:profileId/allergies
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "allergenName": "Penicilina",
  "allergyType": "medication",
  "severity": "severe",
  "reaction": "Dificultad respiratoria",
  "identifiedOn": "2020-05-01",
  "notes": null
}
```

`allergenName` y `allergyType` son obligatorios. `severity` utiliza `unknown` cuando se omite.

Respuesta `201 Created`:

```json
{
  "data": {
    "allergy": {
      "id": "uuid",
      "profileId": "uuid",
      "allergenName": "Penicilina",
      "allergyType": "medication",
      "severity": "severe"
    }
  }
}
```

### 5.3 Listar

```http
GET /api/v1/profiles/:profileId/allergies
Authorization: Bearer <firebase-id-token>
```

```json
{
  "data": {
    "allergies": [],
    "count": 0
  }
}
```

El backend ordena primero las alergias graves.

### 5.4 Actualizar

```http
PATCH /api/v1/profiles/:profileId/allergies/:allergyId
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "severity": "moderate",
  "reaction": "Erupción cutánea"
}
```

### 5.5 Eliminar

```http
DELETE /api/v1/profiles/:profileId/allergies/:allergyId
Authorization: Bearer <firebase-id-token>
```

Respuesta exitosa: `204 No Content`.

La eliminación es lógica. Frontend debe retirar el elemento de la lista después de recibir el `204`.

## 6. Medicamentos habituales

### 6.1 Modelo

```json
{
  "id": "uuid",
  "profileId": "uuid",
  "recordedByUserId": "uuid",
  "medicationName": "Metformina",
  "doseValue": 500,
  "doseUnit": "mg",
  "frequency": "Dos veces al día",
  "route": "oral",
  "indication": "Diabetes tipo 2",
  "startedOn": "2024-01-01",
  "endedOn": null,
  "isActive": true,
  "notes": null,
  "createdAt": "2026-11-18T12:00:00.000Z",
  "updatedAt": "2026-11-18T12:00:00.000Z"
}
```

Vías de administración permitidas:

```text
oral
subcutaneous
intravenous
intramuscular
inhaled
topical
ophthalmic
other
```

`frequency` es texto libre en esta versión para permitir instrucciones como:

- Una vez al día.
- Cada 8 horas.
- Dos veces al día con alimentos.
- Solo cuando sea necesario.

`indication` permite describir el motivo, por ejemplo `Diabetes tipo 2` o `Hipertensión`.

### 6.2 Crear

```http
POST /api/v1/profiles/:profileId/medications
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "medicationName": "Metformina",
  "doseValue": 500,
  "doseUnit": "mg",
  "frequency": "Dos veces al día",
  "route": "oral",
  "indication": "Diabetes tipo 2",
  "startedOn": "2024-01-01",
  "endedOn": null,
  "isActive": true,
  "notes": null
}
```

Solamente `medicationName` es obligatorio. Un tratamiento permanente o sin fecha de término usa `endedOn: null`.

Respuesta exitosa: `201 Created`.

### 6.3 Listar

Todos los medicamentos:

```http
GET /api/v1/profiles/:profileId/medications
```

Solo activos:

```http
GET /api/v1/profiles/:profileId/medications?active=true
```

Solo inactivos:

```http
GET /api/v1/profiles/:profileId/medications?active=false
```

Respuesta:

```json
{
  "data": {
    "medications": [],
    "count": 0
  }
}
```

### 6.4 Actualizar

```http
PATCH /api/v1/profiles/:profileId/medications/:medicationId
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{
  "doseValue": 850,
  "frequency": "Una vez al día"
}
```

Para finalizar un tratamiento sin eliminar su historial:

```json
{
  "isActive": false,
  "endedOn": "2026-11-18"
}
```

`endedOn` no puede ser anterior a `startedOn`.

### 6.5 Eliminar

```http
DELETE /api/v1/profiles/:profileId/medications/:medicationId
Authorization: Bearer <firebase-id-token>
```

Respuesta exitosa: `204 No Content`.

Para un tratamiento terminado normalmente se recomienda marcarlo como inactivo. La eliminación debe reservarse para registros capturados por error.

## 7. Estados de interfaz

Cada sección debe contemplar:

- Cargando.
- Sin información capturada.
- Información disponible.
- Error recuperable con reintento.
- Formulario creando o guardando.
- Confirmación antes de eliminar.
- Estado de solo lectura para `viewer`.

Los formularios deben bloquear el botón de guardar mientras exista una petición activa para evitar duplicados.

## 8. Errores relevantes

El formato estándar es:

```json
{
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "message": "El perfil no existe o no pertenece al usuario."
  }
}
```

| Código | Uso |
|---|---|
| `PROFILE_NOT_FOUND` | Perfil inexistente o sin permisos. |
| `BLOOD_TYPE_INVALID` | Tipo sanguíneo inválido. |
| `HEIGHT_INVALID` | Altura inválida. |
| `ALLERGEN_NAME_INVALID` | Nombre de alérgeno inválido. |
| `ALLERGY_TYPE_INVALID` | Tipo de alergia inválido. |
| `ALLERGY_SEVERITY_INVALID` | Severidad inválida. |
| `ALLERGY_NOT_FOUND` | Alergia inexistente o no modificable. |
| `MEDICATION_NAME_INVALID` | Nombre del medicamento inválido. |
| `DOSE_VALUE_INVALID` | Dosis inválida. |
| `MEDICATION_ROUTE_INVALID` | Vía de administración inválida. |
| `MEDICATION_DATES_INVALID` | Rango de fechas inválido. |
| `MEDICATION_NOT_FOUND` | Medicamento inexistente o no modificable. |
| `NO_CHANGES` | PATCH sin campos reconocidos. |

Un `401` debe seguir el flujo normal de renovación o autenticación. Un `404` no debe revelar si el recurso existe para otro usuario.

## 9. Criterios de aceptación

1. El propietario puede capturar tipo sanguíneo y altura para perfiles personales y dependientes.
2. Los campos básicos pueden guardarse por separado y limpiarse enviando `null`.
3. El propietario puede crear, consultar, modificar y eliminar alergias.
4. El propietario puede crear, consultar, modificar y eliminar medicamentos.
5. Un medicamento puede permanecer activo sin fecha de término.
6. Los tratamientos terminados pueden conservarse como inactivos.
7. Un `viewer` puede consultar las tres secciones.
8. Un `viewer` no ve acciones de modificación y el backend rechaza sus escrituras.
9. Todas las operaciones utilizan el perfil actualmente seleccionado.
10. Frontend distingue claramente estados vacíos de errores de red.

## 10. Extensiones recomendadas para después del MVP

- Condiciones o diagnósticos crónicos.
- Contactos de emergencia.
- Médicos y centros de atención habituales.
- Vacunas.
- Cirugías y hospitalizaciones.
- Peso, temperatura y saturación de oxígeno.
- Historial de altura para perfiles infantiles.
- Recordatorios para medicamentos.

Estas extensiones deben diseñarse como recursos separados; no deben agregarse como texto libre dentro de alergias o medicamentos.
