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
    const headers = new Headers({ "content-type": "application/json", accept: incomingHeaders.get("accept") ?? "application/json, text/event-stream" });
    const protocolVersion = incomingHeaders.get("mcp-protocol-version");
    if (protocolVersion) headers.set("mcp-protocol-version", protocolVersion);
    const response = await fetch(server.endpoint, { method: "POST", headers, body: JSON.stringify(message), signal: AbortSignal.timeout(20_000) });
    return { status: response.status, contentType: response.headers.get("content-type") ?? "application/json", body: await response.text() };
  }
}
