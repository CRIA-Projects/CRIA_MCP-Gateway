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
  const before = await (await gateway.handleRequest(rpc("/mcp", "clara", "tools/list"))).json() as { error: { code: number } };
  assert.equal(before.error.code, -32003);
  await gateway.handleRequest(admin("/admin/access", "PUT", { userId: "clara", mcpServerId: "demo", granted: true }));
  const after = await (await gateway.handleRequest(rpc("/mcp", "clara", "tools/list"))).json() as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(after.result.tools.map((tool) => tool.name), ["demo__demo.echo"]);
  await gateway.handleRequest(admin("/admin/users/clara", "PATCH", { name: "Clara", enabled: false }));
  const disabled = await (await gateway.handleRequest(rpc("/mcp", "clara", "initialize"))).json() as { error: { code: number } };
  assert.equal(disabled.error.code, -32003);
});

test("the public gateway implements server/discover and federates only assigned MCP tools", async () => {
  const gateway = app();
  const discovery = await (await gateway.handleRequest(rpc("/mcp", "ana", "server/discover"))).json() as { result: { supportedVersions: string[]; capabilities: { tools: { listChanged: boolean } } } };
  assert.deepEqual(discovery.result.supportedVersions, ["2026-07-28"]);
  assert.equal(discovery.result.capabilities.tools.listChanged, true);
  await gateway.handleRequest(admin("/admin/access", "PUT", { userId: "ana", mcpServerId: "analysis", granted: true }));
  const list = await (await gateway.handleRequest(rpc("/mcp", "ana", "tools/list"))).json() as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(list.result.tools.map((tool) => tool.name), ["demo__demo.echo", "analysis__analysis.status"]);
  const called = await (await gateway.handleRequest(rpc("/mcp", "ana", "tools/call", { name: "demo__demo.echo", arguments: { message: "hola" } }))).json() as { result: { content: Array<{ text: string }> } };
  assert.equal(called.result.content[0].text, "hola");
});

test("gateway audit records sanitized incoming request details", async () => {
  const gateway = app();
  await gateway.handleRequest(rpc("/mcp?source=chat", "ana", "tools/call", { name: "demo__demo.echo", arguments: { message: "hola", token: "private" } }, { authorization: "Bearer private" }));
  const logs = await (await gateway.handleRequest(admin("/admin/logs?limit=10"))).json() as { events: Array<{ rpcMethod: string; headers: Record<string, string>; params: { arguments: { token: string } }; query: Record<string, string> }> };
  const event = logs.events.find((candidate) => candidate.rpcMethod === "tools/call");
  assert.equal(event?.headers.authorization, "[redacted]");
  assert.equal(event?.params.arguments.token, "[redacted]");
  assert.equal(event?.query.source, "chat");
});

test("an authorized remote MCP is listed and called through the public gateway", async () => {
  const gateway = app();
  const originalFetch = globalThis.fetch;
  const forwarded: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    const message = JSON.parse(String(init?.body)) as Record<string, unknown>;
    forwarded.push(message);
    const result = message.method === "tools/list"
      ? { tools: [{ name: "upstream_tool", description: "Remote tool", inputSchema: { type: "object" } }] }
      : { content: [{ type: "text", text: "remote result" }] };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { headers: { "content-type": "application/json" } });
  };
  try {
    await gateway.handleRequest(admin("/admin/servers", "POST", { id: "remote-test", name: "Remote test", description: "Test upstream", kind: "remote", endpoint: "https://mcp.example.test/mcp" }));
    await gateway.handleRequest(admin("/admin/access", "PUT", { userId: "ana", mcpServerId: "remote-test", granted: true }));
    const list = await (await gateway.handleRequest(rpc("/mcp", "ana", "tools/list"))).json() as { result: { tools: Array<{ name: string }> } };
    assert.deepEqual(list.result.tools.map((tool) => tool.name), ["demo__demo.echo", "remote-test__upstream_tool"]);
    const call = await (await gateway.handleRequest(rpc("/mcp", "ana", "tools/call", { name: "remote-test__upstream_tool", arguments: {} }))).json() as { result: { content: Array<{ text: string }> } };
    assert.equal(call.result.content[0].text, "remote result");
    assert.deepEqual(forwarded, [
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "upstream_tool", arguments: {} } }
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test("internal MCP IDs are not public paths", async () => {
  const gateway = app();
  assert.equal((await gateway.handleRequest(rpc("/mcp/missing", "ana", "tools/list"))).status, 404);
  assert.equal((await gateway.handleRequest(rpc("/mcp/demo", "ana", "tools/list"))).status, 404);
});
