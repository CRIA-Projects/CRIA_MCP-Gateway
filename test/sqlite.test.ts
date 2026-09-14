import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import test from "node:test";
import { PersistentAccessConfiguration, type PublicGatewayConfiguration } from "../src/access/configuration.js";
import { PersistentAuditLog, type AuditEvent } from "../src/audit/audit.js";
import { SqlitePersistence } from "../src/platform/sqlite/database.js";
import { createStandaloneRuntime } from "../src/platform/standalone.js";

const empty: PublicGatewayConfiguration = { users: [], mcpServers: [], assignments: [] };
const key = "integration-test-admin-key-not-for-production";
const command = promisify(execFile);

test("SQLite persists credentials, grants and audit across reopen and backup; revocation remains enforced", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "cria-sqlite-"));
  const path = join(folder, "gateway.sqlite");
  const handles: SqlitePersistence[] = [];
  t.after(async () => { handles.forEach(handle => handle.close()); await rm(folder, { recursive: true, force: true }); });
  const first = new SqlitePersistence(path); handles.push(first);
  const access = new PersistentAccessConfiguration(first.access, empty);
  await access.createUser({ id: "client", name: "Client", enabled: true });
  await access.createMcpServer({ id: "private", name: "Private MCP", kind: "remote", endpoint: "https://internal.example.test/mcp", authorizationHeader: "test-upstream-credential" });
  await access.setAccess("client", "private", true);
  const audit = new PersistentAuditLog(first.audit);
  await audit.record(event("persisted"));
  // Online SQLite backup includes committed WAL data while the writer is open.
  const snapshot = join(folder, "backup.sqlite");
  await command(process.execPath, [resolve("scripts/backup-sqlite.mjs"), snapshot], { env: { ...process.env, SQLITE_PATH: path } });
  await assert.rejects(command(process.execPath, [resolve("scripts/backup-sqlite.mjs"), snapshot], { env: { ...process.env, SQLITE_PATH: path } }));
  first.close();
  const second = new SqlitePersistence(path); handles.push(second);
  const reopened = new PersistentAccessConfiguration(second.access, empty);
  assert.equal(await reopened.hasAccess("client", "private"), true);
  assert.equal((await reopened.findMcpServer("private"))?.authorizationHeader, "test-upstream-credential");
  assert.equal((await new PersistentAuditLog(second.audit).list(10))[0].id, "persisted");
  await reopened.setAccess("client", "private", false);
  assert.equal(await reopened.hasAccess("client", "private"), false);
  const restored = new SqlitePersistence(snapshot); handles.push(restored);
  assert.equal(await new PersistentAccessConfiguration(restored.access, empty).hasAccess("client", "private"), true);
  await reopened.removeMcpServer("private");
  await reopened.removeUser("client");
  assert.deepEqual(await reopened.publicView(), empty);
});

test("SQLite transactions preserve concurrent mutations across connections and rollback failures", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "cria-sqlite-race-"));
  const one = new SqlitePersistence(join(folder, "gateway.sqlite"));
  const two = new SqlitePersistence(join(folder, "gateway.sqlite"));
  t.after(async () => { one.close(); two.close(); await rm(folder, { recursive: true, force: true }); });
  const stores = [new PersistentAccessConfiguration(one.access, empty), new PersistentAccessConfiguration(two.access, empty)];
  await Promise.all(Array.from({ length: 30 }, (_, i) => stores[i % 2].createUser({ id: `user-${i}`, name: `User ${i}`, enabled: true })));
  assert.equal((await stores[0].publicView()).users.length, 30);
  await assert.rejects(stores[1].createUser({ id: "user-0", name: "Duplicate", enabled: false }));
  await assert.rejects(one.access.update!(empty, state => { state.users.splice(0); throw new Error("abort"); }));
  assert.equal((await stores[0].publicView()).users.length, 30);
  const logs = [new PersistentAuditLog(one.audit), new PersistentAuditLog(two.audit)];
  await Promise.all(Array.from({ length: 205 }, (_, i) => logs[i % 2].record(event(`event-${i}`))));
  const retained = await logs[0].list(200);
  assert.equal(retained.length, 200);
  assert.equal(new Set(retained.map(e => e.id)).size, 200);
  assert.equal(retained[0].id, "event-204");
  assert.equal(retained[199].id, "event-5");
});

test("SQLite startup is empty, requires an admin key and rejects newer database schemas", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "cria-sqlite-startup-"));
  const path = join(folder, "gateway.sqlite");
  t.after(() => rm(folder, { recursive: true, force: true }));
  await assert.rejects(createStandaloneRuntime({ SQLITE_PATH: path }), /ADMIN_API_KEY/);
  await assert.rejects(createStandaloneRuntime({ NODE_ENV: "production", ADMIN_API_KEY: key }), /persistence/);
  const runtime = await createStandaloneRuntime({ SQLITE_PATH: path, ADMIN_API_KEY: key, SUPABASE_URL: "https://unused.invalid", SUPABASE_SERVICE_ROLE_KEY: "not-used" });
  try {
    const response = await runtime.app.handleRequest(new Request("http://localhost/admin/config", { headers: { "x-admin-key": key } }));
    assert.deepEqual(await response.json(), empty);
    const denied = await runtime.app.handleRequest(new Request("http://localhost/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
    assert.equal((await denied.json()).error.code, -32003);
  } finally { runtime.close(); }
  const db = new DatabaseSync(path); db.exec("PRAGMA user_version = 99"); db.close();
  assert.throws(() => new SqlitePersistence(path), /newer/);
});

function event(id: string): AuditEvent {
  return { id, at: "2026-01-01T00:00:00.000Z", httpMethod: "POST", path: "/mcp", query: {}, headers: {}, clientId: "client", decision: "allowed", status: 200, rpcMethod: "tools/list" };
}
