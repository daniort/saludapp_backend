# Alias para perfiles familiares

Cada persona vinculada a un perfil puede asignarle un nombre corto para identificarlo en su propia aplicación y en las notificaciones push. El alias pertenece al vínculo usuario–perfil: una misma persona puede aparecer como “Mamá” para un familiar y como “Ana” para otro.

## Actualizar o quitar el alias

`PATCH /api/v1/profiles/:profileId/alias`

Requiere bearer token. El usuario autenticado solo modifica el alias de su propio vínculo activo con ese perfil.

```json
{ "displayAlias": "Mamá" }
```

Enviar `null` elimina el alias:

```json
{ "displayAlias": null }
```

El alias admite de 1 a 80 caracteres. La respuesta es:

```json
{
  "data": {
    "alias": {
      "profileId": "uuid",
      "displayAlias": "Mamá"
    }
  }
}
```

`GET /api/v1/profiles` y `GET /api/v1/profiles/:profileId` incluyen `displayAlias`. Si no se configuró, el valor es `null`.

## Notificaciones

Al registrar una lectura, el backend envía a cada instalación del familiar el nombre de ese perfil según su alias. Por ejemplo: `Hay una nueva medición de 'Mamá'.` Si no hay alias, usa el nombre completo del perfil; si tampoco está disponible, usa `un familiar`.

Los recordatorios de medicamentos y citas médicas quedan en standby; este cambio solo personaliza las notificaciones de nuevas mediciones.
