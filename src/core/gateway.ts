import type { AccessConfiguration, GatewayUser, McpServer } from "../access/configuration.js";
import { computeAnalytics } from "../audit/analytics.js";
import type { AuditEvent, AuditLog } from "../audit/audit.js";
import type { IdentityResolver, Principal } from "../identity/identity.js";
import type { PolicyService } from "../policy/policy.js";
import type { ToolRegistry } from "../registry/registry.js";
import type { ToolRouter } from "../router/router.js";
import { failure, success, type JsonRpcRequest, type JsonRpcResponse } from "./protocol.js";

import type { DeviceCredentials } from "../identity/credentials.js";

export interface GatewayDependencies { credentials?: DeviceCredentials; identity: IdentityResolver; policy: PolicyService; registry: ToolRegistry; router: ToolRouter; audit: AuditLog; access: AccessConfiguration; adminApiKey: string; mcpApiKey: string; }
type Decision = "allowed" | "denied" | "error";
interface Outcome { response: Response; decision: Decision; clientId?: string; mcpServerId?: string; errorCode?: number; }

export class GatewayApplication {
  constructor(private readonly deps: GatewayDependencies) {}

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return Response.json({ status: "ok", service: "cria-mcp-gateway" });
    if (url.pathname.startsWith("/admin/")) return this.handleAdmin(request, url);
    if (request.method !== "POST" || url.pathname !== "/mcp") return Response.json({ error: "Not found" }, { status: 404 });
    if (!this.deps.credentials && this.deps.mcpApiKey && request.headers.get("x-api-key") !== this.deps.mcpApiKey) return Response.json({ error: "MCP access denied" }, { status: 401 });
    let message: unknown;
    try { message = await request.json(); } catch { return this.auditAndReturn(request, undefined, undefined, undefined, this.rpcOutcome(failure(null, -32700, "Parse error"), "error")); }
    if (!isRequest(message)) return this.auditAndReturn(request, undefined, undefined, message, this.rpcOutcome(failure(null, -32600, "Invalid Request"), "error"));
    const outcome = await this.dispatch(request, message);
    const response = message.id === undefined && outcome.response.status === 200 ? new Response(null, { status: 202 }) : outcome.response;
    return this.auditAndReturn(request, outcome.clientId, outcome.mcpServerId, message, { ...outcome, response });
  }

  private async dispatch(request: Request, message: JsonRpcRequest): Promise<Outcome> {
    const id = message.id ?? null;
    const principal = await this.deps.identity.resolve(request);
    if (!principal.id) {
      return { response: Response.json(failure(id, -32003, "Invalid or expired device credential"), { status: 401, headers: { "cache-control": "no-store", "www-authenticate": "Bearer" } }), decision: "denied", errorCode: -32003 };
    }
    const servers = await this.accessibleServers(principal);
    if (!servers.length) return this.rpcOutcome(failure(id, -32003, "MCP access denied"), "denied", principal.id);
    if (message.method === "server/discover") return { ...this.rpcOutcome(success(id, discoveryResult()), "allowed", principal.id), mcpServerId: "gateway" };
    if (message.method === "initialize") return { ...this.rpcOutcome(success(id, legacyInitializeResult()), "allowed", principal.id), mcpServerId: "gateway" };
    if (message.method === "tools/list") return this.listTools(principal, servers, message, new Headers({ accept: "application/json, text/event-stream" }));
    if (message.method === "tools/call") return this.callTool(principal, id, servers, message, new Headers({ accept: "application/json, text/event-stream" }));
    if (message.method === "notifications/initialized") return { ...this.rpcOutcome(success(id, {}), "allowed", principal.id), mcpServerId: "gateway" };
    return this.rpcOutcome(failure(id, -32601, "Method not found"), "error", principal.id);
  }

  private async accessibleServers(principal: Principal): Promise<readonly McpServer[]> {
    const user = await this.deps.access.findUser(principal.id);
    if (!user?.enabled) return [];
    const assigned = await this.deps.access.listAccessibleMcpServers(principal.id);
    return (await Promise.all(assigned.map(async (server) => (await this.deps.policy.canUseMcp(principal, server.id)) ? server : undefined))).filter((server): server is McpServer => Boolean(server));
  }

  private async listTools(principal: Principal, servers: readonly McpServer[], message: JsonRpcRequest, headers: Headers): Promise<Outcome> {
    const toolGroups = await Promise.all(servers.map(async (server) => {
      try {
        const tools = server.kind === "remote"
          ? await this.remoteTools(server, message, headers)
          : (await this.deps.registry.list(server.id)).map(toMcpTool);
        return { tools: tools.map((tool) => toGatewayTool(server, tool)) };
      } catch { return { tools: [], warning: { mcpServerId: server.id, mcpServerName: server.name, code: "upstream-unavailable" } }; }
    }));
    const warnings = toolGroups.flatMap((group) => group.warning ? [group.warning] : []);
    return { ...this.rpcOutcome(success(message.id ?? null, { resultType: "complete", tools: toolGroups.flatMap((group) => group.tools), ...(warnings.length ? { _meta: { "ar.somoscria/gatewayWarnings": warnings } } : {}), ttlMs: 0, cacheScope: "private" }), "allowed", principal.id), mcpServerId: "gateway" };
  }

  private async remoteTools(server: McpServer, message: JsonRpcRequest, headers: Headers): Promise<GatewayTool[]> {
    const response = await this.deps.router.forward(server, message, headers);
    if (response.status < 200 || response.status >= 300) throw new Error("Upstream MCP returned an error");
    const payload: unknown = parseRpcBody(response.body, response.contentType);
    const result = payload && typeof payload === "object" ? (payload as { result?: unknown }).result : undefined;
    const tools = result && typeof result === "object" ? (result as { tools?: unknown }).tools : undefined;
    if (!Array.isArray(tools)) throw new Error("Upstream MCP tools/list response is invalid");
    return tools.filter(isGatewayTool);
  }

  private async callTool(principal: Principal, id: JsonRpcRequest["id"], servers: readonly McpServer[], message: JsonRpcRequest, headers: Headers): Promise<Outcome> {
    const toolName = typeof message.params?.name === "string" ? message.params.name : undefined;
    if (!toolName) return this.rpcOutcome(failure(id ?? null, -32602, "tools/call requires a string params.name"), "error", principal.id);
    const target = findToolTarget(servers, toolName);
    if (!target) return this.rpcOutcome(failure(id ?? null, -32602, "Unknown tool. Use the names returned by tools/list."), "error", principal.id);
    const { server, upstreamToolName } = target;
    if (server.kind === "remote") {
      try {
        const forwarded = await this.deps.router.forward(server, { ...message, params: { ...message.params, name: upstreamToolName } }, headers);
        return { response: new Response(forwarded.body, { status: forwarded.status, headers: { "content-type": forwarded.contentType, "cache-control": "no-store" } }), decision: "allowed", clientId: principal.id, mcpServerId: server.id };
      } catch { return { ...this.rpcOutcome(failure(id ?? null, -32603, "Upstream MCP request failed"), "error", principal.id), mcpServerId: server.id }; }
    }
    const tool = await this.deps.registry.find(server.id, upstreamToolName);
    if (!tool) return { ...this.rpcOutcome(failure(id ?? null, -32602, "Unknown tool"), "error", principal.id), mcpServerId: server.id };
    try {
      const rawArgs = message.params?.arguments;
      const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs as Record<string, unknown> : {};
      return { ...this.rpcOutcome(success(id ?? null, await this.deps.router.call(tool, args)), "allowed", principal.id), mcpServerId: server.id };
    } catch { return { ...this.rpcOutcome(failure(id ?? null, -32603, "Tool execution failed"), "error", principal.id), mcpServerId: server.id }; }
  }

  private rpcOutcome(body: JsonRpcResponse, decision: Decision, clientId?: string): Outcome {
    return { response: this.json(body), decision, clientId, errorCode: body.error?.code };
  }

  private async auditAndReturn(request: Request, clientId: string | undefined, mcpServerId: string | undefined, message: unknown, outcome: Outcome): Promise<Response> {
    const url = new URL(request.url);
    const rpc = isRequest(message) ? message : undefined;
    const event: AuditEvent = { id: crypto.randomUUID(), at: new Date().toISOString(), httpMethod: request.method, path: url.pathname, query: sanitize(Object.fromEntries(url.searchParams)) as Record<string, string>, mcpServerId, clientId, rpcMethod: rpc?.method, rpcId: rpc?.id, params: sanitize(rpc?.params), headers: safeHeaders(request.headers), decision: outcome.decision, status: outcome.response.status, errorCode: outcome.errorCode };
    await this.deps.audit.record(event);
    return outcome.response;
  }

  private async handleAdmin(request: Request, url: URL): Promise<Response> {
    if (!this.deps.adminApiKey || request.headers.get("x-admin-key") !== this.deps.adminApiKey) return Response.json({ error: "Admin access denied" }, { status: 401 });
    try {
      if (request.method === "POST" && url.pathname === "/admin/test-user") {
        const body = await objectBody(request);
        if (Object.keys(body).some(key => key !== "userId")) throw new Error("Only userId is accepted; this diagnostic only lists tools");
        const principal: Principal = { id: stringField(body, "userId"), kind: "client" };
        const message: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
        const servers = await this.accessibleServers(principal);
        const outcome = servers.length
          ? await this.listTools(principal, servers, message, new Headers({ accept: "application/json, text/event-stream" }))
          : this.rpcOutcome(failure(1, -32003, "MCP access denied"), "denied", principal.id);
        return this.auditAndReturn(request, principal.id, "gateway", message, outcome);
      }
      if (request.method === "GET" && url.pathname === "/admin/auth") return this.adminJson({ mode: this.deps.credentials ? "device" : "development" });
      if (url.pathname === "/admin/credentials" && this.deps.credentials) {
        if (request.method === "GET") return this.adminJson({ credentials: await this.deps.credentials.list() });
        if (request.method === "POST") {
          const body = await objectBody(request);
          return this.adminJson(await this.deps.credentials.issue(stringField(body, "userId"), stringField(body, "deviceName"), body.expiresInDays === undefined ? 90 : typeof body.expiresInDays === "number" ? body.expiresInDays : NaN), 201);
        }
      }
      const credentialId = /^\/admin\/credentials\/([^/]+)$/.exec(url.pathname)?.[1];
      if (credentialId && request.method === "DELETE" && this.deps.credentials) return this.deleteResult(await this.deps.credentials.revoke(credentialId));
      if (request.method === "GET" && url.pathname === "/admin/config") return this.adminJson(await this.deps.access.publicView());
      if (request.method === "GET" && url.pathname === "/admin/logs") return this.adminJson({ events: await this.deps.audit.list(Number(url.searchParams.get("limit") ?? 100)) });
      if (request.method === "GET" && url.pathname === "/admin/analytics") return this.adminJson(computeAnalytics(await this.deps.audit.list(200), await this.deps.access.publicView()));
      if (request.method === "POST" && url.pathname === "/admin/users") return this.adminJson(await this.deps.access.createUser(await userBody(request)), 201);
      if (request.method === "POST" && url.pathname === "/admin/servers") return this.adminJson(await this.deps.access.createMcpServer(await serverBody(request)), 201);
      if (request.method === "PUT" && url.pathname === "/admin/access") { const body = await objectBody(request); return this.adminJson({ granted: await this.deps.access.setAccess(stringField(body, "userId"), stringField(body, "mcpServerId"), Boolean(body.granted)) }); }
      const userId = /^\/admin\/users\/([^/]+)$/.exec(url.pathname)?.[1];
      if (userId && request.method === "PATCH") return this.adminJson(await awaitRequired(this.deps.access.updateUser(userId, await userUpdateBody(request))));
      if (userId && request.method === "DELETE") return this.deleteResult(await this.deps.access.removeUser(userId));
      const serverId = /^\/admin\/servers\/([^/]+)$/.exec(url.pathname)?.[1];
      if (serverId && request.method === "PATCH") return this.adminJson(await awaitRequired(this.deps.access.updateMcpServer(serverId, await serverUpdateBody(request))));
      if (serverId && request.method === "DELETE") return this.deleteResult(await this.deps.access.removeMcpServer(serverId));
      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid admin request" }, { status: 400 }); }
  }

  private adminJson(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "no-store" } }); }
  private deleteResult(deleted: boolean) { return deleted ? new Response(null, { status: 204 }) : Response.json({ error: "Not found" }, { status: 404 }); }
  private json(body: JsonRpcResponse) { return Response.json(body, { headers: { "cache-control": "no-store" } }); }
}

