import type { AccessConfiguration, GatewayUser, McpServer } from "../access/configuration.js";
import type { AuditEvent, AuditLog } from "../audit/audit.js";
import type { IdentityResolver, Principal } from "../identity/identity.js";
import type { PolicyService } from "../policy/policy.js";
import type { ToolRegistry } from "../registry/registry.js";
import type { ToolRouter } from "../router/router.js";
import { failure, success, type JsonRpcRequest, type JsonRpcResponse } from "./protocol.js";

export interface GatewayDependencies { identity: IdentityResolver; policy: PolicyService; registry: ToolRegistry; router: ToolRouter; audit: AuditLog; access: AccessConfiguration; adminApiKey: string; }
type Decision = "allowed" | "denied" | "error";
interface Outcome { response: Response; decision: Decision; clientId?: string; errorCode?: number; }

export class GatewayApplication {
  constructor(private readonly deps: GatewayDependencies) {}

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return Response.json({ status: "ok", service: "cria-mcp-gateway" });
    if (url.pathname.startsWith("/admin/")) return this.handleAdmin(request, url);
    const mcpServerId = this.mcpServerId(url.pathname);
    if (request.method !== "POST" || !mcpServerId) return Response.json({ error: "Not found" }, { status: 404 });
    const server = await this.deps.access.findMcpServer(mcpServerId);
    if (!server) return this.auditAndReturn(request, undefined, mcpServerId, undefined, { response: Response.json({ error: "MCP server not found" }, { status: 404 }), decision: "denied" });
    let message: unknown;
    try { message = await request.json(); } catch { return this.auditAndReturn(request, undefined, mcpServerId, undefined, this.rpcOutcome(failure(null, -32700, "Parse error"), "error")); }
    if (!isRequest(message)) return this.auditAndReturn(request, undefined, mcpServerId, message, this.rpcOutcome(failure(null, -32600, "Invalid Request"), "error"));
    const outcome = await this.dispatch(request, server, message);
    const response = message.id === undefined ? new Response(null, { status: 202 }) : outcome.response;
    return this.auditAndReturn(request, outcome.clientId, mcpServerId, message, { ...outcome, response });
  }

  private async dispatch(request: Request, server: McpServer, message: JsonRpcRequest): Promise<Outcome> {
    const id = message.id ?? null;
    const principal = await this.deps.identity.resolve(request);
    if (!(await this.deps.policy.canUseMcp(principal, server.id))) return this.rpcOutcome(failure(id, -32003, "MCP access denied"), "denied", principal.id);
    if (server.kind === "remote") {
      try {
        const forwarded = await this.deps.router.forward(server, message, request.headers);
        return { response: new Response(forwarded.body, { status: forwarded.status, headers: { "content-type": forwarded.contentType, "cache-control": "no-store" } }), decision: "allowed", clientId: principal.id };
      } catch {
        return this.rpcOutcome(failure(id, -32603, "Upstream MCP request failed"), "error", principal.id);
      }
    }
    if (message.method === "initialize") return this.rpcOutcome(success(id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "cria-mcp-gateway", version: "0.2.0" } }), "allowed", principal.id);
    if (message.method === "tools/list") return this.rpcOutcome(success(id, { tools: (await this.deps.registry.list(server.id)).map(toMcpTool) }), "allowed", principal.id);
    if (message.method === "tools/call") return this.callTool(principal, id, server.id, message.params);
    return this.rpcOutcome(failure(id, -32601, "Method not found"), "error", principal.id);
  }

  private async callTool(principal: Principal, id: JsonRpcRequest["id"], mcpServerId: string, params: Record<string, unknown> | undefined): Promise<Outcome> {
    const toolName = typeof params?.name === "string" ? params.name : undefined;
    if (!toolName) return this.rpcOutcome(failure(id ?? null, -32602, "tools/call requires a string params.name"), "error", principal.id);
    const tool = await this.deps.registry.find(mcpServerId, toolName);
    if (!tool) return this.rpcOutcome(failure(id ?? null, -32602, "Unknown tool"), "error", principal.id);
    try {
      const rawArgs = params?.arguments;
      const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs as Record<string, unknown> : {};
      return this.rpcOutcome(success(id ?? null, await this.deps.router.call(tool, args)), "allowed", principal.id);
    } catch { return this.rpcOutcome(failure(id ?? null, -32603, "Tool execution failed"), "error", principal.id); }
  }

  private rpcOutcome(body: JsonRpcResponse, decision: Decision, clientId?: string): Outcome {
    return { response: this.json(body), decision, clientId, errorCode: body.error?.code };
  }

  private async auditAndReturn(request: Request, clientId: string | undefined, mcpServerId: string | undefined, message: unknown, outcome: Outcome): Promise<Response> {
    const url = new URL(request.url);
    const rpc = isRequest(message) ? message : undefined;
    const event: AuditEvent = { id: crypto.randomUUID(), at: new Date().toISOString(), httpMethod: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), mcpServerId, clientId, rpcMethod: rpc?.method, rpcId: rpc?.id, params: sanitize(rpc?.params), headers: safeHeaders(request.headers), decision: outcome.decision, status: outcome.response.status, errorCode: outcome.errorCode };
    await this.deps.audit.record(event);
    return outcome.response;
  }

  private async handleAdmin(request: Request, url: URL): Promise<Response> {
    if (!this.deps.adminApiKey || request.headers.get("x-admin-key") !== this.deps.adminApiKey) return Response.json({ error: "Admin access denied" }, { status: 401 });
    try {
      if (request.method === "GET" && url.pathname === "/admin/config") return this.adminJson(await this.deps.access.publicView());
      if (request.method === "GET" && url.pathname === "/admin/logs") return this.adminJson({ events: await this.deps.audit.list(Number(url.searchParams.get("limit") ?? 100)) });
      if (request.method === "POST" && url.pathname === "/admin/users") return this.adminJson(await this.deps.access.createUser(await userBody(request)), 201);
      if (request.method === "POST" && url.pathname === "/admin/servers") return this.adminJson(await this.deps.access.createMcpServer(await serverBody(request)), 201);
      if (request.method === "PUT" && url.pathname === "/admin/access") { const body = await objectBody(request); return this.adminJson({ granted: await this.deps.access.setAccess(stringField(body, "userId"), stringField(body, "mcpServerId"), Boolean(body.granted)) }); }
      const userId = /^\/admin\/users\/([^/]+)$/.exec(url.pathname)?.[1];
      if (userId && request.method === "PATCH") return this.adminJson(awaitRequired(this.deps.access.updateUser(userId, await userUpdateBody(request))));
      if (userId && request.method === "DELETE") return this.deleteResult(await this.deps.access.removeUser(userId));
      const serverId = /^\/admin\/servers\/([^/]+)$/.exec(url.pathname)?.[1];
      if (serverId && request.method === "PATCH") return this.adminJson(awaitRequired(this.deps.access.updateMcpServer(serverId, await serverUpdateBody(request))));
      if (serverId && request.method === "DELETE") return this.deleteResult(await this.deps.access.removeMcpServer(serverId));
      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid admin request" }, { status: 400 }); }
  }

  private adminJson(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "no-store" } }); }
  private deleteResult(deleted: boolean) { return deleted ? new Response(null, { status: 204 }) : Response.json({ error: "Not found" }, { status: 404 }); }
  private json(body: JsonRpcResponse) { return Response.json(body, { headers: { "cache-control": "no-store" } }); }
  private mcpServerId(pathname: string) { if (pathname === "/mcp") return "demo"; const match = /^\/mcp\/([^/]+)$/.exec(pathname); return match ? decodeURIComponent(match[1]) : undefined; }
}

