# Implementation plan

1. Data: SQLite schema v1, atomic access mutations and audit append, reopen/concurrency/rollback tests.
2. Backend: standalone composition, required admin key, empty seed, HTTP error handling and graceful shutdown.
3. DevOps: multi-stage image, Compose volume and VPN bind options, explicit build context, backups and local bridge.
4. Verification: type-check, existing suite, SQLite/HTTP/bridge integration tests, Docker smoke script; report actual container verification separately.

The database driver is not imported by the Netlify composition root. No changes to frontend features, identity resolution or upstream HTTPS policy are needed.
