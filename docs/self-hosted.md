# CRIA en Docker y redes privadas

Edición de una instancia por cliente. Incluye HUB, `/mcp`, permisos por ID y SQLite en disco local. No requiere Netlify ni Supabase. No instala una VPN: el servidor y las computadoras deben tener conectividad VPN, DNS y rutas configuradas por el cliente.

La rama permanente `docker` mantiene esta edición en paralelo a `main` (edición Netlify). No es una feature destinada a fusionarse completa en `main`. Los cambios de esta distribución y sus PRs deben partir de `docker` y apuntar a `docker`; las correcciones compartidas se portan de forma selectiva y se validan en cada edición.

## Instalación

Requisitos: servidor Linux con Docker Engine y Compose v2 (con `up --wait`), disco local persistente y acceso a los MCPs internos por HTTPS. Las imágenes Node oficiales permiten construir para amd64 y arm64. No colocar SQLite en NFS/SMB ni ejecutar réplicas compartiendo el archivo.

```sh
git clone --branch docker https://github.com/CRIA-Projects/CRIA_MCP-Gateway.git
cd CRIA_MCP-Gateway
cp .env.docker.example .env.docker
openssl rand -hex 32
```

Pegá el secreto generado como `ADMIN_API_KEY` en `.env.docker` (mínimo 32 caracteres). Este archivo está ignorado por Git y excluido del build. No se imprime ni se incorpora al frontend. El secreto permite administrar todos los usuarios, permisos y credenciales de esa instalación.

```sh
docker compose --env-file .env.docker up -d --build --wait
docker compose --env-file .env.docker ps
curl http://127.0.0.1:8787/health
```

Abrí `http://127.0.0.1:8787/` desde el servidor o mediante un túnel seguro. Ingresá la clave, creá usuarios y MCPs, y asigná accesos. La base inicial está vacía; no hay usuarios ni permisos de demostración. El ID existente se usa desde el tester o desde el puente local.

SQLite se crea automáticamente en `/data/gateway.sqlite`, dentro del volumen `gateway-data` de Compose. Conserva configuración, credenciales de upstreams y los últimos 200 eventos; el archivo no forma parte de la imagen. Los cambios en configuración son transaccionales. La auditoría es un historial operativo acotado, no un registro de cumplimiento a largo plazo.

## Exponer exclusivamente en la VPN

`CRIA_BIND_ADDRESS=127.0.0.1` es el valor inicial. Podés:

- Mantener loopback y colocar el proxy HTTPS del cliente delante, escuchando solo en su IP de VPN.
- Definir `CRIA_BIND_ADDRESS` como la IP de la interfaz VPN del servidor, por ejemplo `10.8.0.10`, y recrear el contenedor. El servidor debe tener esa IP asignada antes del arranque. No usar `0.0.0.0` si se pretende evitar publicación en otras interfaces.

El tráfico directo en el puerto 8787 es HTTP. Para acceso directo debe viajar por una VPN cifrada y confiable; HTTPS con la CA corporativa es preferible. Verificá desde una máquina fuera de la VPN que no haya acceso. Las reglas de firewall deben contemplar la publicación de puertos de Docker.

El contenedor escucha en `0.0.0.0` internamente; la IP publicada se limita desde Compose. La VPN del host no garantiza automáticamente que un contenedor alcance las subredes internas: probar DNS, rutas y firewall desde el contenedor. No se habilita `network_mode: host` ni modo privilegiado. Se puede agregar `dns` o `extra_hosts` en un override administrado por el cliente.

Los endpoints de MCPs registrados siguen requiriendo HTTPS. Para una CA privada, montá el certificado de CA como solo lectura y configurá `NODE_EXTRA_CA_CERTS` con su ruta dentro del contenedor. No desactives la validación TLS. El HUB usa fuentes e íconos externos como decoración: si la red no tiene salida, funcionan las fuentes de respaldo, pero esos recursos visuales pueden no cargar.

## Claude Desktop dentro de la VPN