async function objectBody(request: Request) { const body: unknown = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected a JSON object"); return body as Record<string, unknown>; }
async function userBody(request: Request): Promise<GatewayUser> { const body = await objectBody(request); return { id: stringField(body, "id"), name: stringField(body, "name"), enabled: Boolean(body.enabled) }; }
async function userUpdateBody(request: Request): Promise<Omit<GatewayUser, "id">> { const body = await objectBody(request); return { name: stringField(body, "name"), enabled: Boolean(body.enabled) }; }
async function serverBody(request: Request): Promise<McpServer> { const body = await objectBody(request); return { id: stringField(body, "id"), ...serverFields(body) }; }
async function serverUpdateBody(request: Request): Promise<Omit<McpServer, "id">> { return serverFields(await objectBody(request)); }
function serverFields(body: Record<string, unknown>): Omit<McpServer, "id"> { const kind = stringField(body, "kind"); if (kind !== "demo" && kind !== "remote") throw new Error("Server kind must be demo or remote"); const endpoint = typeof body.endpoint === "string" && body.endpoint.trim() ? body.endpoint.trim() : undefined; return { name: stringField(body, "name"), description: stringField(body, "description"), kind, ...(endpoint ? { endpoint } : {}) }; }
function stringField(body: Record<string, unknown>, name: string) { const value = body[name]; if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`); return value.trim(); }
function awaitRequired<T>(value: Promise<T | undefined>) { return value.then((result) => { if (!result) throw new Error("Not found"); return result; }); }
function isRequest(value: unknown): value is JsonRpcRequest { return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).jsonrpc === "2.0" && typeof (value as Record<string, unknown>).method === "string"); }
function toMcpTool(tool: { name: string; description: string; inputSchema: Record<string, unknown> }) { return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema }; }
function safeHeaders(headers: Headers) { return Object.fromEntries([...headers].map(([key, value]) => [key, /authorization|cookie|token|secret|api[-_]?key/i.test(key) ? "[redacted]" : truncate(value)])); }
function sanitize(value: unknown): unknown { if (typeof value === "string") return truncate(value); if (Array.isArray(value)) return value.map(sanitize); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, /password|token|secret|authorization|api[-_]?key/i.test(key) ? "[redacted]" : sanitize(item)])); return value; }
function truncate(value: string) { return value.length > 2000 ? `${value.slice(0, 2000)}…[truncated]` : value; }
