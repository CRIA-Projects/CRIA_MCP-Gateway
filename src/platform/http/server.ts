import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createGateway } from "../../bootstrap.js";

const app = createGateway();
const port = Number(process.env.PORT ?? 8787);
const staticAssets: ReadonlyMap<string, readonly [string, string]> = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]]
]);

createServer(async (req, res) => {
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
}).listen(port, () => console.log(`CRIA MCP Gateway listening on http://localhost:${port}`));
