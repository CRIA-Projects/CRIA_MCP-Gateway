import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const key = "standalone-integration-admin-key-not-production";

test("standalone HTTP retains device credentials, assignments and audit through a process restart", { timeout: 20000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "cria-http-"));
  const children: ChildProcess[] = [];
  t.after(async () => { for (const child of children) await stop(child); await rm(directory, { recursive: true, force: true }); });
  const start = async () => {
    const child = spawn(process.execPath, [resolve("dist/src/platform/http/server.js")], {
      env: { ...process.env, SQLITE_PATH: join(directory, "gateway.sqlite"), NODE_ENV: "production", ADMIN_API_KEY: key, HOST: "127.0.0.1", PORT: "0", MCP_GATEWAY_TRUSTED_CLIENT_ID: "" }, stdio: ["ignore", "pipe", "pipe"]
    });
    children.push(child);
    const url = await new Promise<string>((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error("HTTP startup timeout")), 5000);
      child.once("error", reject);
      child.once("exit", () => { clearTimeout(timeout); reject(new Error("HTTP exited before readiness")); });
      child.stdout.on("data", chunk => { const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); accept(match[0]); } });
    });
    return { child, url };
  };
  const first = await start();
  const api = async (url: string, path: string, body?: unknown, method = "POST") => {
    const r = await fetch(url + path, { method: body === undefined ? "GET" : method, headers: { "content-type": "application/json", "x-admin-key": key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(r.ok, `Admin request ${path} failed`);
    return r.json();
  };
  assert.equal((await fetch(first.url + "/health")).status, 200);
  assert.match(await (await fetch(first.url)).text(), /CRIA/);
  assert.equal((await fetch(first.url + "/admin/config")).status, 401);
  await api(first.url, "/admin/users", { id: "vpn-user", name: "VPN User", enabled: true });
  await api(first.url, "/admin/servers", { id: "demo", name: "Demo", kind: "demo" });
  await api(first.url, "/admin/access", { userId: "vpn-user", mcpServerId: "demo", granted: true }, "PUT");

  const { token } = await api(first.url, "/admin/credentials", { userId: "vpn-user", deviceName: "Test device" });
  const responses = [];
  for (const message of [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "demo__demo.echo", arguments: { message: "via authenticated device" } } }
  ]) {
    const response = await fetch(first.url + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(message) });
    assert.ok(response.ok);
    if (message.id) responses.push(await response.json());
  }
  assert.deepEqual(responses.map(r => r.id), [1, 2, 3]);
  assert.equal(responses[1].result.tools[0].name, "demo__demo.echo");
  assert.equal(responses[2].result.content[0].text, "via authenticated device");
  await stop(first.child);
  const second = await start();
  const config = await api(second.url, "/admin/config");
  assert.equal(config.users[0].id, "vpn-user");
  assert.deepEqual(config.assignments, [{ userId: "vpn-user", mcpServerId: "demo" }]);
  const deviceList = await api(second.url, "/admin/credentials");
  assert.ok(deviceList.credentials[0].lastUsedAt);
  assert.ok(!JSON.stringify(deviceList).includes(token));
  const logs = await api(second.url, "/admin/logs");
  assert.equal(logs.events.length, 4);
  assert.ok(logs.events.every((e: { clientId: string }) => e.clientId === "vpn-user"));
  assert.ok(logs.events.some((e: { headers: Record<string, string> }) => e.headers.authorization === "[redacted]"));
});

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const deadline = setTimeout(() => child.kill("SIGKILL"), 3000);
  await exited;
  clearTimeout(deadline);
}
