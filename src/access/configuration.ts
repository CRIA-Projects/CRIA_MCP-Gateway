export interface GatewayUser { id: string; name: string; enabled: boolean; }
export type McpServerKind = "demo" | "remote";
export interface McpServer { id: string; name: string; description: string; kind: McpServerKind; endpoint?: string; }
export interface McpAccessAssignment { userId: string; mcpServerId: string; }
export interface PublicGatewayConfiguration { users: readonly GatewayUser[]; mcpServers: readonly McpServer[]; assignments: readonly McpAccessAssignment[]; }

export interface AccessConfiguration {
  findUser(id: string): Promise<GatewayUser | undefined>;
  findMcpServer(id: string): Promise<McpServer | undefined>;
  hasAccess(userId: string, mcpServerId: string): Promise<boolean>;
  publicView(): Promise<PublicGatewayConfiguration>;
  createUser(input: GatewayUser): Promise<GatewayUser>;
  updateUser(id: string, input: Omit<GatewayUser, "id">): Promise<GatewayUser | undefined>;
  removeUser(id: string): Promise<boolean>;
  createMcpServer(input: McpServer): Promise<McpServer>;
  updateMcpServer(id: string, input: Omit<McpServer, "id">): Promise<McpServer | undefined>;
  removeMcpServer(id: string): Promise<boolean>;
  setAccess(userId: string, mcpServerId: string, granted: boolean): Promise<boolean>;
}

export interface AccessStateStorage { read(): Promise<PublicGatewayConfiguration | undefined>; write(state: PublicGatewayConfiguration): Promise<void>; }

export class InMemoryAccessStateStorage implements AccessStateStorage {
  private state?: PublicGatewayConfiguration;
  constructor(seed: PublicGatewayConfiguration) { this.state = copy(seed); }
  async read(): Promise<PublicGatewayConfiguration | undefined> { return this.state && copy(this.state); }
  async write(state: PublicGatewayConfiguration): Promise<void> { this.state = copy(state); }
}

export class PersistentAccessConfiguration implements AccessConfiguration {
  constructor(private readonly storage: AccessStateStorage, private readonly seed: PublicGatewayConfiguration) {}
  async findUser(id: string) { return (await this.state()).users.find((user) => user.id === id); }
  async findMcpServer(id: string) { return (await this.state()).mcpServers.find((server) => server.id === id); }
  async hasAccess(userId: string, mcpServerId: string) { return (await this.state()).assignments.some((assignment) => assignment.userId === userId && assignment.mcpServerId === mcpServerId); }
  async publicView() { return this.state(); }
  async createUser(input: GatewayUser) { validateUser(input); return this.mutate((state) => { if (state.users.some((user) => user.id === input.id)) throw new Error("A user with this ID already exists"); state.users.push(copy(input)); return input; }); }
  async updateUser(id: string, input: Omit<GatewayUser, "id">) { validateUser({ id, ...input }); return this.mutate((state) => { const user = state.users.find((candidate) => candidate.id === id); if (!user) return undefined; Object.assign(user, input); return copy(user); }); }
  async removeUser(id: string) { return this.mutate((state) => { const existed = state.users.some((user) => user.id === id); state.users = state.users.filter((user) => user.id !== id); state.assignments = state.assignments.filter((assignment) => assignment.userId !== id); return existed; }); }
  async createMcpServer(input: McpServer) { validateServer(input); return this.mutate((state) => { if (state.mcpServers.some((server) => server.id === input.id)) throw new Error("An MCP server with this ID already exists"); state.mcpServers.push(copy(input)); return input; }); }
  async updateMcpServer(id: string, input: Omit<McpServer, "id">) { validateServer({ id, ...input }); return this.mutate((state) => { const server = state.mcpServers.find((candidate) => candidate.id === id); if (!server) return undefined; Object.assign(server, input); if (input.kind === "demo") delete server.endpoint; else server.endpoint = input.endpoint; return copy(server); }); }
  async removeMcpServer(id: string) { return this.mutate((state) => { const existed = state.mcpServers.some((server) => server.id === id); state.mcpServers = state.mcpServers.filter((server) => server.id !== id); state.assignments = state.assignments.filter((assignment) => assignment.mcpServerId !== id); return existed; }); }
  async setAccess(userId: string, mcpServerId: string, granted: boolean) { return this.mutate((state) => { if (!state.users.some((user) => user.id === userId) || !state.mcpServers.some((server) => server.id === mcpServerId)) throw new Error("User or MCP server was not found"); const exists = state.assignments.some((assignment) => assignment.userId === userId && assignment.mcpServerId === mcpServerId); if (granted && !exists) state.assignments.push({ userId, mcpServerId }); if (!granted && exists) state.assignments = state.assignments.filter((assignment) => assignment.userId !== userId || assignment.mcpServerId !== mcpServerId); return granted; }); }
  private async state() { const stored = await this.storage.read(); if (stored) return copy(stored); const seeded = copy(this.seed); await this.storage.write(seeded); return seeded; }
  private async mutate<T>(operation: (state: MutableState) => T): Promise<T> { const state = copy(await this.state()) as MutableState; const result = operation(state); await this.storage.write(state); return copy(result); }
}

type MutableState = { users: GatewayUser[]; mcpServers: McpServer[]; assignments: McpAccessAssignment[] };
const idPattern = /^[a-z0-9][a-z0-9-_]{0,62}$/;
function validateUser(user: GatewayUser) { if (!idPattern.test(user.id) || !user.name.trim()) throw new Error("User requires a lowercase ID and a name"); }
function validateServer(server: McpServer) { if (!idPattern.test(server.id) || !server.name.trim() || !server.description.trim()) throw new Error("MCP server requires a lowercase ID, name, and description"); if (server.kind === "demo" && server.endpoint) throw new Error("A demo MCP server cannot have an endpoint"); if (server.kind === "remote") { if (!server.endpoint) throw new Error("A remote MCP server requires an HTTPS endpoint"); if (new URL(server.endpoint).protocol !== "https:") throw new Error("A remote MCP endpoint must use HTTPS"); } }
function copy<T>(value: T): T { return structuredClone(value); }

export const developmentAccessSeed: PublicGatewayConfiguration = {
  users: [{ id: "local-development-client", name: "Local development client", enabled: true }, { id: "ana", name: "Ana", enabled: true }, { id: "bruno", name: "Bruno", enabled: true }, { id: "invitado", name: "Invitado", enabled: false }],
  mcpServers: [{ id: "demo", name: "Demo Echo", description: "MCP de prueba para verificar el recorrido del gateway.", kind: "demo" }, { id: "analysis", name: "Análisis", description: "MCP de ejemplo para validar permisos por servidor.", kind: "demo" }],
  assignments: [{ userId: "local-development-client", mcpServerId: "demo" }, { userId: "ana", mcpServerId: "demo" }, { userId: "bruno", mcpServerId: "analysis" }]
};
export function createDevelopmentAccessConfiguration() { return new PersistentAccessConfiguration(new InMemoryAccessStateStorage(developmentAccessSeed), developmentAccessSeed); }
