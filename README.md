# SaluBack

Backend para un sistema privado de seguimiento de salud personal y familiar. En
su primera versión, cada usuario adulto administra exclusivamente su perfil y su
historial de presión arterial y glucosa.

El proyecto se encuentra en fase de definición. Antes de implementar nuevas
funciones, la referencia principal es:

- [Especificación inicial](docs/especificacion-inicial.md)
- [Propuesta de producto e ideas](docs/propuesta-de-producto.md)

## Estado actual

- Servidor mínimo con Node.js y Express.
- Modelo conceptual documentado, todavía sin persistencia implementada.
- Usuarios de prueba previstos para crearse manualmente en PostgreSQL.
- Sin autenticación real; Firebase Authentication queda para una fase posterior.

## Principio del producto

Cada medición pertenece a un perfil. En el MVP, cada usuario es dueño de un único
perfil personal y sólo puede operar sobre sus propios datos. El acceso familiar
compartido se diseñará en una fase posterior.

