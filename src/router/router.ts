import type { McpServer } from "../access/configuration.js";
import type { JsonRpcRequest } from "../core/protocol.js";
import type { ToolDefinition } from "../registry/registry.js";

export interface RemoteMcpResponse { status: number; contentType: string; body: string; }
export interface ToolRouter {
  call(tool: ToolDefinition, args: Record<string, unknown>): Promise<unknown>;
  forward(server: McpServer, message: JsonRpcRequest, incomingHeaders: Headers): Promise<RemoteMcpResponse>;
}

export class DemoToolRouter implements ToolRouter {
  async call(tool: ToolDefinition, args: Record<string, unknown>): Promise<unknown> {
    if (tool.upstreamId !== "demo") throw new Error(`No router adapter for upstream '${tool.upstreamId}'`);
    return { content: [{ type: "text", text: String(args.message ?? "Gateway route verified") }] };
  }

  async forward(server: McpServer, message: JsonRpcRequest, incomingHeaders: Headers): Promise<RemoteMcpResponse> {
    if (!server.endpoint) throw new Error("Remote MCP endpoint is missing");
    const headers = this.buildHeaders(server, incomingHeaders);
    const session = await this.initializeSession(server.endpoint, headers);
    if (session?.id) headers.set("mcp-session-id", session.id);
    if (session) await this.notifyInitialized(server.endpoint, headers);
    const response = await this.post(server.endpoint, headers, message);
    return { status: response.status, contentType: response.headers.get("content-type") ?? "application/json", body: await response.text() };
  }

  private buildHeaders(server: McpServer, incomingHeaders: Headers): Headers {
    // Always the MCP-mandated accept value for the upstream leg, regardless of what the
    // original caller sent us: we parse the upstream's response ourselves (JSON or SSE),
    // so the caller's own Accept header is irrelevant here and passing it through broke
    // strict upstream servers that reject anything but this exact value (406).
    const headers = new Headers({ "content-type": "application/json", accept: "application/json, text/event-stream" });
    const protocolVersion = incomingHeaders.get("mcp-protocol-version");
    if (protocolVersion) headers.set("mcp-protocol-version", protocolVersion);
    if (server.authorizationHeader) headers.set(server.authHeaderName ?? "authorization", server.authorizationHeader);
    return headers;
  }

  // Some remote MCP servers (e.g. those built on the official SDK's Streamable HTTP
  // transport) reject requests until the legacy lifecycle completes. We open a fresh
  // session per forwarded call rather than caching one, matching the gateway's stateless
  // MVP scope; servers that don't require sessions simply ignore the extra messages.
  private async initializeSession(endpoint: string, headers: Headers): Promise<{ id?: string } | undefined> {
    try {
      const response = await this.post(endpoint, headers, {
        jsonrpc: "2.0",
        id: "gateway-init",
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "cria-mcp-gateway", version: "0.3.0" } }
      });
      return response.ok ? { id: response.headers.get("mcp-session-id") ?? undefined } : undefined;
    } catch { return undefined; }
  }

  private async notifyInitialized(endpoint: string, headers: Headers): Promise<void> {
    try {
      await this.post(endpoint, headers, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    } catch { /* Older or non-conformant upstreams may reject this notification but still accept tools/list. */ }
  }

  private post(endpoint: string, headers: Headers, message: JsonRpcRequest): Promise<Response> {
    return fetch(endpoint, { method: "POST", headers, body: JSON.stringify(message), signal: AbortSignal.timeout(20_000) });
  }
}
