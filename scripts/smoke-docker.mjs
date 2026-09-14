import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);
// Isolated project and disposable volume: never targets a customer's stack.
const project = `cria-smoke-${randomUUID().slice(0, 8)}`;
const key = randomUUID() + randomUUID();
const env = { ...process.env, ADMIN_API_KEY: key, CRIA_PORT: "0", CRIA_BIND_ADDRESS: "127.0.0.1", CRIA_IMAGE: `${project}:test`, MCP_GATEWAY_TRUSTED_CLIENT_ID: "" };
const compose = (...args) => exec("docker", ["compose", "-p", project, "-f", "compose.yaml", ...args], { env, maxBuffer: 10 * 1024 * 1024 });
let target;
async function api(path, body, method = "POST", identity) {
  const response = await fetch(target + path, { method: body === undefined ? "GET" : method, headers: { "content-type": "application/json", "x-admin-key": key, ...(identity ? { "x-client-id": identity } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}
try {
  await compose("up", "--build", "-d", "--wait", "--wait-timeout", "120");
  target = "http://" + (await compose("port", "gateway", "8787")).stdout.trim();
  assert.equal((await api("/health")).status, "ok");
  assert.match(await (await fetch(target)).text(), /CRIA/);
  assert.deepEqual(await api("/admin/config"), { users: [], mcpServers: [], assignments: [] });
  assert.equal((await fetch(target + "/admin/config")).status, 401);
  await api("/admin/users", { id: "smoke", name: "Smoke User", enabled: true });
  await api("/admin/servers", { id: "demo", name: "Demo", kind: "demo" });
  await api("/admin/access", { userId: "smoke", mcpServerId: "demo", granted: true }, "PUT");
  const rpc = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  assert.equal((await api("/mcp", rpc, "POST")).error.code, -32003);
  assert.equal((await api("/mcp", rpc, "POST", "smoke")).result.tools[0].name, "demo__demo.echo");
  await compose("exec", "-T", "gateway", "node", "scripts/backup-sqlite.mjs", "/data/backups/smoke.sqlite");
  assert.notEqual((await compose("exec", "-T", "gateway", "node", "-e", "console.log(process.getuid())")).stdout.trim(), "0");
  await compose("up", "-d", "--force-recreate", "--wait", "--wait-timeout", "120");
  target = "http://" + (await compose("port", "gateway", "8787")).stdout.trim();
  assert.equal((await api("/admin/config")).users[0].id, "smoke");
  assert.equal((await api("/admin/logs")).events.length, 2);
  assert.equal((await api("/mcp", rpc, "POST", "smoke")).result.tools[0].name, "demo__demo.echo");
  console.log("Docker smoke passed: empty seed, non-root, HTTP, access, backup and container recreation");
} catch (error) {
  console.error("Docker smoke failed", error.message);
  process.exitCode = 1;
} finally {
  await compose("down", "--volumes", "--remove-orphans").catch(() => {});
}
