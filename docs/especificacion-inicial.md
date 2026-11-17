# Especificación inicial de SaluBack

**Estado:** borrador aprobado como esqueleto inicial  
**Versión:** 0.2  
**Fecha:** 12 de noviembre de 2026

## 1. Idea general

SaluBack será el backend de una aplicación familiar sencilla para guardar el
historial de mediciones de salud. En la primera versión sólo se registrarán:

- presión arterial;
- glucosa sanguínea.

El objetivo inmediato es que una persona adulta pueda registrar sus propios
datos, incluyendo la fecha y hora reales de cada medición. Con ese historial, el
frontend podrá construir listas y gráficas.

La aplicación es inicialmente un prototipo de uso personal y familiar. No
interpreta resultados, no genera alertas y no sustituye una valoración médica.

## 2. Alcance del primer MVP

En esta primera etapa:

- todos los usuarios representan personas adultas;
- cada usuario tiene exactamente un perfil personal;
- cada usuario es dueño de su perfil y de sus datos;
- todos los usuarios tienen el rol global `member`;
- un usuario sólo puede crear, consultar, editar y eliminar sus propias
  mediciones;
- los usuarios de prueba se crearán manualmente en PostgreSQL;
- todavía no habrá autenticación real;
- Firebase Authentication se integrará en una fase posterior;
- las mediciones podrán registrar una fecha anterior a la fecha de captura;
- la API entregará datos históricos para que el frontend construya gráficas.

Aunque todavía no habrá autorización completa, el modelo conservará la relación
entre usuarios y perfiles para permitir compartir perfiles en el futuro.

## 3. Fuera del alcance actual

No se implementará todavía:

- inicio de sesión o registro con Firebase;
- perfiles de menores o adultos mayores dependientes;
- grupos familiares;
- invitaciones entre usuarios;
- acceso de una persona a los datos de otra;
- permisos de sólo lectura o captura;
- tablas generales de roles y permisos;
- auditoría de accesos o modificaciones;
- diagnósticos, recomendaciones o alertas médicas;
- integración con dispositivos;
- importación masiva de mediciones;
- gráficas en el backend.

## 4. Conceptos principales

### 4.1 Usuario

Representa una cuenta que podrá autenticarse en la aplicación. Por ahora se
creará manualmente en la base de datos. En el futuro se vinculará con una
identidad de Firebase.

Todos los usuarios tendrán inicialmente el rol `member`.

### 4.2 Perfil

Representa a la persona a la que pertenecen las mediciones de salud. Se mantiene
separado del usuario para no limitar el modelo futuro.

Tipos previstos:

- `personal`: perfil personal de un usuario adulto;
- `minor`: perfil de una persona menor de edad, reservado para el futuro;
- `dependent_adult`: perfil de un adulto mayor o dependiente, reservado para el
  futuro.

En el MVP sólo se permitirá el tipo `personal`.

### 4.3 Relación usuario-perfil

La tabla `user_profiles` relacionará cuentas con perfiles. En el MVP sólo
existirá la relación `owner`:

```text
usuario ── owner ──> perfil personal
```

Las restricciones iniciales garantizarán que:

- cada usuario sea dueño de un solo perfil;
- cada perfil personal tenga un solo dueño;
- el dueño tenga control total sobre las mediciones de su perfil.

Más adelante, la misma relación podrá ampliarse con accesos como `viewer` o
`editor`, sin mezclar esos permisos futuros con el MVP.

## 5. Historias de usuario del MVP

- Como usuario de prueba, quiero tener un perfil personal asociado.
- Como usuario, quiero registrar una lectura de presión arterial con la fecha en
  que fue tomada.
- Como usuario, quiero registrar una lectura de glucosa con su fecha y contexto.
- Como usuario, quiero consultar mi historial ordenado por fecha.
- Como usuario, quiero filtrar mi historial por un rango de fechas.
- Como usuario, quiero corregir una medición que capturé incorrectamente.
- Como usuario, quiero eliminar una medición propia.
- Como frontend, quiero recibir datos ordenados para construir gráficas.
- Como usuario, no debo poder consultar ni modificar mediciones pertenecientes a
  otro perfil.

## 6. Modelo de datos inicial

### 6.1 Tablas

