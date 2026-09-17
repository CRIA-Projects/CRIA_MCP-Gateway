# Device credentials

Systems provisions one revocable credential per user/device. The existing user ID remains administrative metadata and cannot authenticate requests. Scope: Docker/SQLite, HUB, local bridge on macOS and Windows. Netlify identity is unchanged.

## Acceptance criteria
- Docker rejects ID-only, missing, malformed, expired and revoked credentials without legacy fallback.
- A credential determines the user regardless of supplied IDs; existing assignments still control tools.
- Administrators issue a 256-bit random secret once, list only metadata, revoke devices and inspect last use. Expiry is mandatory (default 90 days, maximum 365).
- Disabling/deleting users permanently revokes their credentials; re-enabling/recreating does not revive keys.
- SQLite stores hashes only; migrations preserve existing users/assignments and survive restart/backup.
- Bridge uses HTTPS and an OS credential store. No key in JSON, environment variables, command arguments or logs. Credential lookup is bound to gateway URL and profile.
- HUB supports issue/list/revoke and one-time display. HUB diagnostics allow administrators to list tools by user via an admin-authenticated route; device connections still require credentials.
- Documentation includes provisioning, migration, rollback and shared-key limitations.

## Boundaries
A copied credential can be reused until revoked. Device labels are administrative, not hardware attestation. No SSO/OAuth/MFA in this release. TLS terminates at a trusted reverse proxy; internal HTTP stays restricted to the host/private container network.

## Handoff
- Spec owner: Codex
- Plan agent: Codex
- Implementation agent: Codex
- Spec confidence: high
- Blocking questions: none
- Ready for /plan: yes
