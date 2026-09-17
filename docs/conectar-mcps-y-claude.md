# Conectar MCPs y usuarios de Claude a CRIA

Esta guía corresponde a Docker/SQLite con credenciales de dispositivo. Sistemas instala el puente bajo la sesión del empleado, conectado a la VPN. La URL es común; cada computadora recibe una credencial individual. El ID del usuario ya no autentica conexiones.

## 1. Preparar el servidor

Seguir [instalación y backups](self-hosted.md). Mantener el HTTP interno restringido a loopback/red de contenedores. Publicar únicamente HTTPS en la interfaz VPN mediante un proxy confiable. Para el entorno local usar Caddy en `https://localhost:8443`; en la empresa usar el hostname y certificado corporativo correspondientes.

Crear un usuario habilitado en el HUB, registrar los MCPs y asignarlos al usuario. Las claves de los MCPs internos se guardan exclusivamente en el servidor. No distribuir la clave administrativa del HUB.

## 2. Emitir una credencial

En **Usuarios → Credenciales de dispositivos**:
1. Elegir el usuario y nombrar la computadora.
2. Elegir vigencia (90 días por defecto; máximo 365).
3. Generar la credencial. La key se muestra una sola vez y no se puede recuperar después.

SQLite guarda únicamente el hash SHA-256 de una key aleatoria de 256 bits, junto con su usuario, etiqueta, vencimiento, último uso y revocación. No se derivan keys del ID ni de contraseñas humanas.

## 3. Instalar el puente

En el HUB, dentro de **Usuarios → Credenciales de dispositivos → Instrucciones para Sistemas**, elegí macOS o Windows, completá la carpeta de instalación, URL HTTPS y perfil. El botón **Copiar comando** prepara la invocación para Terminal o PowerShell sin incluir la key. Usá exactamente la misma URL y perfil en Claude.

Instalar Node 24 y copiar juntos, en una carpeta estable:
- `scripts/claude-vpn-bridge.mjs`
- `scripts/credential-store.mjs`
- `scripts/enroll-device.mjs`
- `scripts/windows-credential-store.ps1` (necesario en Windows)

No requieren `npm install`. Ejecutar el alta desde una terminal interactiva, bajo la cuenta del empleado (no otra cuenta administrativa):

```sh
node /ruta/CRIA/enroll-device.mjs https://cria.empresa.interna/mcp notebook
```

Pegar la key en el campo oculto del terminal. Nunca pasarla como argumento, variable de entorno o archivo. El alta guarda la key en Llavero de macOS o Administrador de credenciales de Windows. Borrar el portapapeles después de instalar y cerrar el diálogo del HUB. La URL y el perfil identifican la credencial; cambiarlos requiere volver a darla de alta.

Windows usa `CredWriteW` con persistencia local para la cuenta actual. Las políticas corporativas deben permitir el script PowerShell; si bloquean su ejecución, Sistemas debe firmarlo/autorizarlo, sin desactivar globalmente la política. [API de Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew).

## 4. Configurar Claude Desktop

En **Desarrollador → Editar configuración**, agregar dentro de `mcpServers` conservando las demás entradas:

```json
{
  "mcpServers": {
    "cria": {
      "command": "/ruta/absoluta/node",
      "args": ["/ruta/CRIA/claude-vpn-bridge.mjs"],
      "env": {
        "CRIA_GATEWAY_URL": "https://cria.empresa.interna/mcp",
        "CRIA_CREDENTIAL_PROFILE": "notebook",
        "NODE_EXTRA_CA_CERTS": "/ruta/ca-corporativa.crt"
      }
    }
  }
}
```

Omitir `NODE_EXTRA_CA_CERTS` si el certificado ya es confiable para Node. En Windows usar rutas JSON como `C:\\Program Files\\nodejs\\node.exe`. En macOS, la configuración suele estar en `~/Library/Application Support/Claude/claude_desktop_config.json`; en Windows, `%APPDATA%\\Claude\\claude_desktop_config.json`.

El puente requiere HTTPS, no acepta `CRIA_CLIENT_ID` como alternativa y no sigue redirecciones. Para Caddy local usar exactamente `https://localhost:8443/mcp` y la CA pública extraída según la guía de instalación. Reiniciar Claude completamente: [Node lee la CA al arrancar](https://nodejs.org/download/release/v22.4.0/docs/api/cli.html#node_extra_ca_certsfile).

El formulario de conectores remotos no sirve para localhost/VPN: conecta desde Anthropic. La disponibilidad del MCP local en Cowork depende del cliente y las políticas de la organización; comprobarla en el equipo instalado.

## 5. Validar y operar

- Probar una herramienta de lectura de un MCP asignado. El tester de Logs permite seleccionar un usuario usando la autenticación administrativa del HUB: lista sus herramientas y registra una prueba administrativa. No comprueba la key ni la instalación del dispositivo, y no habilita identificación por ID en `/mcp`.
- Revisar el último uso por dispositivo. Los permisos se consultan en cada llamada.
- Revocar una credencial bloquea futuras solicitudes inmediatamente, sin afectar otros dispositivos. Una operación ya autorizada y en curso no se cancela.
- Deshabilitar/eliminar al usuario revoca permanentemente todas sus credenciales. Reactivarlo/recrearlo requiere keys nuevas.
- Para rotar: emitir nueva key, instalarla en el mismo perfil (reemplaza la anterior), probar y revocar la vieja.
- Para desinstalar: revocar en el HUB, quitar la entrada de Claude y ejecutar `node enroll-device.mjs URL perfil delete` bajo la cuenta del empleado. Eliminarla del almacén local no la revoca en el servidor.

## Diagnóstico

| Error | Revisar |
|---|---|
| Fallo de inicio | Rutas, Node, archivos del puente, URL HTTPS, perfil y credencial en la cuenta correcta. |
| Certificado no confiable | CA pública, hostname, `NODE_EXTRA_CA_CERTS` y reinicio completo. Nunca desactivar TLS. |
| HTTP 401 | Key ausente, inválida, vencida, revocada o usuario deshabilitado. |
| MCP access denied | Usuario autenticado sin MCPs asignados/accesibles. |
| Herramientas faltantes | Asignaciones y disponibilidad/credenciales del upstream desde Docker. |

## Límite de seguridad

Una key copiada se puede reutilizar hasta su revocación. El nombre del dispositivo no es una atestación de hardware. El almacén del sistema evita secretos en el JSON, pero no protege de malware o de un administrador del equipo. SSO, MFA y claves no exportables quedan fuera de esta etapa. La VPN no hace offline a Claude: los resultados de herramientas pueden llegar al proveedor del modelo.
