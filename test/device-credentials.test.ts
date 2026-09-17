import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createStandaloneRuntime } from "../src/platform/standalone.js";

const adminKey = "device-test-admin-key-not-for-production";
test("device identities cannot be forged and credential lifecycle survives SQLite migration/restart", async t => {
  const folder = await mkdtemp(join(tmpdir(), "cria-device-"));
  const path = join(folder, "gateway.sqlite");
  // Existing v1 installation: migration preserves its users and assignments.
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE access_state(id INTEGER PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE audit_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE,payload TEXT); PRAGMA user_version=1;");
  db.prepare("INSERT INTO access_state VALUES(1,?)").run(JSON.stringify({
    users: [{ id: "ana", name: "Ana", enabled: true }, { id: "bruno", name: "Bruno", enabled: true }],
    mcpServers: [{ id: "demo", name: "Demo", kind: "demo" }, { id: "analysis", name: "Analysis", kind: "demo" }],
    assignments: [{ userId: "ana", mcpServerId: "demo" }, { userId: "bruno", mcpServerId: "analysis" }]
  })); db.close();
  const env = { SQLITE_PATH: path, ADMIN_API_KEY: adminKey, MCP_GATEWAY_TRUSTED_CLIENT_ID: "bruno", MCP_GATEWAY_API_KEY: "shared-key-must-not-bypass-identity" };
  let runtime = await createStandaloneRuntime(env);
  t.after(async () => { runtime.close(); await rm(folder, { recursive: true, force: true }); });
  const admin = async (route: string, body?: unknown, method = body ? "POST" : "GET") => {
    const r = await runtime.app.handleRequest(new Request("https://gateway.test" + route, { method, headers: { "x-admin-key": adminKey, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: r.status, body: r.status === 204 ? undefined : await r.json() };
  };
  const rpc = async (token?: string, claimed = "bruno", method = "tools/list", params = {}) => {
    const r = await runtime.app.handleRequest(new Request("https://gateway.test/mcp", { method: "POST", headers: { "x-client-id": claimed, "x-api-key": "shared-key-must-not-bypass-identity", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
    return { status: r.status, body: await r.json() };
  };
  assert.equal((await rpc()).status, 401);
  assert.deepEqual((await admin("/admin/test-user", { userId: "ana" })).body.result.tools.map((tool: { name: string }) => tool.name), ["demo__demo.echo"]);
  assert.equal((await rpc()).status, 401); // Administrative diagnostics never enable ID authentication.

  assert.equal((await rpc("cria_" + "0".repeat(64))).status, 401);
  assert.equal((await runtime.app.handleRequest(new Request("https://gateway.test/admin/credentials"))).status, 401);
  assert.equal((await admin("/admin/credentials", { userId: "missing", deviceName: "PC" })).status, 400);
  assert.equal((await admin("/admin/credentials", { userId: "ana", deviceName: "PC", expiresInDays: 0 })).status, 400);
  const issued = (await admin("/admin/credentials", { userId: "ana", deviceName: "Ana laptop" })).body;
  const second = (await admin("/admin/credentials", { userId: "ana", deviceName: "Ana desktop" })).body;
  assert.match(issued.token, /^cria_[a-f0-9]{64}$/);
  assert.notEqual(issued.token, second.token);
  const tools = (await rpc(issued.token)).body.result.tools;
  assert.deepEqual(tools.map((tool: { name: string }) => tool.name), ["demo__demo.echo"]);
  assert.ok((await rpc(issued.token, "bruno", "tools/call", { name: "analysis__analysis.status" })).body.error);
  assert.equal((await rpc(issued.token, "bruno", "tools/call", { name: "demo__demo.echo", arguments: { message: "authorized" } })).body.result.content[0].text, "authorized");
  const listed = (await admin("/admin/credentials")).body;
  assert.ok(listed.credentials.find((c: { id: string }) => c.id === issued.credential.id).lastUsedAt);
  assert.ok(!JSON.stringify(listed).includes(issued.token));
  assert.ok(!JSON.stringify(listed).includes("tokenHash"));
  const logs = (await admin("/admin/logs")).body;
  assert.ok(!JSON.stringify(logs).includes(issued.token));
  assert.equal(logs.events[0].clientId, "ana");

  runtime.close(); runtime = await createStandaloneRuntime(env);
  assert.ok((await rpc(issued.token)).body.result);
  assert.equal((await admin(`/admin/credentials/${issued.credential.id}`, undefined, "DELETE")).status, 204);
  assert.equal((await rpc(issued.token)).status, 401);
  assert.ok((await rpc(second.token)).body.result);
  // Disable/re-enable must permanently invalidate pre-existing credentials.
  await admin("/admin/users/ana", { name: "Ana", enabled: false }, "PATCH");
  assert.equal((await rpc(second.token)).status, 401);
  await admin("/admin/users/ana", { name: "Ana", enabled: true }, "PATCH");
  assert.equal((await rpc(second.token)).status, 401);
  const third = (await admin("/admin/credentials", { userId: "ana", deviceName: "replacement" })).body;
  const inspector = new DatabaseSync(path);
  assert.equal(inspector.prepare("PRAGMA user_version").get()?.user_version, 2);
  const rows = inspector.prepare("SELECT * FROM device_credentials").all();
  assert.ok(!JSON.stringify(rows).includes(third.token));
  inspector.prepare("UPDATE device_credentials SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(third.credential.id);
  assert.equal((await rpc(third.token)).status, 401);
  const fourth = (await admin("/admin/credentials", { userId: "ana", deviceName: "deleted user" })).body;
  await admin("/admin/users/ana", undefined, "DELETE");
  await admin("/admin/users", { id: "ana", name: "New Ana", enabled: true });
  await admin("/admin/access", { userId: "ana", mcpServerId: "demo", granted: true }, "PUT");
  assert.equal((await rpc(fourth.token)).status, 401);
  inspector.close();
});
