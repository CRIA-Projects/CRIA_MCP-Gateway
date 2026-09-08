# Arquitectura — CRIA MCP Gateway MVP

## Decisión

Usamos un **monolito modular**. Es una sola unidad desplegable, pero cada responsabilidad tiene su contrato y depende de abstracciones. Es el equivalente a un pequeño motor de juego: el loop central no sabe si el input viene de teclado, red o replay; consume una interfaz.

```text
HTTP / Netlify adapter
        │
        ▼
      Core (JSON-RPC + casos de uso)
   ┌────┼─────┬─────────┬────────┬────────┐
Identity Policy Access   Registry Router  Audit
                         │
                    MCP upstream adapter
```

## Módulos

| Módulo | Responsabilidad | Estado MVP |
| --- | --- | --- |
| Core | Orquesta requests MCP y respuestas JSON-RPC | Implementado |
| Identity | Resuelve el principal de un request | Adaptador local simple |
| Policy | Decide si un principal habilitado puede usar un MCP | Asignaciones estáticas, deny-by-default |
| Access | Usuarios, MCPs y asignaciones; API de administración protegida | Memoria local / Netlify Blobs |
| Registry | Descubre herramientas y sus destinos por MCP | En memoria |
| Router | Ejecuta una herramienta mediante su destino | Adaptador demo en memoria |
| Audit | Captura requests MCP sanitizados para el inspector admin | Memoria local / Netlify Blobs (últimos 200) |
| Platform | HTTP local, panel estático y handlers Netlify | Implementado |

## Contratos y límites

`core` depende de puertos (`IdentityResolver`, `PolicyService`, `AccessConfiguration`, `ToolRegistry`, `ToolRouter`, `AuditLog`), no de HTTP, Netlify, memoria o una base de datos. Los adaptadores actuales están reunidos en `src/bootstrap.ts` para que los reemplazos sean explícitos.

Esto permite que un adaptador PostgreSQL, un validador JWT, o un cliente Streamable HTTP upstream cambien en los bordes sin reescribir el caso de uso MCP.

## Flujo MVP

1. El adaptador HTTP entrega un `Request` dirigido a `/mcp/{mcp-id}` a `GatewayApplication`.
2. Core valida que el MCP exista y admite `initialize`, `tools/list` y `tools/call`.
3. Identity produce el principal y Policy verifica que esté habilitado y asignado al MCP solicitado.
4. Registry devuelve solo las herramientas de ese MCP; Router ejecuta mediante su adaptador.
5. Audit guarda decisiones de listado y llamada, aun las denegadas.
6. El panel estático usa `/admin/*` protegido por `ADMIN_API_KEY` para gestionar reglas y consultar eventos; la misma configuración se aplica a la siguiente llamada MCP.

## Deliberadamente fuera del MVP

- OAuth/Supabase Auth, sesiones persistentes y multi-tenant real.
- PostgreSQL/Supabase, colas y retención de auditoría.
- Autenticación/roles de administrador reales y auditoría con retención configurable.
- Proxy Streamable HTTP real hacia MCPs externos.
- Roles de administrador, dashboard seguro, analytics y microservicios.

El siguiente paso útil es sustituir **un** adaptador por vez (primero identidad con JWT de Supabase Auth, luego configuración persistente), conservando los contratos.
