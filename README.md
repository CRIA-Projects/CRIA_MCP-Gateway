# CRIA MCP Gateway

MVP de gateway MCP remoto, stateless y modular. Expone un único servidor MCP público, identifica al cliente, reúne solo las herramientas de los MCPs que tiene habilitados, enruta cada llamada al upstream correspondiente y registra la decisión.

Incluye un panel administrativo en `/` para gestionar MCPs, usuarios y asignaciones, junto con un inspector de requests que muestra qué recibe el gateway. En Netlify los datos y los últimos eventos se guardan persistentemente con Netlify Blobs.

## Ejecutar localmente

```bash
cp .env.example .env
npm install
npm run dev
```

El servidor queda en `http://localhost:8787` por defecto.

```bash
curl http://localhost:8787/health

curl http://localhost:8787/admin/config

curl -X POST http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -H 'x-client-id: ana' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Abrí `http://localhost:8787/` e ingresá `development-admin-key` para usar el panel local. La configuración inicial de desarrollo está en `src/access/configuration.ts`:

- usuarios: `local-development-client`, `ana`, `bruno` e `invitado`;
- MCPs: `demo` y `analysis`;
- asignaciones: cada usuario habilitado solo puede acceder a los MCPs que tiene asociados.

La única URL MCP pública es `/mcp`: los IDs de los MCPs registrados son internos y no forman parte de la ruta. El gateway responde `server/discover` para el protocolo `2026-07-28`; en `tools/list` publica herramientas con namespace, por ejemplo `demo__demo.echo`. Una identidad deshabilitada o sin asignación recibe el error JSON-RPC `MCP access denied`.

## Administración y logs

El panel solicita `ADMIN_API_KEY` y la envía únicamente a los endpoints `/admin/*`; la clave no se empaqueta en los assets estáticos. Está organizado en tres pestañas — Usuarios, MCPs y Logs — y desde ahí se puede:

- crear, editar, habilitar/deshabilitar y eliminar usuarios; ver su actividad reciente (requests, permitidos/denegados/errores, MCP más usado, última vez visto);
- crear, editar y eliminar MCPs demo o remotos HTTPS (con un header `Authorization` opcional por MCP para integraciones que lo requieran); ver su uso reciente (llamadas, tool más usada, tasa de error, último uso);
- asignar o revocar acceso usuario→MCP;
- inspeccionar los últimos 100 requests MCP, con JSON-RPC, parámetros, headers seguros, resultado y timestamp.

La analítica por usuario y por MCP (`GET /admin/analytics`) se calcula en el momento a partir del mismo buffer de auditoría (últimos 200 eventos) — no es un historial persistente aparte.

Los valores de `Authorization`, cookies, tokens, claves y secretos se redactan en el log. Los argumentos de tools pueden contener datos de usuario: el inspector debe estar restringido al administrador.

## Seguridad y siguiente etapa

`x-client-id` sigue siendo exclusivamente un mecanismo de desarrollo y no identifica de manera segura al usuario MCP. El panel usa una clave compartida como límite mínimo de MVP; para producción pública, reemplazalo por Supabase Auth, roles de administrador y JWT validados en `LocalIdentityResolver`. El forwarding remoto actual cubre JSON-RPC por POST; Streamable HTTP con sesiones/SSE es una extensión posterior.

## Scripts

```bash
npm run dev     # servidor HTTP con recarga
npm run build   # compila a dist/
npm test        # pruebas del flujo esencial
npm run check   # chequeo de tipos
```

## Persistencia con Supabase

Por defecto, la configuración de acceso y el log de auditoría se guardan en memoria (local) o en Netlify Blobs (deploy). Para usar en su lugar un proyecto Supabase existente (aunque ya tenga tablas de otras apps):

1. Corré `supabase/migrations/0001_cria_gateway_persistence.sql` en el **SQL Editor** de tu proyecto Supabase. Crea dos tablas prefijadas `cria_gateway_access_state` y `cria_gateway_audit_events` con RLS habilitado y sin políticas públicas, así conviven sin tocar las tablas de otros proyectos ni quedar expuestas por `anon`/`authenticated`.
2. Completá en `.env` (local) y en las variables de entorno del sitio (Netlify, para producción):
   ```
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   `SUPABASE_SERVICE_ROLE_KEY` es la clave `service_role` del proyecto (Project Settings → API). Es secreta: no la commitees ni la expongas en el bundle del panel.
3. Con ambas variables presentes, `src/bootstrap.ts` usa automáticamente los adaptadores Supabase (`src/access/supabase.ts`, `src/audit/supabase.ts`) tanto en `npm run dev` como en Netlify; sin ellas, el comportamiento actual (memoria / Netlify Blobs) no cambia.

## Despliegue posterior

Netlify publica `public/` como panel estático y sus funciones redirigen `/mcp`, `/admin/*` y `/health` hacia la misma aplicación. La función compone adaptadores Netlify Blobs (o Supabase, ver arriba) para mantener configuración y logs entre invocaciones y deploys. Antes de desplegar, configurá una `ADMIN_API_KEY` aleatoria en las variables del sitio; nunca uses el valor de desarrollo.

Seguí el [checklist de deploy en Netlify](docs/netlify-deploy.md), que incluye la prueba desde ChatGPT y el límite explícito del principal de prueba hasta incorporar OAuth/Supabase Auth.

Más contexto en [docs/architecture.md](docs/architecture.md).
