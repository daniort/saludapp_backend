# Requerimiento frontend: invitaciones y acceso familiar

## 1. Objetivo

Permitir que el propietario de un perfil de salud genere y comparta un enlace de invitación con un familiar. La persona que recibe el enlace podrá consultar la invitación, iniciar sesión o registrarse si es necesario, aceptarla y obtener acceso de solo lectura al perfil compartido.

La primera versión solamente contempla el permiso `viewer`. El permiso `editor` está reservado para una etapa futura.

## 2. Conceptos principales

- **Propietario (`owner`)**: usuario que administra el perfil y puede generar invitaciones, modificar datos médicos y retirar accesos.
- **Invitado (`viewer`)**: usuario que aceptó una invitación y puede consultar el perfil y sus mediciones, pero no modificarlos.
- **Invitación**: acceso temporal de un solo uso representado por un token opaco.
- **Perfil compartido**: perfil específico al que se concede acceso. Una invitación no concede acceso automático a todos los perfiles del propietario.

## 3. Variables de configuración

Frontend debe manejar como configuración por ambiente:

```text
API_BASE_URL=https://abundant-smile-production-15a63da4.up.railway.app
APP_BASE_URL=<dominio o esquema público del frontend>
```

Todas las rutas privadas deben enviar el ID token vigente de Firebase:

```http
Authorization: Bearer <firebase-id-token>
```

## 4. Ruta pública de invitación

Frontend debe implementar la ruta:

```text
/family/invitations/accept?token=<opaque-token>
```

El token debe conservarse durante un eventual login o registro para poder continuar el flujo después de autenticar al usuario.

El token:

- No debe imprimirse en logs.
- No debe enviarse a herramientas de analítica.
- No debe incluirse en mensajes de error.
- No debe interpretarse ni decodificarse en frontend.
- Solamente debe enviarse al backend mediante los endpoints definidos en este documento.

## 5. Flujo del propietario

### 5.1 Generar invitación

Desde el detalle de un perfil propio debe existir una acción como:

```text
Compartir con un familiar
```

La acción solamente debe mostrarse cuando:

```text
profile.accessRole === "owner"
```

Al seleccionarla, frontend enviará:

```http
POST /api/v1/profiles/:profileId/invitations
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{}
```

Respuesta exitosa `201 Created`:

```json
{
  "data": {
    "invitation": {
      "id": "uuid",
      "profile": {
        "id": "uuid",
        "givenNames": "María",
        "paternalSurname": "Ortiz",
        "maternalSurname": null
      },
      "invitedBy": {
        "id": "uuid",
        "displayName": "Daniel Ortiz"
      },
      "accessRole": "viewer",
      "context": {
        "flow": "family_profile_invitation",
        "version": 1,
        "resourceType": "profile",
        "redirectPath": "/family/invitations/accept",
        "requiresAuthentication": true
      },
      "expiresAt": "2026-11-24T12:00:00.000Z",
      "createdAt": "2026-11-17T12:00:00.000Z",
      "token": "opaque-token",
      "sharePath": "/family/invitations/accept?token=opaque-token"
    }
  }
}
```

Frontend debe construir el enlace completo utilizando su propio dominio:

```text
APP_BASE_URL + invitation.sharePath
```

Después debe mostrar acciones para:

- Copiar enlace.
- Abrir el menú nativo de compartir, cuando la plataforma lo permita.
- Cerrar el diálogo y volver al perfil.

Texto sugerido para compartir:

```text
Te invito a consultar mi perfil de salud en SaludApp. Abre este enlace para aceptar la invitación: <enlace>
```

El token solamente se devuelve al crear la invitación. Frontend no debe asumir que podrá recuperarlo posteriormente.

## 6. Flujo del invitado

### 6.1 Abrir y consultar invitación

Al abrir el enlace, frontend extraerá `token` del query string y consultará:

```http
GET /api/v1/profile-invitations/:token
```

Este endpoint es público y no requiere autenticación.

Respuesta exitosa `200 OK`:

