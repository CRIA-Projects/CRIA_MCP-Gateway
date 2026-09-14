import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createStandaloneRuntime } from "../standalone.js";

process.umask(0o077);
const runtime = await createStandaloneRuntime();
const app = runtime.app;
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 0 || port > 65535) { runtime.close(); throw new Error("Invalid PORT"); }
const staticAssets: ReadonlyMap<string, readonly [string, string]> = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]]
]);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const asset = req.method === "GET" ? staticAssets.get(url.pathname) : undefined;
    if (asset) {
      try {
        const body = await readFile(resolve(process.cwd(), "public", asset[0]));
        res.writeHead(200, { "content-type": asset[1], "cache-control": "no-store" });
        res.end(body);
      } catch {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Static panel asset could not be loaded" }));
      }
      return;
    }
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : req;
    const response = await app.handleRequest(new Request(url, { method: req.method, headers: req.headers as HeadersInit, body: body as BodyInit | undefined, duplex: body ? "half" : undefined } as RequestInit));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    // Do not expose upstream credentials, request bodies or database details.
    console.error("Gateway request failed");
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});
server.on("error", () => { console.error("HTTP listener failed"); runtime.close(); process.exitCode = 1; });
server.listen(port, host, () => {
  const address = server.address();
  console.log(`CRIA MCP Gateway listening on http://${host}:${typeof address === "object" && address ? address.port : port}`);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 25_000);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); runtime.close(); });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
