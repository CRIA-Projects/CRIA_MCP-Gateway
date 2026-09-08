import type { Store } from "@netlify/blobs";
import type { AuditEvent, AuditStorage } from "./audit.js";

export class NetlifyBlobAuditStorage implements AuditStorage {
  constructor(private readonly store: Store, private readonly key = "gateway-events") {}
  async read(): Promise<readonly AuditEvent[]> { return (await this.store.get(this.key, { type: "json", consistency: "strong" })) as AuditEvent[] | null ?? []; }
  async write(events: readonly AuditEvent[]): Promise<void> { await this.store.setJSON(this.key, events); }
}
