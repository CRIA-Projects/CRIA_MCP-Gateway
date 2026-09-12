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
  assert.equal(discovery.result.capabilities.tools.listChanged, false);
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

test("a remote MCP with a configured authorization header sends it upstream", async () => {
  const gateway = app();
  const originalFetch = globalThis.fetch;
  const forwardedHeaders: Headers[] = [];
  globalThis.fetch = async (_input, init) => {
    forwardedHeaders.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), { headers: { "content-type": "application/json" } });
  };
  try {
    await gateway.handleRequest(admin("/admin/servers", "POST", { id: "auth-test", name: "Auth test", description: "Test upstream with auth", kind: "remote", endpoint: "https://mcp.example.test/mcp", authorizationHeader: "Bearer sk-secret" }));
    await gateway.handleRequest(admin("/admin/access", "PUT", { userId: "ana", mcpServerId: "auth-test", granted: true }));
    await gateway.handleRequest(rpc("/mcp", "ana", "tools/list"));
    assert.equal(forwardedHeaders[0].get("authorization"), "Bearer sk-secret");
  } finally { globalThis.fetch = originalFetch; }
});

test("a remote MCP with a custom auth header name sends that header instead of Authorization", async () => {
  const gateway = app();
  const originalFetch = globalThis.fetch;
  const forwardedHeaders: Headers[] = [];
  globalThis.fetch = async (_input, init) => {
    forwardedHeaders.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), { headers: { "content-type": "application/json" } });
  };
  try {
    await gateway.handleRequest(admin("/admin/servers", "POST", { id: "apikey-test", name: "API key test", kind: "remote", endpoint: "https://mcp.example.test/mcp", authorizationHeader: "sk-secret", authHeaderName: "X-API-Key" }));
    await gateway.handleRequest(admin("/admin/access", "PUT", { userId: "ana", mcpServerId: "apikey-test", granted: true }));
    await gateway.handleRequest(rpc("/mcp", "ana", "tools/list"));
    assert.equal(forwardedHeaders[0].get("x-api-key"), "sk-secret");
    assert.equal(forwardedHeaders[0].has("authorization"), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("creating an MCP server without a description succeeds", async () => {
  const gateway = app();
  const response = await gateway.handleRequest(admin("/admin/servers", "POST", { id: "no-desc", name: "No description", kind: "remote", endpoint: "https://mcp.example.test/mcp" }));
  assert.equal(response.status, 201);
});

test("a demo MCP server rejects an authorization header", async () => {
  const gateway = app();
  const response = await gateway.handleRequest(admin("/admin/servers", "POST", { id: "bad-demo", name: "Bad demo", description: "Should fail", kind: "demo", authorizationHeader: "Bearer sk-secret" }));
  assert.equal(response.status, 400);
});

test("admin analytics summarize activity per user and per MCP from the audit log", async () => {
  const gateway = app();
  await gateway.handleRequest(admin("/admin/access", "PUT", { userId: "ana", mcpServerId: "demo", granted: true }));
  await gateway.handleRequest(rpc("/mcp", "ana", "tools/call", { name: "demo__demo.echo", arguments: { message: "hola" } }));
  await gateway.handleRequest(rpc("/mcp", "ana", "tools/call", { name: "demo__demo.echo", arguments: { message: "hola" } }));
  await gateway.handleRequest(rpc("/mcp", "invitado", "tools/list"));
  const analytics = await (await gateway.handleRequest(admin("/admin/analytics"))).json() as {
    sampleSize: number;
    users: Array<{ userId: string; totalRequests: number; allowed: number; denied: number; topMcpServerId?: string }>;
    mcpServers: Array<{ mcpServerId: string; totalCalls: number; topTool?: string }>;
  };
  const ana = analytics.users.find((user) => user.userId === "ana");
  assert.equal(ana?.totalRequests, 2);
  assert.equal(ana?.allowed, 2);
  assert.equal(ana?.topMcpServerId, "demo");
  const invitado = analytics.users.find((user) => user.userId === "invitado");
  assert.equal(invitado?.denied, 1);
  const demo = analytics.mcpServers.find((server) => server.mcpServerId === "demo");
  assert.equal(demo?.totalCalls, 2);
  assert.equal(demo?.topTool, "demo__demo.echo");
});

test("an unrecognized MCP method is rejected while the initialized lifecycle notification is accepted", async () => {
  const gateway = app();
  const unknown = await (await gateway.handleRequest(rpc("/mcp", "ana", "subscriptions/listen"))).json() as { error?: { code: number } };
  assert.equal(unknown.error?.code, -32601);
  const initialized = await (await gateway.handleRequest(rpc("/mcp", "ana", "notifications/initialized"))).json() as { error?: unknown; result?: unknown };
  assert.equal(initialized.error, undefined);
  assert.deepEqual(initialized.result, {});
});

test("internal MCP IDs are not public paths", async () => {
  const gateway = app();
  assert.equal((await gateway.handleRequest(rpc("/mcp/missing", "ana", "tools/list"))).status, 404);
  assert.equal((await gateway.handleRequest(rpc("/mcp/demo", "ana", "tools/list"))).status, 404);
});
