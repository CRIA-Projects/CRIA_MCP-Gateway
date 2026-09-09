import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, AuditStorage } from "./audit.js";

export class SupabaseAuditStorage implements AuditStorage {
  constructor(
    private readonly client: SupabaseClient,
    private readonly table = "cria_gateway_audit_events",
    private readonly rowId = "default"
  ) {}

  async read(): Promise<readonly AuditEvent[]> {
    const { data, error } = await this.client.from(this.table).select("events").eq("id", this.rowId).maybeSingle();
    if (error) throw new Error(`Supabase audit read failed: ${error.message}`);
    return (data?.events as AuditEvent[] | undefined) ?? [];
  }

  async write(events: readonly AuditEvent[]): Promise<void> {
    const { error } = await this.client.from(this.table).upsert({ id: this.rowId, events, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Supabase audit write failed: ${error.message}`);
  }
}
