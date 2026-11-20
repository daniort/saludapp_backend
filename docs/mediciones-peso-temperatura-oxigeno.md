# API: peso, temperatura y saturación de oxígeno

## Autenticación y permisos

Todos los endpoints requieren:

```http
Authorization: Bearer <firebase-id-token>
```

- `owner`: puede crear, consultar, editar y eliminar lecturas.
- `viewer`: solamente puede consultar lecturas de perfiles compartidos.
- Las eliminaciones son lógicas mediante `deleted_at`.
- Todas las fechas se reciben como ISO 8601 en `takenAt`.

Los tres recursos ofrecen:

```text
POST   /api/v1/<resource>
GET    /api/v1/<resource>?profileId=<uuid>&from=<iso>&to=<iso>&limit=100
PATCH  /api/v1/<resource>/:readingId
DELETE /api/v1/<resource>/:readingId
```

El listado acepta `limit` entre 1 y 200 y ordena por `takenAt` descendente.

## Peso

Recurso:

```text
weight-readings
```

Crear:

```http
POST /api/v1/weight-readings
Content-Type: application/json

{
  "profileId": "uuid",
  "weightKg": 72.35,
  "notes": "Medición al despertar",
  "takenAt": "2026-11-20T07:30:00.000-06:00"
}
```

`weightKg` debe ser mayor que 0, máximo 1000 y admite dos decimales. La unidad
canónica es kilogramo. El IMC no se persiste; se calcula con la altura del perfil.

Respuesta `201`:

```json
{
  "data": {
    "reading": {
      "id": "uuid",
      "profileId": "uuid",
      "recordedByUserId": "uuid",
      "weightKg": 72.35,
      "unit": "kg",
      "notes": "Medición al despertar",
      "takenAt": "2026-11-20T13:30:00.000Z",
      "createdAt": "2026-11-20T13:35:00.000Z",
      "updatedAt": "2026-11-20T13:35:00.000Z"
    }
  }
}
```

Campos editables: `weightKg`, `notes`, `takenAt`.

## Temperatura

Recurso:

```text
temperature-readings
```

Crear:

```http
POST /api/v1/temperature-readings
Content-Type: application/json

{
  "profileId": "uuid",
  "temperatureCelsius": 37.2,
  "measurementSite": "axillary",
  "notes": null,
  "takenAt": "2026-11-20T08:00:00.000-06:00"
}
```

`temperatureCelsius` debe ser mayor que 20, máximo 50 y admite dos decimales.
La unidad canónica es grado Celsius.

`measurementSite` es opcional al crear y usa `unknown` por defecto. Valores:

```text
oral
axillary
tympanic
temporal
rectal
other
unknown
```

Respuesta `201` incluye:

```json
{
  "temperatureCelsius": 37.2,
  "unit": "°C",
  "measurementSite": "axillary"
}
```

Campos editables: `temperatureCelsius`, `measurementSite`, `notes`, `takenAt`.

## Saturación de oxígeno

Recurso:

```text
oxygen-saturation-readings
```

Crear:

```http
POST /api/v1/oxygen-saturation-readings
Content-Type: application/json

{
  "profileId": "uuid",
  "oxygenSaturationPercent": 97,
  "pulseBpm": 68,
  "notes": "En reposo",
  "takenAt": "2026-11-20T08:05:00.000-06:00"
}
```

- `oxygenSaturationPercent`: mayor que 0, máximo 100, hasta dos decimales.
- `pulseBpm`: opcional; entero entre 1 y 300 o `null`.
- La unidad canónica de saturación es porcentaje.

Respuesta `201` incluye:

```json
{
  "oxygenSaturationPercent": 97,
  "unit": "%",
  "pulseBpm": 68
}
```

Campos editables: `oxygenSaturationPercent`, `pulseBpm`, `notes`, `takenAt`.

## Actualización

Los `PATCH` aceptan uno o más campos editables, sin `profileId`:

```http
PATCH /api/v1/weight-readings/:readingId
Content-Type: application/json

{
  "weightKg": 71.9,
  "takenAt": "2026-11-20T07:35:00.000-06:00"
}
```

Si no se envía ningún campo reconocido, responde `NO_CHANGES` con HTTP 400.

## Eliminación

```http
DELETE /api/v1/oxygen-saturation-readings/:readingId
```

Respuesta exitosa: `204 No Content`. La fila permanece en base de datos con
`deleted_at`, pero deja de aparecer en consultas.

## Migración

Ejecutar manualmente:

```text
database/migrations/005_additional_health_measurements.sql
```

La migración crea las tablas, restricciones, índices y triggers de `updated_at`.