Un conector remoto agregado por URL a Claude se ejecuta desde la nube de Anthropic, incluso en Desktop. No puede acceder directamente a una dirección exclusiva de tu VPN. Esta edición proporciona un puente **local stdio** para la configuración local de Claude Desktop; no se agrega como conector web. [Referencia de Anthropic](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

1. En cada computadora conectada a la VPN, instalá Node 24 y copiá `scripts/claude-vpn-bridge.mjs` a una ubicación estable. No necesita `npm install`.
2. En la configuración de servidores MCP locales de Claude Desktop, agregá este fragmento, conservando las demás entradas. Reemplazá las rutas absolutas y la URL privada según el cliente:

```json
{
  "mcpServers": {
    "cria-vpn": {
      "command": "/ruta/absoluta/a/node",
      "args": ["/ruta/absoluta/claude-vpn-bridge.mjs"],
      "env": {
        "CRIA_GATEWAY_URL": "https://cria.interno.example/mcp",
        "CRIA_CLIENT_ID": "usuario-del-hub"
      }
    }
  }
}
```

En Windows, usar rutas como `C:\\Program Files\\nodejs\\node.exe`. Para HTTPS corporativo, agregar `NODE_EXTRA_CA_CERTS` con la ruta local del certificado de CA. Reiniciar Claude Desktop después de modificar la configuración. Validar en los logs del HUB que llegue el ID configurado.

El puente transmite `x-client-id`, `initialize`, `notifications/initialized`, `tools/list` y `tools/call` por la VPN. No requiere URLs distintas para cada usuario. Soporta respuestas JSON y SSE asociadas a una llamada; no es un cliente MCP general con sampling, elicitation o suscripciones persistentes.

La identificación por ID mantiene el comportamiento de desarrollo aceptado para la red confiable: el usuario puede editar su ID local; no es autenticación de personas. El gateway aplica las asignaciones en cada listado y llamada. Un request sin ID queda denegado salvo que el administrador configure explícitamente `MCP_GATEWAY_TRUSTED_CLIENT_ID`. Que el gateway esté en la VPN no significa que las respuestas del modelo sean offline: los resultados que use Claude pueden llegar a Anthropic.

## Backups y restauración

La configuración guarda credenciales de MCPs. Restringí el acceso al volumen y cifrá los backups fuera del servidor. La imagen corre con el usuario `node` (UID 1000); el archivo SQLite se crea con permisos 0600. Los bind mounts manuales deben permitir escritura a ese UID.

Crear un snapshot consistente mientras el servicio sigue activo (usar un nombre nuevo cada vez):

```sh
docker compose --env-file .env.docker exec gateway node scripts/backup-sqlite.mjs /data/backups/snapshot-001.sqlite
mkdir -p backups
docker compose --env-file .env.docker cp gateway:/data/backups/snapshot-001.sqlite ./backups/snapshot-001.sqlite
```

El script usa la API de backup de SQLite e incluye los cambios confirmados en WAL; rechaza sobrescribir un backup existente. Si falla, no usar el archivo incompleto y repetir con otro nombre. Guardar una copia fuera del host. No copiar solamente `gateway.sqlite` mientras está en uso: puede faltar contenido del WAL.

Para restaurar, crear un **volumen nuevo** y conservar el anterior. Ejemplo con los nombres de imagen y backup del documento:

```sh
docker volume create cria-restored-001
docker run --rm --mount type=volume,src=cria-restored-001,dst=/data --mount type=bind,src="$(pwd)/backups",dst=/backup,readonly cria-mcp-gateway:local node -e 'const fs=require("node:fs");fs.copyFileSync("/backup/snapshot-001.sqlite","/data/gateway.sqlite",fs.constants.COPYFILE_EXCL);fs.chmodSync("/data/gateway.sqlite",0o600)'
docker compose --env-file .env.docker stop gateway
```

Agregar `CRIA_RESTORE_VOLUME=cria-restored-001` a `.env.docker` y arrancar con el override:

```sh
docker compose --env-file .env.docker -f compose.yaml -f compose.restore.yaml up -d --force-recreate --wait
```

Verificar usuarios, asignaciones, listado de herramientas y logs. Desde ese momento, usar ambos archivos Compose en todos los comandos de operación. Para volver al volumen original, detener usando ambos archivos y arrancar usando solo `compose.yaml`. El volumen anterior sigue intacto. No usar `down -v` en instalaciones de clientes: elimina los volúmenes administrados por Compose.

## Actualizaciones y rollback

Crear un backup antes de actualizar. Usar una etiqueta de imagen distinta por versión (`CRIA_IMAGE`) y conservar la anterior. Construir la nueva imagen y ejecutar `up -d --wait`. El schema SQLite v1 se crea de manera transaccional y se conserva en los reinicios; esta versión rechaza abrir schemas futuros. No hay importación automática de Netlify Blobs o Supabase.

Si la actualización cambió el schema, restaurar el snapshot en otro volumen y usar la imagen anterior. Si no hubo cambios incompatibles, se puede volver a la imagen anterior con el mismo volumen. No hacer downgrade de schema sobre la única copia de datos.

## Validación de la distribución

```sh
npm ci
npm run check
npm test
npm run test:docker
```

El último comando requiere Docker y Compose: construye una imagen, crea un proyecto y un volumen de prueba únicos, verifica acceso, backup y recreación del contenedor, y borra solo ese proyecto de prueba al terminar. GitHub Actions ejecuta estas mismas comprobaciones. No publica imágenes ni despliega a clientes.

Node 24 incluye `node:sqlite`, todavía experimental en algunas versiones de esa línea. Se encapsula en el adaptador local y se verifica en CI; fijar el tag/digest de la imagen Node al emitir una versión comercial. El build descarga paquetes e imagen base; el funcionamiento del gateway y SQLite no depende de servicios cloud una vez instalado.
