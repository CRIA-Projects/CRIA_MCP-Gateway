import assert from "node:assert/strict";
import test from "node:test";
import mcpFunction from "../netlify/functions/mcp.js";
import { createGateway } from "../src/bootstrap.js";

const rpc = (path: string, clientId: string, method: string, params: Record<string, unknown> = {}) => new Request(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json", "x-client-id": clientId }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
});

test("health endpoint is available", async () => {
  const response = await createGateway({}).handleRequest(new Request("http://localhost/health"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "cria-mcp-gateway" });
});

test("the panel configuration exposes development access records without secrets", async () => {
  const app = createGateway({});
  const response = await app.handleRequest(new Request("http://localhost/admin/config"));
  const body = await response.json() as { users: Array<{ id: string }>; mcpServers: Array<{ id: string }>; assignments: unknown[] };
  assert.equal(response.status, 200);
  assert.deepEqual(body.users.map((user) => user.id), ["local-development-client", "ana", "bruno", "invitado"]);
  assert.deepEqual(body.mcpServers.map((server) => server.id), ["demo", "analysis"]);
  assert.equal(body.assignments.length, 4);
});

test("an enabled assigned user can list and call tools on its MCP", async () => {
  const app = createGateway({});
  const initialized = await (await app.handleRequest(rpc("/mcp/demo", "ana", "initialize"))).json() as { result: { capabilities: { tools: object } } };
  assert.deepEqual(initialized.result.capabilities, { tools: {} });
  const listed = await (await app.handleRequest(rpc("/mcp/demo", "ana", "tools/list"))).json() as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["demo.echo"]);
  const response = await (await app.handleRequest(rpc("/mcp/demo", "ana", "tools/call", { name: "demo.echo", arguments: { message: "hola" } }))).json() as { result: { content: Array<{ text: string }> } };
  assert.equal(response.result.content[0]?.text, "hola");
});

test("an unassigned or disabled user is denied before MCP initialization and tools are exposed", async () => {
  const app = createGateway({});
  const unassigned = await (await app.handleRequest(rpc("/mcp/analysis", "ana", "initialize"))).json() as { error: { code: number; message: string } };
  assert.deepEqual(unassigned.error, { code: -32003, message: "MCP access denied" });
  const disabled = await (await app.handleRequest(rpc("/mcp/demo", "invitado", "tools/list"))).json() as { error: { code: number } };
  assert.equal(disabled.error.code, -32003);
});

test("an unknown MCP is not routed and tools cannot cross MCP boundaries", async () => {
  const app = createGateway({});
  const missing = await app.handleRequest(rpc("/mcp/missing", "ana", "tools/list"));
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "MCP server not found" });
  const crossServerTool = await (await app.handleRequest(rpc("/mcp/analysis", "bruno", "tools/call", { name: "demo.echo" }))).json() as { error: { code: number } };
  assert.equal(crossServerTool.error.code, -32602);
});

test("the legacy MCP endpoint continues to target the demo server", async () => {
  const app = createGateway({});
  const response = await (await app.handleRequest(rpc("/mcp", "local-development-client", "tools/list"))).json() as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(response.result.tools.map((tool) => tool.name), ["demo.echo"]);
});

test("the Netlify adapter preserves MCP and configuration routes", async () => {
  const listed = await (await mcpFunction(rpc("/.netlify/functions/mcp/analysis", "bruno", "tools/list"))).json() as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["analysis.status"]);
  const config = await mcpFunction(new Request("http://localhost/.netlify/functions/mcp/admin/config"));
  assert.equal(config.status, 200);
});
