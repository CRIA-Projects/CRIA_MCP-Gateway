import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AccessStateStorage, MutableState, PublicGatewayConfiguration } from "../../access/configuration.js";
import type { AuditEvent, AuditStorage } from "../../audit/audit.js";

const schemaVersion = 1;

export class SqlitePersistence {
  private readonly db: DatabaseSync;
  readonly access: AccessStateStorage;
  readonly audit: AuditStorage;

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

    this.access = {
      read: async () => this.readAccess(),
      write: async (state) => { this.writeAccess(state); },
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
    });
  }

  private readAccess(): PublicGatewayConfiguration | undefined {
    const row = this.db.prepare("SELECT payload FROM access_state WHERE id = 1").get();
    return row ? JSON.parse(String(row.payload)) as PublicGatewayConfiguration : undefined;
  }

  private writeAccess(state: PublicGatewayConfiguration): void {
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
