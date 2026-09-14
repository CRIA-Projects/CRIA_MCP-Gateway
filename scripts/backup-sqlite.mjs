import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

process.umask(0o077);
const source = process.env.SQLITE_PATH;
const destination = process.argv[2];
if (!source || !destination) throw new Error("Usage: SQLITE_PATH=/data/gateway.sqlite node scripts/backup-sqlite.mjs /data/backups/snapshot.sqlite");
if (resolve(source) === resolve(destination)) throw new Error("Backup destination must differ from the source");
mkdirSync(dirname(resolve(destination)), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true, timeout: 5000 });
try {
  // Exclusive creation avoids overwriting an existing backup.
  closeSync(openSync(destination, "wx", 0o600));
  await backup(db, destination);
  console.log("SQLite backup completed");
} finally { db.close(); }
