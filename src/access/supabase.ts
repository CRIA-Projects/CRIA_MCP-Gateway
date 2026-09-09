import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessStateStorage, PublicGatewayConfiguration } from "./configuration.js";

export class SupabaseAccessStateStorage implements AccessStateStorage {
  constructor(
    private readonly client: SupabaseClient,
    private readonly table = "cria_gateway_access_state",
    private readonly rowId = "default"
  ) {}

  async read(): Promise<PublicGatewayConfiguration | undefined> {
    const { data, error } = await this.client.from(this.table).select("state").eq("id", this.rowId).maybeSingle();
    if (error) throw new Error(`Supabase access read failed: ${error.message}`);
    return (data?.state as PublicGatewayConfiguration | undefined) ?? undefined;
  }

  async write(state: PublicGatewayConfiguration): Promise<void> {
    const { error } = await this.client.from(this.table).upsert({ id: this.rowId, state, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Supabase access write failed: ${error.message}`);
  }
}
