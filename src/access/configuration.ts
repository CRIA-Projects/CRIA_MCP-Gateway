export interface GatewayUser {
  id: string;
  name: string;
  enabled: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  description: string;
}

export interface McpAccessAssignment {
  userId: string;
  mcpServerId: string;
}

export interface PublicGatewayConfiguration {
  users: readonly GatewayUser[];
  mcpServers: readonly McpServer[];
  assignments: readonly McpAccessAssignment[];
}

export interface AccessConfiguration {
  findUser(id: string): Promise<GatewayUser | undefined>;
  findMcpServer(id: string): Promise<McpServer | undefined>;
  hasAccess(userId: string, mcpServerId: string): Promise<boolean>;
  publicView(): Promise<PublicGatewayConfiguration>;
}

export class StaticAccessConfiguration implements AccessConfiguration {
  constructor(private readonly config: PublicGatewayConfiguration) {}

  async findUser(id: string): Promise<GatewayUser | undefined> {
    return this.config.users.find((user) => user.id === id);
  }

  async findMcpServer(id: string): Promise<McpServer | undefined> {
    return this.config.mcpServers.find((server) => server.id === id);
  }

  async hasAccess(userId: string, mcpServerId: string): Promise<boolean> {
    return this.config.assignments.some((assignment) => assignment.userId === userId && assignment.mcpServerId === mcpServerId);
  }

  async publicView(): Promise<PublicGatewayConfiguration> {
    return this.config;
  }
}

export const developmentAccessConfiguration = new StaticAccessConfiguration({
  users: [
    { id: "local-development-client", name: "Local development client", enabled: true },
    { id: "ana", name: "Ana", enabled: true },
    { id: "bruno", name: "Bruno", enabled: true },
    { id: "invitado", name: "Invitado", enabled: false }
  ],
  mcpServers: [
    { id: "demo", name: "Demo Echo", description: "MCP de prueba para verificar el recorrido del gateway." },
    { id: "analysis", name: "Análisis", description: "MCP de ejemplo para validar permisos por servidor." }
  ],
  assignments: [
    { userId: "local-development-client", mcpServerId: "demo" },
    { userId: "ana", mcpServerId: "demo" },
    { userId: "bruno", mcpServerId: "analysis" },
    { userId: "invitado", mcpServerId: "demo" }
  ]
});
