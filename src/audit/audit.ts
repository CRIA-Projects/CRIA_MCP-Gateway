export interface AuditEvent {
  id: string;
  at: string;
  httpMethod: string;
  path: string;
  query: Record<string, string>;
  mcpServerId?: string;
  clientId?: string;
  rpcMethod?: string;
  rpcId?: string | number | null;
  params?: unknown;
  headers: Record<string, string>;
  decision: "allowed" | "denied" | "error";
  status: number;
  errorCode?: number;
}

export interface AuditLog { record(event: AuditEvent): Promise<void>; list(limit: number): Promise<readonly AuditEvent[]>; }
export interface AuditStorage { read(): Promise<readonly AuditEvent[]>; write(events: readonly AuditEvent[]): Promise<void>; }

export class InMemoryAuditStorage implements AuditStorage {
  private events: AuditEvent[] = [];
  async read() { return structuredClone(this.events); }
  async write(events: readonly AuditEvent[]) { this.events = structuredClone(events) as AuditEvent[]; }
}

export class PersistentAuditLog implements AuditLog {
  constructor(private readonly storage: AuditStorage, private readonly maximumEvents = 200) {}
  async record(event: AuditEvent) { const events = await this.storage.read(); await this.storage.write([structuredClone(event), ...events].slice(0, this.maximumEvents)); }
  async list(limit: number) { return (await this.storage.read()).slice(0, Math.min(Math.max(limit, 1), this.maximumEvents)); }
}

export function createDevelopmentAuditLog() { return new PersistentAuditLog(new InMemoryAuditStorage()); }
