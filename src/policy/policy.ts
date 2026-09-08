import type { AccessConfiguration } from "../access/configuration.js";
import type { Principal } from "../identity/identity.js";

export interface PolicyService {
  canUseMcp(principal: Principal, mcpServerId: string): Promise<boolean>;
}

export class ConfiguredMcpPolicy implements PolicyService {
  constructor(private readonly access: AccessConfiguration) {}

  async canUseMcp(principal: Principal, mcpServerId: string): Promise<boolean> {
    const user = await this.access.findUser(principal.id);
    return Boolean(user?.enabled && await this.access.hasAccess(user.id, mcpServerId));
  }
}
