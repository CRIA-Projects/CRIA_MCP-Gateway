import type { ToolDefinition } from "../registry/registry.js";

export interface ToolRouter {
  call(tool: ToolDefinition, args: Record<string, unknown>): Promise<unknown>;
}

export class DemoToolRouter implements ToolRouter {
  async call(tool: ToolDefinition, args: Record<string, unknown>): Promise<unknown> {
    if (tool.upstreamId !== "demo") throw new Error(`No router adapter for upstream '${tool.upstreamId}'`);
    return { content: [{ type: "text", text: String(args.message ?? "Gateway route verified") }] };
  }
}
