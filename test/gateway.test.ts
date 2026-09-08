import assert from "node:assert/strict";
import test from "node:test";
import { createGateway } from "../src/bootstrap.js";

const adminKey = "test-admin-key";
const app = () => createGateway({ ADMIN_API_KEY: adminKey });
const rpc = (path: string, clientId: string, method: string, params: Record<string, unknown> = {}, extraHeaders: HeadersInit = {}) => new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-client-id": clientId, ...extraHeaders }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
const admin = (path: string, method = "GET", body?: unknown) => new Request(`http://localhost${path}`, { method, headers: { "x-admin-key": adminKey, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("health is publicly available while admin data requires its key", async () => {
  const gateway = app();
  assert.equal((await gateway.handleRequest(new Request("http://localhost/health"))).status, 200);
  assert.equal((await gateway.handleRequest(new Request("http://localhost/admin/config"))).status, 401);
  const config = await gateway.handleRequest(admin("/admin/config"));
  assert.equal(config.status, 200);
});

test("admin changes access rules and the gateway immediately enforces the current state", async () => {
  const gateway = app();
  await gateway.handleRequest(admin("/admin/users", "POST", { id: "clara", name: "Clara", enabled: true }));
  const before = await (await gateway.handleRequest(rpc("/mcp/demo", "clara", "tools/list"))).json() as { error: { code: number } };
  assert.equal(before.error.code, -32003);
  await gateway.handleRequest(admin("/admin/access", "PUT", { userId: "clara", mcpServerId: "demo", granted: true }));
  const after = await (await gateway.handleRequest(rpc("/mcp/demo", "clara", "tools/list"))).json() as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(after.result.tools.map((tool) => tool.name), ["demo.echo"]);
  await gateway.handleRequest(admin("/admin/users/clara", "PATCH", { name: "Clara", enabled: false }));
  const disabled = await (await gateway.handleRequest(rpc("/mcp/demo", "clara", "initialize"))).json() as { error: { code: number } };
  assert.equal(disabled.error.code, -32003);
});

test("gateway audit records sanitized incoming request details", async () => {
  const gateway = app();
  await gateway.handleRequest(rpc("/mcp/demo?source=chat", "ana", "tools/call", { name: "demo.echo", arguments: { message: "hola", token: "private" } }, { authorization: "Bearer private" }));
  const logs = await (await gateway.handleRequest(admin("/admin/logs?limit=10"))).json() as { events: Array<{ rpcMethod: string; headers: Record<string, string>; params: { arguments: { token: string } }; query: Record<string, string> }> };
  const event = logs.events.find((candidate) => candidate.rpcMethod === "tools/call");
  assert.equal(event?.headers.authorization, "[redacted]");
  assert.equal(event?.params.arguments.token, "[redacted]");
  assert.equal(event?.query.source, "chat");
});

test("an authorized remote MCP receives the JSON-RPC request", async () => {
  const gateway = app();
  const originalFetch = globalThis.fetch;
  let forwarded: unknown;
  globalThis.fetch = async (_input, init) => { forwarded = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), { headers: { "content-type": "application/json" } }); };
  try {
    await gateway.handleRequest(admin("/admin/servers", "POST", { id: "remote-test", name: "Remote test", description: "Test upstream", kind: "remote", endpoint: "https://mcp.example.test/mcp" }));
    await gateway.handleRequest(admin("/admin/access", "PUT", { userId: "ana", mcpServerId: "remote-test", granted: true }));
    const response = await gateway.handleRequest(rpc("/mcp/remote-test", "ana", "tools/list"));
    assert.equal(response.status, 200);
    assert.deepEqual(forwarded, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  } finally { globalThis.fetch = originalFetch; }
});

test("unknown MCPs are rejected and legacy /mcp targets the demo", async () => {
  const gateway = app();
  assert.equal((await gateway.handleRequest(rpc("/mcp/missing", "ana", "tools/list"))).status, 404);
  const legacy = await (await gateway.handleRequest(rpc("/mcp", "ana", "tools/list"))).json() as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(legacy.result.tools.map((tool) => tool.name), ["demo.echo"]);
});