| Tabla | Responsabilidad |
|---|---|
| `users` | Cuentas de usuario creadas manualmente |
| `profiles` | Personas a las que pertenecen las mediciones |
| `user_profiles` | Propiedad o acceso de un usuario sobre un perfil |
| `blood_pressure_readings` | Historial de presión arterial |
| `glucose_readings` | Historial de glucosa |

### 6.2 `users`

Campos preliminares:

| Campo | Descripción |
|---|---|
| `id` | UUID del usuario |
| `email` | Correo único |
| `display_name` | Nombre visible |
| `role` | `member` en el MVP |
| `firebase_uid` | Identificador futuro de Firebase; nullable inicialmente |
| `is_active` | Indica si la cuenta está activa |
| `created_at` | Fecha de creación |
| `updated_at` | Fecha de última modificación |

No se almacenarán contraseñas locales si la autenticación definitiva será
responsabilidad de Firebase.

### 6.3 `profiles`

Campos preliminares:

| Campo | Descripción |
|---|---|
| `id` | UUID del perfil |
| `type` | `personal` en el MVP |
| `first_name` | Nombre |
| `last_name` | Apellidos |
| `birth_date` | Fecha de nacimiento opcional |
| `created_at` | Fecha de creación |
| `updated_at` | Fecha de última modificación |

Se evitará guardar información personal que todavía no tenga una función clara
en el producto.

### 6.4 `user_profiles`

Campos preliminares:

| Campo | Descripción |
|---|---|
| `user_id` | Usuario relacionado |
| `profile_id` | Perfil relacionado |
| `relationship` | `owner` en el MVP |
| `created_at` | Fecha de creación de la relación |

En esta etapa no se necesitan columnas independientes de permisos. Los accesos
`viewer` o `editor` se diseñarán cuando se implemente la función familiar.

### 6.5 `blood_pressure_readings`

| Campo | Descripción | Regla inicial |
|---|---|---|
| `id` | UUID de la medición | Obligatorio |
| `profile_id` | Perfil propietario | Obligatorio |
| `systolic` | Presión sistólica | Entero, mmHg |
| `diastolic` | Presión diastólica | Entero, mmHg |
| `pulse` | Frecuencia cardiaca | Entero opcional, lpm |
| `measured_at` | Momento real de medición | Obligatorio, con zona horaria |
| `notes` | Observaciones | Opcional |
| `created_at` | Momento de captura | Generado por el servidor |
| `updated_at` | Última modificación | Generado por el servidor |

`measured_at` y `created_at` son distintos: una persona podrá cargar hoy una
medición que tomó días antes.

### 6.6 `glucose_readings`

| Campo | Descripción | Regla inicial |
|---|---|---|
| `id` | UUID de la medición | Obligatorio |
| `profile_id` | Perfil propietario | Obligatorio |
| `value` | Valor de glucosa | Decimal positivo |
| `unit` | Unidad | `mg/dL` inicialmente |
| `measurement_context` | Contexto de la lectura | Véase catálogo siguiente |
| `measured_at` | Momento real de medición | Obligatorio, con zona horaria |
| `notes` | Observaciones | Opcional |
| `created_at` | Momento de captura | Generado por el servidor |
| `updated_at` | Última modificación | Generado por el servidor |

Contextos iniciales:

- `fasting`: en ayunas;
- `before_meal`: antes de comer;
- `after_meal`: después de comer;
- `bedtime`: antes de dormir;
- `random`: medición aleatoria;
- `other`: otro contexto.

### 6.7 Relaciones

```text
users
  │ 1
  │
  │ 1  user_profiles (relationship = owner)
  │
  ▼ 1
profiles
  ├──< blood_pressure_readings
  └──< glucose_readings
```

La tabla intermedia parece redundante mientras la relación sea uno a uno, pero
se conserva deliberadamente porque después permitirá que varios usuarios tengan
distinto acceso a un mismo perfil.

## 7. Reglas funcionales

- Una medición siempre pertenece a un perfil, nunca directamente a un usuario.
- El usuario actual sólo puede operar sobre el perfil del que es `owner`.
- La fecha de medición puede ser anterior a la fecha de captura.
- Las fechas se recibirán con zona horaria y se guardarán en PostgreSQL como
  `timestamptz`.
- Las consultas históricas aceptarán filtros `from` y `to`.
- Los resultados se ordenarán por `measured_at` descendente de forma
  predeterminada.
