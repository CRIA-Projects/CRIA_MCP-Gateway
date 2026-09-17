import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AccessStateStorage, MutableState, PublicGatewayConfiguration } from "../../access/configuration.js";
import type { AuditEvent, AuditStorage } from "../../audit/audit.js";

import type { CredentialStore, DeviceCredential } from "../../identity/credentials.js";

const schemaVersion = 2;

export class SqlitePersistence {
  private readonly db: DatabaseSync;
  readonly access: AccessStateStorage;
  readonly audit: AuditStorage;
  readonly credentials: CredentialStore;

  constructor(path: string) {
    if (!path.trim() || path === ":memory:") throw new Error("SQLITE_PATH must identify a persistent database file");
    const filename = resolve(path);
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename, { timeout: 5000 });
    try {
      chmodSync(filename, 0o600);
      this.migrate();
      this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
    } catch (error) { this.db.close(); throw error; }

    const metadata = (row: Record<string, unknown>): DeviceCredential => ({
      id: String(row.id), userId: String(row.user_id), deviceName: String(row.device_name),
      createdAt: String(row.created_at), expiresAt: String(row.expires_at),
      ...(row.last_used_at ? { lastUsedAt: String(row.last_used_at) } : {}),
      ...(row.revoked_at ? { revokedAt: String(row.revoked_at) } : {})
    });
    this.credentials = {
      insert: async c => this.transaction(() => {
        if (!this.readAccess()?.users.some(u => u.id === c.userId && u.enabled)) throw new Error("An enabled user is required");
        this.db.prepare("INSERT INTO device_credentials (id,user_id,device_name,token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)")
          .run(c.id, c.userId, c.deviceName, c.tokenHash, c.createdAt, c.expiresAt);
      }),
      list: async () => this.db.prepare("SELECT id,user_id,device_name,created_at,expires_at,last_used_at,revoked_at FROM device_credentials ORDER BY created_at DESC").all().map(metadata),
      consume: async (tokenHash, now) => this.transaction(() => {
        const row = this.db.prepare("UPDATE device_credentials SET last_used_at=? WHERE token_hash=? AND revoked_at IS NULL AND expires_at>? RETURNING id,user_id,device_name,created_at,expires_at,last_used_at,revoked_at").get(now, tokenHash, now);
        return row ? metadata(row) : undefined;
      }),
      revoke: async (id, now) => Number(this.db.prepare("UPDATE device_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE id=?").run(now, id).changes) > 0,
      revokeUser: async (userId, now) => { this.db.prepare("UPDATE device_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE user_id=?").run(now, userId); }
    };

    this.access = {
      read: async () => this.readAccess(),
      write: async (state) => { this.transaction(() => this.writeAccess(state)); },
      update: async <T>(seed: PublicGatewayConfiguration, operation: (state: MutableState) => T): Promise<T> => this.transaction(() => {
        const state = structuredClone(this.readAccess() ?? seed) as MutableState;
        const result = operation(state);
        this.writeAccess(state);
        return structuredClone(result);
      })
    };
    this.audit = {
      read: async () => this.db.prepare("SELECT payload FROM audit_events ORDER BY sequence DESC").all().map((row) => JSON.parse(String(row.payload)) as AuditEvent),
      write: async (events) => this.transaction(() => {
        this.db.exec("DELETE FROM audit_events");
        for (const event of [...events].reverse()) this.insertEvent(event);
      }),
      append: async (event, maximumEvents) => this.transaction(() => {
        if (!Number.isInteger(maximumEvents) || maximumEvents < 1) throw new Error("Invalid audit retention");
        this.insertEvent(event);
        this.db.prepare("DELETE FROM audit_events WHERE sequence NOT IN (SELECT sequence FROM audit_events ORDER BY sequence DESC LIMIT ?)").run(maximumEvents);
      })
    };
  }

  close(): void { if (this.db.isOpen) this.db.close(); }

  private migrate(): void {
    this.transaction(() => {
      const version = Number(this.db.prepare("PRAGMA user_version").get()?.user_version);
      if (version > schemaVersion) throw new Error(`SQLite schema ${version} is newer than supported version ${schemaVersion}`);
      if (version === 0) {
        this.db.exec(`
          CREATE TABLE access_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL CHECK (json_valid(payload))
          );
          CREATE TABLE audit_events (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL UNIQUE,
            payload TEXT NOT NULL CHECK (json_valid(payload))
          );
          PRAGMA user_version = 1;
        `);
      }
      if (version < 2) {
        this.db.exec(`
          CREATE TABLE device_credentials (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_name TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
            created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
            last_used_at TEXT, revoked_at TEXT
          );
          CREATE INDEX device_credentials_user ON device_credentials(user_id);
          PRAGMA user_version = 2;
        `);
      }
    });
  }

  private readAccess(): PublicGatewayConfiguration | undefined {
    const row = this.db.prepare("SELECT payload FROM access_state WHERE id = 1").get();
    return row ? JSON.parse(String(row.payload)) as PublicGatewayConfiguration : undefined;
  }

  private writeAccess(state: PublicGatewayConfiguration): void {
    // Runs in the same transaction as user mutations. Recreating an ID never revives old keys.
    const enabled = new Set(state.users.filter(user => user.enabled).map(user => user.id));
    for (const row of this.db.prepare("SELECT DISTINCT user_id FROM device_credentials WHERE revoked_at IS NULL").all()) {
      if (!enabled.has(String(row.user_id))) this.db.prepare("UPDATE device_credentials SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").run(new Date().toISOString(), String(row.user_id));
    }
    this.db.prepare("INSERT INTO access_state (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload").run(JSON.stringify(state));
  }

  private insertEvent(event: AuditEvent): void {
    this.db.prepare("INSERT INTO audit_events (event_id, payload) VALUES (?, ?)").run(event.id, JSON.stringify(event));
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
