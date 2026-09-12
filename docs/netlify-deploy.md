# Deploy en Netlify

## 1. Crear el sitio

En Netlify, elegí **Add new project** e importá `CRIA-Projects/CRIA_MCP-Gateway`. Netlify detecta `netlify.toml`; no sobrescribas estos valores:

- build command: `npm run build`
- publish directory: `public`
- functions directory: `netlify/functions`

## 2. Configurar variables

Antes del primer deploy, creá esta variable de entorno para Production (y Deploy Previews si vas a usarlos):

| Variable | Valor |
| --- | --- |
| `ADMIN_API_KEY` | Una clave aleatoria larga que vos conservás. Nunca uses `development-admin-key`. |

Opcionalmente, `MCP_GATEWAY_TRUSTED_CLIENT_ID` cambia la identidad que recibe una llamada MCP sin `x-client-id`; debe coincidir con un usuario habilitado y asignado en el admin.

Netlify Blobs no requiere variables adicionales: la función crea los stores `cria-mcp-access` y `cria-mcp-audit` automáticamente. Mantienen la configuración y los últimos 200 eventos entre deploys.

## 3. Comprobar el sitio

Después de publicar, abrí la URL de Netlify y escribí tu `ADMIN_API_KEY`.

1. Creá un usuario y un MCP remoto HTTPS, o usá `demo` para validar el recorrido.
2. Asigná el usuario al MCP.
3. Usá el bloque **Probar gateway público** o enviá una llamada JSON-RPC a `https://TU-SITIO.netlify.app/mcp`.
4. Abrí **Lo que llegó al gateway** para ver método, parámetros, headers seguros, usuario resuelto, MCP y resultado. Tokens, cookies y secretos se muestran como `[redacted]`.

`/mcp` es la única URL que se configura en el cliente MCP. Los IDs creados en el panel son internos: el gateway solo lista las herramientas de los MCPs asignados al usuario y las expone con namespace, por ejemplo `demo__demo.echo`.

## 4. Probar desde ChatGPT

Para observar primero el tráfico, configurá el endpoint remoto como `https://TU-SITIO.netlify.app/mcp`. El gateway implementa `server/discover` para la versión MCP `2026-07-28`. Las llamadas sin identidad propia se resuelven con `MCP_GATEWAY_TRUSTED_CLIENT_ID` y quedan visibles en el inspector de logs.

Esto es una prueba de transporte, no identidad individual: todos los clientes sin OAuth comparten ese principal de prueba. ChatGPT usa OAuth cuando una app necesita autenticar usuarios individualmente. Antes de dar acceso a usuarios reales, reemplazá `LocalIdentityResolver` por validación OAuth/Supabase Auth y no dejes ningún usuario de prueba asignado.

El forwarding remoto de este MVP usa JSON-RPC por POST, abriendo una sesión (`initialize` + `Mcp-Session-Id`) por llamada y aceptando respuestas JSON o `text/event-stream`. No cachea la sesión entre llamadas ni sostiene un stream largo (SSE push continuo), así que un upstream que dependa de eso todavía necesita una extensión antes de usarse en producción.