```json
{
  "data": {
    "invitation": {
      "id": "uuid",
      "profile": {
        "id": "uuid",
        "givenNames": "María",
        "paternalSurname": "Ortiz",
        "maternalSurname": null
      },
      "invitedBy": {
        "id": "uuid",
        "displayName": "Daniel Ortiz"
      },
      "accessRole": "viewer",
      "context": {
        "flow": "family_profile_invitation",
        "version": 1,
        "resourceType": "profile",
        "redirectPath": "/family/invitations/accept",
        "requiresAuthentication": true
      },
      "expiresAt": "2026-11-24T12:00:00.000Z",
      "createdAt": "2026-11-17T12:00:00.000Z"
    }
  }
}
```

La pantalla debe mostrar como mínimo:

- Nombre de quien envió la invitación.
- Nombre del perfil que será compartido.
- Permiso que se otorgará: `Solo lectura`.
- Fecha de expiración.
- Acción principal: `Aceptar invitación`.
- Acción secundaria: `Cancelar` o `Ahora no`.

Frontend debe validar que el contexto sea reconocido antes de continuar:

```text
context.flow === "family_profile_invitation"
context.version === 1
context.resourceType === "profile"
```

`redirectPath` no debe ejecutarse como una URL arbitraria. Debe existir una lista interna de flujos y rutas permitidas para evitar redirecciones abiertas.

### 6.2 Usuario no autenticado

Si el usuario no tiene sesión:

1. Conservar temporalmente el token.
2. Mostrar opciones para iniciar sesión o registrarse.
3. Completar el flujo normal de autenticación.
4. Regresar a la pantalla de invitación.
5. Volver a consultar la invitación.
6. Permitir que el usuario confirme la aceptación.

No se debe aceptar automáticamente una invitación solamente por iniciar sesión. El usuario debe confirmar la acción explícitamente.

### 6.3 Aceptar invitación

Con una sesión válida y después de la confirmación del usuario:

```http
POST /api/v1/profile-invitations/:token/accept
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{}
```

Respuesta exitosa `200 OK`:

```json
{
  "data": {
    "access": {
      "profileId": "uuid",
      "accessRole": "viewer",
      "alreadyAccepted": false
    }
  }
}
```

`alreadyAccepted` puede ser `true` si el mismo usuario repite la petición después de haberla aceptado correctamente. El resultado debe tratarse como éxito.

Después de aceptar:

1. Eliminar el token pendiente del estado local.
2. Actualizar o invalidar la caché de perfiles.
3. Consultar nuevamente `GET /api/v1/profiles`.
4. Redirigir al detalle de `access.profileId`.
5. Mostrar una confirmación como `Ya puedes consultar este perfil`.

## 7. Perfiles propios y compartidos

`GET /api/v1/profiles` devuelve perfiles propios y perfiles compartidos. Cada perfil incluirá:

```json
{
  "id": "uuid",
  "accessRole": "owner",
  "isOwner": true
}
```

o:

```json
{
  "id": "uuid",
  "accessRole": "viewer",
  "isOwner": false
}
```

Frontend debe distinguir visualmente:

- `owner`: perfil administrado por el usuario.
- `viewer`: perfil compartido con el usuario.

Para `viewer` debe mostrarse una etiqueta como `Compartido contigo` o `Solo lectura`.

## 8. Comportamiento de solo lectura

Cuando `profile.accessRole === "viewer"`, frontend debe permitir:

- Consultar la información del perfil.
- Consultar lecturas de presión arterial.
- Consultar lecturas de glucosa.
- Visualizar gráficas e historial.

Frontend debe ocultar o deshabilitar:

- Editar o eliminar el perfil.
- Crear mediciones.
- Editar mediciones.
- Eliminar mediciones.
- Generar invitaciones.
- Administrar integrantes.

La autorización definitiva siempre la aplica el backend. Ocultar controles en frontend es una mejora de experiencia, no una medida suficiente de seguridad.

## 9. Administración de integrantes

El propietario debe tener una sección como `Personas con acceso` dentro del perfil.

### 9.1 Listar integrantes

```http
GET /api/v1/profiles/:profileId/members
Authorization: Bearer <firebase-id-token>
```

Respuesta exitosa `200 OK`:

