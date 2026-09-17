# Review and validation

- TypeScript check passed; 24 automated tests passed (native store suite is separately opt-in).
- Explicit macOS native suite passed: write/read, endpoint isolation, delete and missing-entry failure. Windows adapter is implemented against CredWriteW/CredReadW and covered by the new Windows CI job, but has not been executed in this macOS session.
- Security integration covers ID forgery, unknown/missing credentials, cross-user tool denial, expiry, device revocation, disable/re-enable, delete/recreate, metadata-only listing, hashed storage and sanitized audit. SQLite v1 migration and process restart preserve configuration.
- Isolated Docker smoke passed including non-root execution, backup and container recreation with authenticated requests.
- Real Chromium HUB verification passed: issue/display-once/clear, credential tester, revocation returns 401, responsive layout at 390px, no JS errors. Temporary database and browser were removed.
- Local Docker migrated after snapshot `/data/backups/before-device-auth-20260917.sqlite`; prior image retained as `cria-mcp-gateway:before-device-auth-20260917`.
- Existing local user/assignment preserved. Native Keychain enrollment and actual HTTPS stdio bridge initialized and listed 3 upstream tools; ID-only request returned 401. Claude configuration contains URL/profile/public CA path only. Claude needs a complete restart to load the changed configuration.

## Operational limits
- Credentials are bearer secrets, not hardware-bound. Copied keys can be replayed until revoked/expired.
- Revocation blocks subsequent requests, not an already-authorized in-flight operation.
- TLS terminates at the private proxy; internal HTTP is loopback/container-only. Corporate hostname/certificate must be provisioned by Systems.
- Administrative access remains the existing shared admin key. SSO/MFA and enterprise audit retention are outside this feature.
- Backup restoration can resurrect earlier credentials: revoke/reissue as described in the runbook.

- IT enrollment guide added to the HUB with macOS/Windows command generation; browser validation covered both OS selections, quoted paths and HTTP rejection. Docker local updated.

- Follow-up: tester now selects users via admin-authenticated `/admin/test-user`, fixed to tools/list and recorded as an administrative diagnostic. Public `/mcp` remains credential-only. 25 automated tests passed; browser user selection and log labeling verified. Admin headers are redacted in diagnostic logs.
