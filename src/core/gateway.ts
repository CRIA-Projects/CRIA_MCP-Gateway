import type { AccessConfiguration } from "../access/configuration.js";
import type { AuditLog } from "../audit/audit.js";
import type { IdentityResolver } from "../identity/identity.js";
import type { PolicyService } from "../policy/policy.js";
import type { ToolRegistry } from "../registry/registry.js";
import type { ToolRouter } from "../router/router.js";
import { failure, success, type JsonRpcRequest, type JsonRpcResponse } from "./protocol.js";

export interface GatewayDependencies {
  identity: IdentityResolver;
  policy: PolicyService;
  registry: ToolRegistry;
  router: ToolRouter;
  audit: AuditLog;
  access: AccessConfiguration;
}

export class GatewayApplication {
  constructor(private readonly deps: GatewayDependencies) {}

  async handleRequest(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (request.method === "GET" && pathname === "/health") {
      return Response.json({ status: "ok", service: "cria-mcp-gateway" });
    }
    if (request.method === "GET" && pathname === "/admin/config") {
      return Response.json(await this.deps.access.publicView(), { headers: { "cache-control": "no-store" } });
    }
    const mcpServerId = this.mcpServerId(pathname);
    if (request.method !== "POST" || !mcpServerId) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await this.deps.access.findMcpServer(mcpServerId))) return Response.json({ error: "MCP server not found" }, { status: 404 });
    let message: unknown;
    try { message = await request.json(); } catch { return this.json(failure(null, -32700, "Parse error")); }
    if (!isRequest(message)) return this.json(failure(null, -32600, "Invalid Request"));
    if (message.id === undefined) return new Response(null, { status: 202 });
    return this.json(await this.dispatch(request, message, mcpServerId));
  }

  private async dispatch(request: Request, message: JsonRpcRequest, mcpServerId: string): Promise<JsonRpcResponse> {
    const id = message.id ?? null;
    const principal = await this.deps.identity.resolve(request);
    if (!(await this.deps.policy.canUseMcp(principal, mcpServerId))) {
      if (message.method === "tools/list" || message.method === "tools/call") await this.audit(principal.id, message.method, undefined, "denied");
      return failure(id, -32003, "MCP access denied");
    }
    if (message.method === "initialize") {
      return success(id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "cria-mcp-gateway", version: "0.1.0" } });
    }
    if (message.method === "tools/list") {
      const tools = await this.deps.registry.list(mcpServerId);
      const visible = tools.map(toMcpTool);
      await this.audit(principal.id, "tools/list", undefined, "allowed");
      return success(id, { tools: visible });
    }
    if (message.method === "tools/call") return this.callTool(principal.id, id, mcpServerId, message.params);
    return failure(id, -32601, "Method not found");
  }

  private async callTool(clientId: string, id: JsonRpcRequest["id"], mcpServerId: string, params: Record<string, unknown> | undefined): Promise<JsonRpcResponse> {
    const toolName = typeof params?.name === "string" ? params.name : undefined;
    if (!toolName) return failure(id ?? null, -32602, "tools/call requires a string params.name");
    const tool = await this.deps.registry.find(mcpServerId, toolName);
    if (!tool) return failure(id ?? null, -32602, "Unknown tool");
    try {
      const rawArgs = params?.arguments;
      const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs as Record<string, unknown> : {};
      const result = await this.deps.router.call(tool, args);
      await this.audit(clientId, "tools/call", toolName, "allowed");
      return success(id ?? null, result);
    } catch {
      await this.audit(clientId, "tools/call", toolName, "error");
      return failure(id ?? null, -32603, "Tool execution failed");
    }
  }

  private async audit(clientId: string, action: "tools/list" | "tools/call", toolName: string | undefined, decision: "allowed" | "denied" | "error") {
    await this.deps.audit.record({ at: new Date().toISOString(), clientId, action, toolName, decision });
  }
  private json(body: JsonRpcResponse): Response { return Response.json(body, { headers: { "cache-control": "no-store" } }); }

  private mcpServerId(pathname: string): string | undefined {
    if (pathname === "/mcp") return "demo";
    const match = /^\/mcp\/([^/]+)$/.exec(pathname);
    return match ? decodeURIComponent(match[1]) : undefined;
  }
}

function isRequest(value: unknown): value is JsonRpcRequest {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).jsonrpc === "2.0" && typeof (value as Record<string, unknown>).method === "string");
}

function toMcpTool(tool: { name: string; description: string; inputSchema: Record<string, unknown> }) {
  return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
}
