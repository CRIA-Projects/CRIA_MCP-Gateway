# Plan
1. Provider-independent credential service and store port, SQLite v2 transactional migration, composition in standalone only.
2. Bearer authentication, protected admin lifecycle, sanitized auditing and permanent revocation on user disable/delete.
3. HUB device form/list/one-time secret, credential-based tester.
4. OS credential adapters and terminal enrollment; bridge HTTPS-only, endpoint-bound lookup, no legacy fallback.
5. Security integration tests, migration/backup/restart, Docker smoke, native macOS storage test, documentation and local migration.

Rollback: backup before v2 startup. Old images reject schema v2; restore pre-upgrade backup in isolation. Prefer rolling forward; restoring snapshots may resurrect revoked credentials, so revoke/reissue after restoration. Do not silently fall back to IDs.
