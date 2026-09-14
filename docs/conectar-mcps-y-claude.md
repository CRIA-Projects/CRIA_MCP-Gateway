# Conectar MCPs y usuarios de Claude a CRIA

Instructivo para la edición permanente `docker`, instalada en una red privada o VPN. Para preparar el servidor, primero seguir [Instalación Docker + SQLite](self-hosted.md).

## 1. Qué se conecta con qué

Claude Desktop ejecuta el puente local de CRIA en la computadora del usuario. El puente envía el ID al gateway por la VPN. El gateway consulta las asignaciones del HUB y se conecta únicamente a los MCPs permitidos para ese usuario.

Se configura **una sola conexión CRIA en Claude**, no una por cada MCP interno. Todos los usuarios pueden usar la misma URL, terminada en `/mcp`; cambia su ID.

Los conectores remotos agregados por URL en Claude salen desde la nube de Anthropic, no desde la VPN de la computadora. Por eso este instructivo usa la configuración MCP local de Claude Desktop, no el formulario web de conectores. Esta configuración local no se traslada a claude.ai ni Cowork. [Documentación de Anthropic](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## 2. Qué claves van en cada lugar

| Dato | Quién lo proporciona | Dónde se coloca | ¿Va en Claude? |
| --- | --- | --- | --- |
| `ADMIN_API_KEY` | Administrador de la instalación | `.env.docker` del servidor y acceso administrativo al HUB | No |
| Token o API key del MCP interno | Administrador/proveedor de ese MCP | Autenticación de ese MCP en el HUB | No |
| URL del gateway | Administrador de CRIA | `CRIA_GATEWAY_URL` en la configuración local | Sí |
| ID del usuario del HUB | Administrador de CRIA | `CRIA_CLIENT_ID` en la configuración local | Sí, pero no es una contraseña |
| Credenciales VPN | Equipo de sistemas del cliente | Aplicación de VPN de la computadora/servidor | No |

No necesitás una API key de Anthropic para este puente: usás tu sesión normal de Claude Desktop. No pegues claves en el chat. Tampoco distribuyas `ADMIN_API_KEY` a los usuarios: permite administrar toda la instalación.

**Importante sobre “Client ID”:** `CRIA_CLIENT_ID` es una variable de nuestro puente, que genera el header HTTP `x-client-id`. No es el campo OAuth Client ID del formulario de conectores de Claude. Esta edición no implementa OAuth ni requiere un OAuth Client Secret. Si estás completando esos campos, no estás usando el procedimiento local de esta guía.

## 3. Administrador: registrar los MCPs en el HUB

1. Conectate a la VPN y abrí el HUB en la URL que publicó sistemas, por ejemplo `https://cria.interno.example/`.
2. Ingresá la clave administrativa configurada como `ADMIN_API_KEY` en el servidor.
3. En **MCPs**, creá un MCP con nombre identificable, por ejemplo `A30`.
4. Ingresá la URL HTTPS del endpoint MCP real, proporcionada por su administrador. No es la URL del panel de n8n ni una API REST cualquiera. El gateway no instala ni publica ese MCP por vos.
5. Elegí la autenticación que realmente exige ese endpoint:
   - **Ninguna:** solo si el MCP no exige credenciales.
   - **Token Bearer:** cargá el token del MCP en el campo de autenticación. La petición al MCP debe llevar `Authorization: Bearer <token-del-mcp>`.
   - **Header personalizado:** cargá el nombre exacto, por ejemplo `X-API-Key`, y el valor que te entregaron. No agregues `Bearer` si ese proveedor no lo pide.
6. Guardá y repetí con los demás MCPs.

Usá credenciales con los permisos mínimos necesarios. No uses la clave administrativa de CRIA como token del MCP. Estas credenciales se guardan en SQLite y se usan desde el gateway; no se copian a la configuración de Claude. Un mismo registro MCP comparte su credencial upstream entre los usuarios autorizados: no hay login independiente de cada usuario en el proveedor.

El servidor Docker debe poder alcanzar esos endpoints. Que tu navegador alcance un MCP no demuestra que el contenedor tenga sus rutas, DNS y certificados. La edición actual registra MCPs remotos HTTPS; no permite pegar un comando `npx` o `stdio` como URL en el HUB. Si el proveedor exige un flujo OAuth interactivo, esa integración no está resuelta por estos campos.

## 4. Administrador: crear usuarios y asignar permisos

1. En **Usuarios**, creá o seleccioná al usuario y dejalo habilitado.
2. Copiá su **ID exacto** del HUB, no su nombre visible. Ejemplo ficticio: `usuario-ventas`.
3. Asignale los MCPs que puede usar. Crear un MCP no lo habilita automáticamente para todos.
4. En **Probar gateway público**, elegí ese mismo usuario y presioná **Listar tools**.
5. Verificá en los logs que `clientId` coincida y que la respuesta incluya las herramientas esperadas.

Tres MCPs no necesariamente son tres herramientas: si Demo publica una, Análisis una y A30 tres, Claude debería recibir **cinco herramientas**, reunidas bajo la conexión CRIA. Los nombres pueden verse como `a30__Reporte_Resumen_Final`.

Entregale a cada usuario solamente la URL del gateway, su ID y el archivo `scripts/claude-vpn-bridge.mjs` de esta rama. Si hay una CA corporativa, entregá también el certificado público de CA aprobado por sistemas; nunca su clave privada.

## 5. Usuario: preparar la computadora

1. Conectate a la VPN del cliente.
2. Instalá Node.js 24 y comprobá `node --version` en una terminal.
3. Guardá `claude-vpn-bridge.mjs` en una carpeta estable. No necesita `npm install` ni Docker en tu computadora.
4. Obtené la ruta absoluta de Node: en macOS, `command -v node`; en PowerShell, `(Get-Command node).Source`.
5. Pedile al administrador la URL privada y tu ID exacto. `localhost` o `127.0.0.1` apuntan a tu computadora, no al servidor remoto; usalos solo si tenés allí el gateway o un túnel configurado.

## 6. Usuario: configurar Claude Desktop

Abrí los ajustes de la aplicación de escritorio, **Developer / Desarrollador → Edit Config / Editar configuración**. El archivo suele estar en las siguientes ubicaciones; preferí abrirlo desde la aplicación si tu instalación usa otra ruta. [Guía oficial de MCP para Claude Desktop](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`.
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`.

Hacé una copia de ese archivo antes de editarlo. Si ya tiene servidores u otras opciones, conserválos y agregá solamente `cria-vpn` dentro del objeto `mcpServers` existente. No crees dos claves `mcpServers`.

### Ejemplo macOS

```json
{
  "mcpServers": {
    "cria-vpn": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/ana/CRIA/claude-vpn-bridge.mjs"],
      "env": {
        "CRIA_GATEWAY_URL": "https://cria.interno.example/mcp",
        "CRIA_CLIENT_ID": "usuario-ventas"
      }
    }
  }
}
```

### Ejemplo Windows

```json
{
  "mcpServers": {
    "cria-vpn": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\ana\\CRIA\\claude-vpn-bridge.mjs"],
      "env": {
        "CRIA_GATEWAY_URL": "https://cria.interno.example/mcp",
        "CRIA_CLIENT_ID": "usuario-ventas"
      }
    }
  }
}
```

Los ejemplos tienen rutas y dominios ficticios: reemplazá `command` por la ruta que obtuviste, `args` por donde guardaste el archivo, la URL por la que te entregaron y el ID por el tuyo. Conservá las dobles barras de Windows para que el JSON sea válido. No uses `~` ni variables de terminal dentro de las rutas JSON.

Si el gateway usa HTTPS con CA privada, sistemas debe agregar en `env` una propiedad `NODE_EXTRA_CA_CERTS` con la ruta absoluta al certificado de CA de esa computadora. No desactives la verificación TLS. Si sistemas publicó HTTP directamente sobre una VPN cifrada, usá la URL HTTP y puerto que te indiquen; cambiar `http` por `https` en el texto no configura TLS en el servidor.

Guardá, cerrá completamente Claude Desktop y volvé a abrirlo. Buscá `cria-vpn` entre sus herramientas/conexiones locales y habilitá su uso cuando lo solicite. Si la organización bloquea servidores locales, sistemas debe autorizar este mecanismo. [Configuración y reinicio de servidores locales](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

## 7. Comprobar que funciona y actualizar permisos

Pedile a Claude una operación de lectura concreta de un MCP que tengas asignado, por ejemplo consultar un reporte para una fecha; evitá acciones con efectos reales como primera prueba. Revisá y aprobá la llamada si corresponde. El administrador debe comprobar en los logs del HUB que la petición llegó con tu ID.

Cuando se agregue otro MCP, el administrador lo registra, lo asigna al usuario y prueba el listado desde el HUB. **No se cambia la URL ni se agregan más claves en Claude.** El gateway evalúa los permisos vigentes en cada listado y llamada. Si Claude conserva el catálogo anterior, cerralo completamente, volvé a abrirlo y probá en una conversación nueva; no supongas que la pantalla se actualiza automáticamente. Una revocación se aplica en el gateway incluso si Claude todavía muestra una herramienta vieja.

## 8. Problemas frecuentes

| Síntoma | Qué revisar |
| --- | --- |
| No aparece `cria-vpn` | JSON válido, rutas absolutas de Node y del archivo, permisos de servidores locales y reinicio completo de Claude. |
| Error de conexión o timeout | VPN activa, URL y puerto correctos, DNS y rutas. Si no llega ningún log al HUB, revisar primero la conexión local. |
| Error de certificado | CA corporativa en la computadora y/o contenedor, según cuál conexión falle. No usar opciones para ignorar TLS. |
| `MCP access denied` | ID exacto, usuario habilitado y asignaciones. Con la configuración Docker predeterminada, sin ID se deniega el acceso. |
| Aparecen solo algunas herramientas | Comparar `tools/list` del HUB para el mismo usuario, revisar avisos de MCPs fallidos y logs; comprobar token y disponibilidad del upstream desde el servidor. Luego reiniciar Claude si su catálogo quedó viejo. |
| 401/403 de un MCP interno | Credencial y modalidad de autenticación de ese MCP en el HUB, no la clave de Claude. |
| No puedo administrar el HUB | Revisar `ADMIN_API_KEY` de esa instalación; el ID de usuario no sirve como clave administrativa. |
| El MCP funciona en otra computadora | Comparar ID, permisos, ruta del puente, VPN y CA. No copiar claves administrativas como solución. |

Para problemas del puente, consultar los logs MCP de Claude: `~/Library/Logs/Claude` en macOS o `%APPDATA%\Claude\logs` en Windows. Buscar `mcp.log` y `mcp-server-cria-vpn.log`. Antes de compartir logs, revisar y ocultar información sensible. [Ubicación de logs y diagnóstico](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

## 9. Límites de seguridad de esta edición

`CRIA_CLIENT_ID` / `x-client-id` identifica la configuración declarada por el cliente, no autentica a una persona: quien pueda editarla puede indicar otro ID. Las asignaciones filtran herramientas, pero el ID por sí solo no sirve como control de identidad frente a usuarios no confiables. Para ese escenario hay que incorporar autenticación verificada antes de distribuirlo como solución segura multiusuario.

El gateway y SQLite quedan en la red privada; eso no convierte Claude en un modelo offline. Las herramientas pueden devolver información a Claude y, por lo tanto, a Anthropic. Sistemas debe aprobar qué datos pueden salir y qué acciones permite cada MCP. Mantener el HUB restringido a administradores y proteger la base y sus backups, que contienen credenciales de los MCPs.