```json
{
  "data": {
    "members": [
      {
        "userId": "uuid",
        "email": "persona@example.com",
        "displayName": "Persona Invitada",
        "accessRole": "viewer",
        "joinedAt": "2026-11-17T12:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

La lista puede incluir al propietario. El propietario debe mostrarse con la etiqueta `Propietario` y no debe tener acción para retirar acceso.

### 9.2 Retirar acceso

Para integrantes `viewer` debe existir una acción `Retirar acceso` con confirmación explícita.

```http
DELETE /api/v1/profiles/:profileId/members/:userId
Authorization: Bearer <firebase-id-token>
```

Respuesta exitosa:

```http
204 No Content
```

Después de eliminar:

- Cerrar el diálogo de confirmación.
- Retirar al integrante de la lista local o volver a consultar miembros.
- Mostrar una confirmación breve.

## 10. Errores esperados

El backend utiliza el formato:

```json
{
  "error": {
    "code": "INVITATION_EXPIRED",
    "message": "La invitación expiró."
  }
}
```

### Invitaciones

| Código | HTTP | Comportamiento esperado |
|---|---:|---|
| `INVITATION_NOT_FOUND` | 404 | Mostrar que el enlace no es válido. |
| `INVITATION_EXPIRED` | 410 | Mostrar que la invitación expiró y solicitar una nueva. |
| `INVITATION_REVOKED` | 410 | Mostrar que la invitación ya no está disponible. |
| `INVITATION_ALREADY_ACCEPTED` | 409 | Mostrar que el enlace ya fue utilizado. |
| `OWN_PROFILE_INVITATION` | 409 | Informar que no se puede aceptar una invitación propia. |
| `AUTH_TOKEN_REQUIRED` | 401 | Enviar al flujo de autenticación conservando el token. |
| `AUTH_TOKEN_EXPIRED` | 401 | Renovar sesión y reintentar una vez. |

### Administración de integrantes

| Código | HTTP | Comportamiento esperado |
|---|---:|---|
| `PROFILE_NOT_FOUND` | 404 | Mostrar perfil no disponible o regresar a la lista. |
| `MEMBER_NOT_FOUND` | 404 | Actualizar la lista de integrantes. |
| `OWNER_ACCESS_CANNOT_BE_REMOVED` | 409 | Informar que el propietario no puede ser eliminado. |

Para errores `5xx`, frontend debe mostrar un mensaje genérico y permitir reintentar sin perder el token de invitación.

## 11. Estados de interfaz requeridos

La experiencia debe contemplar:

- Cargando invitación.
- Invitación válida.
- Invitación inválida.
- Invitación expirada.
- Invitación ya utilizada.
- Usuario no autenticado.
- Confirmando aceptación.
- Invitación aceptada.
- Error recuperable con reintento.
- Generando enlace.
- Enlace listo para copiar o compartir.
- Cargando integrantes.
- Lista sin personas invitadas.
- Confirmando retiro de acceso.

Las acciones que ejecutan peticiones deben bloquearse temporalmente para evitar envíos duplicados.

## 12. Criterios de aceptación

1. Un propietario puede generar una invitación desde cualquiera de sus perfiles.
2. El enlace generado puede copiarse y compartirse desde frontend.
3. Una persona sin sesión puede abrir el enlace, autenticarse y regresar al flujo.
4. Frontend muestra una vista previa antes de aceptar.
5. Aceptar la invitación agrega el perfil compartido a la lista del receptor.
6. El receptor puede consultar el perfil, presión y glucosa.
7. El receptor no ve acciones de creación, edición o eliminación.
8. El propietario puede consultar quién tiene acceso.
9. El propietario puede retirar el acceso de un `viewer`.
10. No es posible retirar el acceso del propietario.
11. Una invitación expirada, revocada o utilizada muestra un estado específico.
12. El token no aparece en logs ni eventos de analítica.
13. Un reintento de aceptación del mismo usuario no genera vínculos duplicados.

## 13. Fuera de alcance en esta versión

- Permiso `editor` desde la interfaz.
- Cambiar permisos después de aceptar.
- Invitar exclusivamente a una dirección de correo.
- Listar o revocar invitaciones todavía no aceptadas.
- Compartir todos los perfiles de una familia en una sola operación.
- Crear una entidad o grupo formal denominado `family`.
- Transferir la propiedad de un perfil.
