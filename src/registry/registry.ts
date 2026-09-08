export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mcpServerId: string;
  upstreamId: string;
}

export interface ToolRegistry {
  list(mcpServerId: string): Promise<readonly ToolDefinition[]>;
  find(mcpServerId: string, name: string): Promise<ToolDefinition | undefined>;
}

export class InMemoryToolRegistry implements ToolRegistry {
  constructor(private readonly tools: readonly ToolDefinition[]) {}

  async list(mcpServerId: string): Promise<readonly ToolDefinition[]> { return this.tools.filter((tool) => tool.mcpServerId === mcpServerId); }
  async find(mcpServerId: string, name: string): Promise<ToolDefinition | undefined> { return this.tools.find((tool) => tool.mcpServerId === mcpServerId && tool.name === name); }
}