- El backend devolverá valores numéricos y fechas; el frontend será responsable
  de dibujar las gráficas.
- Las validaciones evitarán valores vacíos, negativos o técnicamente inválidos,
  pero no clasificarán una medición como saludable o peligrosa.
- En el prototipo se permitirá eliminación física de una medición propia. Si el
  sistema evoluciona a un producto real, se revisará esta decisión.

## 8. API preliminar

Prefijo: `/api/v1`.

```text
GET    /profiles/me
PATCH  /profiles/me

GET    /profiles/me/blood-pressure
POST   /profiles/me/blood-pressure
GET    /profiles/me/blood-pressure/:readingId
PATCH  /profiles/me/blood-pressure/:readingId
DELETE /profiles/me/blood-pressure/:readingId

GET    /profiles/me/glucose
POST   /profiles/me/glucose
GET    /profiles/me/glucose/:readingId
PATCH  /profiles/me/glucose/:readingId
DELETE /profiles/me/glucose/:readingId
```

Usar `/profiles/me` evita que un cliente elija arbitrariamente otro
`profile_id`. El backend resolverá el perfil mediante el usuario actual.

Ejemplo de alta de presión:

```json
{
  "systolic": 120,
  "diastolic": 80,
  "pulse": 72,
  "measured_at": "2026-11-12T08:30:00-06:00",
  "notes": "Medición matutina"
}
```

Ejemplo de alta de glucosa:

```json
{
  "value": 95,
  "unit": "mg/dL",
  "measurement_context": "fasting",
  "measured_at": "2026-11-12T08:35:00-06:00",
  "notes": null
}
```

Ejemplo de consulta para una gráfica:

```text
GET /api/v1/profiles/me/glucose?from=2026-11-01&to=2026-11-30&order=asc
```

La forma exacta de las respuestas y errores se definirá posteriormente en un
documento OpenAPI.

## 9. Identidad temporal durante el desarrollo

Crear usuarios manualmente en PostgreSQL resuelve los datos de prueba, pero no
identifica por sí solo quién hace una petición HTTP. Mientras no exista Firebase
se necesitará un mecanismo exclusivamente local para seleccionar un usuario de
prueba.

La opción preliminar será un encabezado de desarrollo, por ejemplo
`X-Test-User-Id`, habilitado sólo en entorno local. El backend usará ese usuario
para resolver `/profiles/me`.

Este mecanismo:

- nunca debe habilitarse en un servidor público;
- no se considera autenticación;
- será reemplazado por el `uid` verificado de Firebase;
- permitirá probar desde ahora que un usuario no opere sobre otro perfil.

## 10. Evolución prevista

### Fase 1: prototipo personal

- usuarios manuales;
- un perfil personal por usuario;
- CRUD de presión y glucosa;
- filtros por fecha;
- identidad local de prueba.

### Fase 2: autenticación

- Firebase Authentication;
- asociación de `firebase_uid` con `users`;
- eliminación del encabezado de prueba;
- creación o vinculación automática del perfil personal.

### Fase 3: familia y acceso compartido

- grupos familiares e invitaciones;
- acceso a perfiles de otras personas;
- permisos de sólo lectura y de captura/edición;
- revocación de accesos.

### Fase 4: perfiles dependientes

- perfiles `minor` y `dependent_adult`;
- reglas sobre responsables y propietarios;
- revisión de consentimiento y privacidad.

## 11. Arquitectura inicial

```text
Frontend
   │ JSON sobre HTTP
   ▼
API Node.js + Express
   ├─ identidad temporal
   ├─ perfiles
   ├─ presión arterial
   └─ glucosa
   │
   ▼
PostgreSQL
```

Para este alcance es suficiente un monolito modular. No se necesitan
microservicios, colas ni almacenamiento adicional.

## 12. Consideración de seguridad

Como esta versión no tendrá autenticación real ni auditoría, debe tratarse sólo
como un prototipo local. No deberá publicarse en Internet ni almacenar datos
reales en un entorno accesible hasta integrar autenticación y aplicar controles
básicos de seguridad.

## 13. Próximos documentos

Antes de escribir la implementación conviene producir, en este orden:

1. modelo SQL con llaves, restricciones e índices;
2. contrato OpenAPI de los endpoints del MVP;
3. estructura modular del proyecto;
4. plan mínimo de pruebas, especialmente aislamiento entre usuarios.

