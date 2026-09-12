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
| Access | Usuarios, MCPs y asignaciones; API de administración protegida | Memoria local / Netlify Blobs / Supabase |
| Registry | Descubre herramientas y sus destinos por MCP | En memoria |
| Router | Ejecuta una herramienta mediante su destino | Adaptador demo en memoria |
| Audit | Captura requests MCP sanitizados para el inspector admin; `computeAnalytics` deriva actividad por usuario/MCP del mismo buffer | Memoria local / Netlify Blobs / Supabase (últimos 200) |
| Platform | HTTP local, panel estático (pestañas Usuarios/MCPs/Logs) y handlers Netlify | Implementado |

## Contratos y límites

`core` depende de puertos (`IdentityResolver`, `PolicyService`, `AccessConfiguration`, `ToolRegistry`, `ToolRouter`, `AuditLog`), no de HTTP, Netlify, memoria o una base de datos. Los adaptadores actuales están reunidos en `src/bootstrap.ts` para que los reemplazos sean explícitos.

Esto permite que un adaptador PostgreSQL, un validador JWT, o un cliente Streamable HTTP upstream cambien en los bordes sin reescribir el caso de uso MCP.

## Flujo MVP

1. El adaptador HTTP entrega un `Request` dirigido a la única URL pública `/mcp` a `GatewayApplication`.
2. Core admite `server/discover` (MCP `2026-07-28`), `tools/list`, `tools/call` y conserva `initialize` para clientes previos.
3. Identity produce el principal y Policy obtiene exclusivamente sus MCPs habilitados y asignados.
4. Registry y Router federan esos MCPs: `tools/list` publica nombres con namespace `<mcp-interno>__<tool>` y `tools/call` envía la llamada al upstream correcto. Los IDs de MCP nunca se exponen en la URL pública.
5. Audit guarda decisiones de listado y llamada, aun las denegadas.
6. El panel estático usa `/admin/*` protegido por `ADMIN_API_KEY` para gestionar reglas y consultar eventos; la misma configuración se aplica a la siguiente llamada MCP.

## Persistencia con Supabase

`AccessStateStorage` y `AuditStorage` son los dos puertos de persistencia (`src/access/configuration.ts`, `src/audit/audit.ts`). `src/access/supabase.ts` y `src/audit/supabase.ts` son adaptadores que guardan el mismo JSON que usa el adaptador de Netlify Blobs, en dos tablas prefijadas `cria_gateway_*` (ver `supabase/migrations/0001_cria_gateway_persistence.sql`) para convivir sin colisión con tablas de otros proyectos en la misma instancia de Supabase.

`src/bootstrap.ts` los activa automáticamente cuando `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` están configuradas (local y Netlify); si no están, Netlify sigue usando Blobs y el desarrollo local usa memoria. RLS está habilitado sin políticas: solo `service_role` (usada server-side, nunca en el bundle del panel) puede leer o escribir esas filas.

## Forwarding remoto y sesiones

`DemoToolRouter.forward()` (`src/router/router.ts`) abre una sesión nueva contra el upstream en cada llamada: manda `initialize`, toma el header `Mcp-Session-Id` de la respuesta si el servidor lo devuelve, y lo reenvía en la llamada real (`tools/list`/`tools/call`). Esto es necesario porque algunos MCPs remotos (ej. los basados en el SDK oficial sobre Streamable HTTP, como servidores expuestos desde n8n) rechazan cualquier request antes de `initialize` con `400 Server not initialized`. El accept header hacia el upstream siempre es `application/json, text/event-stream` — nunca el que mandó el cliente original — porque varios de estos servidores devuelven `406` si falta alguno de los dos tipos. La respuesta puede venir como JSON plano o como `text/event-stream`; `parseRpcBody` en `src/core/gateway.ts` entiende ambos formatos para poder fusionar el `tools/list` de varios MCPs en una sola lista namespaced.

No hay caché de sesión entre llamadas (cada forward abre y descarta la suya), así que un MCP que dependa de estado de sesión persistente entre requests, o de un stream SSE largo con eventos push, no está cubierto todavía.

## Deliberadamente fuera del MVP

- OAuth/Supabase Auth (identidad sigue siendo `x-client-id`), sesiones persistentes y multi-tenant real.
- Autenticación/roles de administrador reales y auditoría con retención configurable.
- Sesión de Streamable HTTP cacheada entre llamadas y streams SSE largos hacia MCPs externos (hoy se abre una sesión nueva por request, ver "Forwarding remoto" abajo).
- Roles de administrador y dashboard seguro (la analítica por usuario/MCP ya está implementada, ver `GET /admin/analytics`).

El siguiente paso útil es sustituir identidad por JWT de Supabase Auth, conservando los contratos existentes.
