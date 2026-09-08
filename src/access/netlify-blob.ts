import type { Store } from "@netlify/blobs";
import type { AccessStateStorage, PublicGatewayConfiguration } from "./configuration.js";

export class NetlifyBlobAccessStateStorage implements AccessStateStorage {
  constructor(private readonly store: Store, private readonly key = "access-configuration") {}

  async read(): Promise<PublicGatewayConfiguration | undefined> {
    return (await this.store.get(this.key, { type: "json", consistency: "strong" })) as PublicGatewayConfiguration | null ?? undefined;
  }

  async write(state: PublicGatewayConfiguration): Promise<void> {
    await this.store.setJSON(this.key, state);
  }
}
