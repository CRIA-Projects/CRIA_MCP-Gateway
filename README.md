# CRIA MCP Gateway

MVP de gateway MCP remoto, stateless y modular. Recibe llamadas MCP por HTTP, identifica al cliente, valida su acceso al MCP solicitado, resuelve la herramienta registrada, la enruta al adaptador correspondiente y registra la decisión.

Incluye un panel local de consulta en `/` con los MCPs registrados, usuarios habilitados y sus asignaciones. La configuración es deliberadamente estática durante esta fase; Supabase reemplazará esos adaptadores sin cambiar el core.

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

curl -X POST http://localhost:8787/mcp/demo \
  -H 'content-type: application/json' \
  -H 'x-client-id: ana' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Abrí `http://localhost:8787/` para ver el panel y probar la misma política desde el navegador. La configuración de desarrollo está en `src/access/configuration.ts`:

- usuarios: `local-development-client`, `ana`, `bruno` e `invitado`;
- MCPs: `demo` y `analysis`;
- asignaciones: cada usuario habilitado solo puede acceder a los MCPs que tiene asociados.

El endpoint heredado `/mcp` se mantiene como alias de `/mcp/demo`. Un MCP desconocido responde `404`; una identidad deshabilitada o sin asignación recibe el error JSON-RPC `MCP access denied`.

## Seguridad y siguiente etapa

`x-client-id` y el endpoint `/admin/config` son exclusivamente mecanismos de desarrollo: no son una autenticación ni un panel administrativo seguro. No los expongas públicamente. La siguiente integración debe reemplazar `StaticAccessConfiguration` por un repositorio Supabase y `LocalIdentityResolver` por validación de JWT de Supabase Auth. Después podrá añadirse CRUD de MCPs, usuarios y asignaciones al panel.

## Scripts

```bash
npm run dev     # servidor HTTP con recarga
npm run build   # compila a dist/
npm test        # pruebas del flujo esencial
npm run check   # chequeo de tipos
```

## Despliegue posterior

Netlify publica `public/` como panel estático y sus funciones redirigen `/mcp/{id}`, `/admin/config` y `/health` hacia la misma aplicación. `netlify/functions/mcp.ts` es solamente un adaptador de transporte: la lógica no conoce Netlify. Configurá las variables de `.env.example` como variables del sitio y publicá con el flujo habitual de Netlify.

Más contexto en [docs/architecture.md](docs/architecture.md).
