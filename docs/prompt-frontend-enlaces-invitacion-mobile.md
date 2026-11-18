# Prompt para implementar enlaces móviles de invitación en frontend

Necesito ajustar el flujo de invitaciones familiares de la aplicación móvil
SaludApp para soportar Android App Links e iOS Universal Links.

Antes de modificar código, revisa la arquitectura actual de navegación,
autenticación, almacenamiento local y el flujo existente de invitaciones. Reutiliza
los servicios, modelos y pantallas existentes; no reescribas el flujo completo si
ya está implementado parcialmente.

## Contexto del backend

Dominio de producción:

```text
https://abundant-smile-production-15a63da4.up.railway.app
```

Al crear una invitación:

```http
POST /api/v1/profiles/:profileId/invitations
Authorization: Bearer <firebase-id-token>
```

el backend responde, entre otros campos:

```json
{
  "data": {
    "invitation": {
      "token": "opaque-token",
      "sharePath": "/i/opaque-token",
      "shareUrl": "https://abundant-smile-production-15a63da4.up.railway.app/i/opaque-token"
    }
  }
}
```

`shareUrl` es el enlace canónico y completo. No concatenes un dominio del
frontend ni vuelvas a construir la URL. El propietario debe compartir
`invitation.shareUrl` directamente mediante el menú nativo, WhatsApp o la acción
de copiar.

El backend también publica:

```text
GET /.well-known/assetlinks.json
GET /.well-known/apple-app-site-association
```

y sirve una página web de respaldo en:

```text
GET /i/:token
```

Si la app no está instalada, esa página muestra la invitación y los enlaces a las
tiendas. Después de instalar la aplicación, el usuario regresará al mensaje de
WhatsApp y tocará nuevamente el enlace. No uses Firebase Dynamic Links.

## Comportamiento requerido en la aplicación

1. Configura Android App Links para el host
   `abundant-smile-production-15a63da4.up.railway.app`, esquema `https`, con
   `android:autoVerify="true"` y `pathPrefix="/i/"`.
2. Configura iOS Universal Links agregando el Associated Domain:
   `applinks:abundant-smile-production-15a63da4.up.railway.app`.
3. Maneja enlaces recibidos en estos dos escenarios:
   - arranque en frío: la app estaba cerrada;
   - app abierta o en segundo plano.
4. Reconoce exclusivamente rutas con el formato `/i/:token`. No interpretes el
   token ni lo decodifiques; es un valor opaco.
5. Al recibirlo, navega a la pantalla existente de detalle/aceptación de
   invitación y consulta:

   ```http
   GET /api/v1/profile-invitations/:token
   ```

6. Muestra el nombre de quien invitó, el perfil compartido, el permiso de solo
   lectura y la fecha de expiración. La aceptación debe requerir confirmación
   explícita.
7. Si no existe una sesión autenticada, conserva el token de manera temporal,
   abre login/registro y retoma el flujo después de completar la autenticación.
   No aceptes automáticamente la invitación después del login.
8. Con sesión y confirmación del usuario, envía:

   ```http
   POST /api/v1/profile-invitations/:token/accept
   Authorization: Bearer <firebase-id-token>
   Content-Type: application/json

   {}
   ```

9. Después de aceptar, elimina el token pendiente, actualiza la lista de perfiles
   y navega al perfil indicado por `data.access.profileId`. Trata
   `alreadyAccepted: true` como resultado exitoso.
10. Impide que dos eventos del mismo enlace abran dos pantallas o envíen dos
    aceptaciones simultáneas.

## Privacidad y seguridad

- No imprimas el token en logs, reportes de errores o eventos de analítica.
- No agregues el enlace completo a analytics, porque contiene el token.
- No ejecutes `context.redirectPath` como una URL arbitraria.
- Borra el token temporal al aceptar, cancelar definitivamente o recibir un
  estado terminal.
- Conserva el token ante errores recuperables, renovación de sesión o reinicio
  controlado del flujo de autenticación.

## Errores que debe representar la interfaz

```text
INVITATION_NOT_FOUND          404
INVITATION_EXPIRED            410
INVITATION_REVOKED            410
INVITATION_ALREADY_ACCEPTED   409
OWN_PROFILE_INVITATION        409
AUTH_TOKEN_REQUIRED           401
AUTH_TOKEN_EXPIRED            401
```

Para `INVITATION_ALREADY_ACCEPTED`, informa que el enlace ya fue utilizado. Para
`AUTH_TOKEN_EXPIRED`, renueva la sesión y reintenta como máximo una vez.

## Datos que necesito del proyecto móvil

Al terminar, reporta estos valores para configurar Railway:

### Android

- Application/package ID definitivo.
- Huella SHA-256 del certificado de firma de producción de Google Play.
- Si se probará fuera de Play, huella SHA-256 del certificado usado para esa
  compilación.
- URL definitiva de Google Play, si ya existe.

### iOS

- Apple Team ID.
- Bundle ID definitivo.
- URL definitiva de App Store, si ya existe.

No coloques huellas o identificadores de ejemplo como si fueran valores reales.

## Pruebas y criterios de aceptación

Agrega pruebas, en el nivel adecuado para la arquitectura actual, que cubran:

1. Recepción de `/i/:token` con la app cerrada.
2. Recepción del enlace con la app abierta.
3. Usuario autenticado y no autenticado.
4. Retorno al flujo después de login o registro.
5. Enlace inválido, expirado, revocado y utilizado.
6. Aceptación exitosa e idempotente.
7. Compartir y copiar exactamente `invitation.shareUrl`.
8. El token no aparece en logs ni analytics.

Ejecuta formateo, análisis estático y pruebas. Al finalizar, explica los archivos
modificados, el mecanismo usado para recibir deep links y entrega los
identificadores Android/iOS necesarios para completar las variables del backend.
