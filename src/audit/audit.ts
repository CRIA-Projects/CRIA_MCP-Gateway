export interface AuditEvent {
  at: string;
  clientId: string;
  action: "tools/list" | "tools/call";
  toolName?: string;
  decision: "allowed" | "denied" | "error";
}

export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}

export class InMemoryAuditLog implements AuditLog {
  readonly events: AuditEvent[] = [];
  async record(event: AuditEvent): Promise<void> { this.events.push(event); }
}
