# Self-hosted Docker + SQLite

Authorized scope: one private-network installation per customer, with the existing HUB, user assignments and audit log. Keep Netlify available. The branch includes the upstream protocol-isolation fix.

Acceptance criteria:
- Docker Compose starts the Node HTTP server and HUB without Netlify or Supabase credentials.
- Users, MCP definitions/credentials, assignments and the latest 200 audit events persist in a SQLite volume across container recreation.
- Concurrent administrative writes do not lose unrelated changes. Migrations are transactional and newer schema versions are rejected.
- The image runs as a non-root user. Compose defaults to loopback publishing; administrators explicitly select a VPN IP. A non-development admin key is required, and a new database has no demo users or access grants.
- Keep the existing x-client-id assignment model. An omitted ID has no default access in the SQLite edition unless explicitly configured. This is trusted-network identification, not authentication.
- Provide backup/restore, upgrades, VPN routing/TLS instructions and a local stdio-to-HTTP bridge for Claude Desktop. Cloud remote connectors cannot enter a private VPN directly.
- Test disk persistence, concurrent writes, revocation, audit retention, backup, HTTP process restarts and bridge forwarding. Include a Docker smoke check for environments with Docker.

Not included: OAuth, public hosting, an embedded VPN, replicas/high availability, importing existing Supabase/Netlify data, or fully offline AI. No customer production deployment is requested.

Design review: preserve the core ports. Wire SQLite exclusively at the standalone transport edge, using Node 24's built-in SQLite driver. Keep one JSON configuration row to preserve existing validation and API semantics; transact read-modify-write operations. Store audit events as individual rows for atomic append/retention. SQLite lives on local disk, not NFS/SMB. Snapshot schema v1 before upgrading; rollback uses the previous image and a separate restored volume.
