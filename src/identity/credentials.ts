import type { AccessConfiguration } from "../access/configuration.js";
import type { IdentityResolver, Principal } from "./identity.js";

export interface DeviceCredential {
  id: string; userId: string; deviceName: string; createdAt: string; expiresAt: string;
  lastUsedAt?: string; revokedAt?: string;
}
export interface StoredCredential extends DeviceCredential { tokenHash: string; }
export interface CredentialStore {
  insert(credential: StoredCredential): Promise<void>;
  list(): Promise<DeviceCredential[]>;
  // Atomically checks expiry/revocation and records use.
  consume(tokenHash: string, now: string): Promise<DeviceCredential | undefined>;
  revoke(id: string, now: string): Promise<boolean>;
  revokeUser(userId: string, now: string): Promise<void>;
}

export class DeviceCredentials implements IdentityResolver {
  constructor(private readonly store: CredentialStore, private readonly access: AccessConfiguration) {}

  async issue(userId: string, deviceName: string, expiresInDays = 90) {
    if (!(await this.access.findUser(userId))?.enabled) throw new Error("An enabled user is required");
    if (!deviceName.trim() || deviceName.length > 100) throw new Error("Device name must contain 1–100 characters");
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) throw new Error("Expiry must be 1–365 days");
    const token = "cria_" + Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    const now = Date.now();
    const credential: DeviceCredential = { id: crypto.randomUUID(), userId, deviceName: deviceName.trim(), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + expiresInDays * 86400000).toISOString() };
    await this.store.insert({ ...credential, tokenHash: await hash(token) });
    // A concurrent user disable/delete must not leave an active issued credential.
    if (!(await this.access.findUser(userId))?.enabled) {
      await this.store.revoke(credential.id, new Date().toISOString());
      throw new Error("User is no longer enabled");
    }
    return { credential, token };
  }

  list() { return this.store.list(); }
  revoke(id: string) { return this.store.revoke(id, new Date().toISOString()); }
  revokeUser(userId: string) { return this.store.revokeUser(userId, new Date().toISOString()); }

  async resolve(request: Request): Promise<Principal> {
    const token = /^Bearer (cria_[a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
    const denied: Principal = { id: "", kind: "client" };
    if (!token) return denied;
    const credential = await this.store.consume(await hash(token), new Date().toISOString());
    if (!credential || !(await this.access.findUser(credential.userId))?.enabled) return denied;
    return { id: credential.userId, kind: "client", credentialId: credential.id };
  }
}
async function hash(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), b => b.toString(16).padStart(2, "0")).join("");
}