async function objectBody(request: Request) { const body: unknown = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected a JSON object"); return body as Record<string, unknown>; }
async function userBody(request: Request): Promise<GatewayUser> { const body = await objectBody(request); return { id: stringField(body, "id"), name: stringField(body, "name"), enabled: Boolean(body.enabled) }; }
async function userUpdateBody(request: Request): Promise<Omit<GatewayUser, "id">> { const body = await objectBody(request); return { name: stringField(body, "name"), enabled: Boolean(body.enabled) }; }
async function serverBody(request: Request): Promise<McpServer> { const body = await objectBody(request); return { id: stringField(body, "id"), ...serverFields(body) }; }
async function serverUpdateBody(request: Request): Promise<Omit<McpServer, "id">> { return serverFields(await objectBody(request)); }
function serverFields(body: Record<string, unknown>): Omit<McpServer, "id"> {
  const kind = stringField(body, "kind");
  if (kind !== "demo" && kind !== "remote") throw new Error("Server kind must be demo or remote");
  const optionalTrimmed = (field: string) => typeof body[field] === "string" && (body[field] as string).trim() ? (body[field] as string).trim() : undefined;
  const endpoint = optionalTrimmed("endpoint");
  const description = optionalTrimmed("description");
  const authorizationHeader = optionalTrimmed("authorizationHeader");
  const authHeaderName = optionalTrimmed("authHeaderName");
  return { name: stringField(body, "name"), kind, ...(description ? { description } : {}), ...(endpoint ? { endpoint } : {}), ...(authorizationHeader ? { authorizationHeader } : {}), ...(authHeaderName ? { authHeaderName } : {}) };
}
function stringField(body: Record<string, unknown>, name: string) { const value = body[name]; if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`); return value.trim(); }
function awaitRequired<T>(value: Promise<T | undefined>) { return value.then((result) => { if (!result) throw new Error("Not found"); return result; }); }
function isRequest(value: unknown): value is JsonRpcRequest { return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).jsonrpc === "2.0" && typeof (value as Record<string, unknown>).method === "string"); }
interface GatewayTool { name: string; description?: string; inputSchema?: Record<string, unknown>; [key: string]: unknown; }
function isGatewayTool(value: unknown): value is GatewayTool { return Boolean(value && typeof value === "object" && typeof (value as GatewayTool).name === "string"); }
function toMcpTool(tool: { name: string; description: string; inputSchema: Record<string, unknown> }): GatewayTool { return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema }; }
function toGatewayTool(server: McpServer, tool: GatewayTool): GatewayTool { return { ...tool, name: `${server.id}__${tool.name}`, description: tool.description ? `[${server.name}] ${tool.description}` : `Tool from ${server.name}` }; }
function findToolTarget(servers: readonly McpServer[], gatewayToolName: string) {
  const server = [...servers].sort((left, right) => right.id.length - left.id.length).find((candidate) => gatewayToolName.startsWith(`${candidate.id}__`));
  return server ? { server, upstreamToolName: gatewayToolName.slice(server.id.length + 2) } : undefined;
}
function parseRpcBody(body: string, contentType: string): unknown {
  if (!contentType.includes("text/event-stream")) return JSON.parse(body);
  const dataLines = body.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
  if (!dataLines.length) throw new Error("Empty event-stream response from upstream MCP");
  return JSON.parse(dataLines[dataLines.length - 1]);
}
const serverIcons = [
  { src: "https://somoscria.ar/favicon-192.png", mimeType: "image/png", sizes: ["192x192"] },
  { src: "https://somoscria.ar/favicon-32x32.png", mimeType: "image/png", sizes: ["32x32"] }
];
function discoveryResult() { return { resultType: "complete", supportedVersions: ["2026-07-28"], capabilities: { tools: { listChanged: false } }, _meta: { "io.modelcontextprotocol/serverInfo": { name: "cria-mcp-gateway", version: "0.3.0", icons: serverIcons } }, ttlMs: 0, cacheScope: "private" }; }
function legacyInitializeResult() { return { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "cria-mcp-gateway", version: "0.3.0", icons: serverIcons } }; }
function safeHeaders(headers: Headers) { return Object.fromEntries([...headers].map(([key, value]) => [key, /authorization|cookie|token|secret|api[-_]?key|admin[-_]?key/i.test(key) ? "[redacted]" : truncate(value)])); }
function sanitize(value: unknown): unknown { if (typeof value === "string") return truncate(value); if (Array.isArray(value)) return value.map(sanitize); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, /password|token|secret|authorization|api[-_]?key|admin[-_]?key/i.test(key) ? "[redacted]" : sanitize(item)])); return value; }
function truncate(value: string) { value = value.replace(/cria_[a-f0-9]{64}/g, "[redacted]"); return value.length > 2000 ? `${value.slice(0, 2000)}…[truncated]` : value; }
