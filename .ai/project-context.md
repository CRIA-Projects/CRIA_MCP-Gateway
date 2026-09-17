# Project Context

## Metadata

- Project: CRIA MCP Gateway
- Version: 0.1.0
- Last updated: 2026-09-08
- Owner: NEEDS CLARIFICATION

## Stack

- Languages: TypeScript (strict), JavaScript output.
- Frameworks: Native Fetch `Request`/`Response`; Node `http`; Netlify Functions and Netlify Blobs adapters.
- Runtime: Node.js >=22, ESM (`NodeNext`).
- Package managers: npm (`package-lock.json`).

## Architecture

- System type: modular monolith, deployable locally or as Netlify serverless functions.
- Main modules: `core` (JSON-RPC/MCP flow), mutable `access`, `identity`, `policy`, `registry`, `router`, request `audit`, an authenticated static admin panel, and transport adapters under `platform` / `netlify`.
- Key data flow: admin panel -> authenticated management API -> Netlify Blobs; MCP HTTP request to the single public `/mcp` endpoint -> identity -> persisted MCP access policy -> federated tool registry / remote router -> sanitized audit -> JSON-RPC response. Internal MCP IDs are never part of the public route.

## Engineering Standards

- Code style: TypeScript strict mode; ESM imports use `.js` suffixes; small, interface-led modules.
- Naming conventions: PascalCase classes/interfaces; camelCase functions/properties; file names by module responsibility.
- Branch/commit conventions: NEEDS CLARIFICATION (the workspace has no Git metadata).
- PR and review rules: preserve core's dependency on ports only; validate with `npm run check` and `npm test` for code changes.

## Agent Instructions

- Do: deny MCP access by default; keep persistence behind `AccessConfiguration`/`AuditStorage`; redact secrets before audit persistence; require `ADMIN_API_KEY` on every `/admin/*` request.
- Avoid: coupling `core` to Netlify Blobs or a specific identity provider; exposing a production admin when `ADMIN_API_KEY` is missing; forwarding caller authorization headers to an upstream MCP.
- Definition of done: behavior has a focused test; `npm run check` and `npm test` pass; README/architecture are updated if an external contract or module boundary changes.

---

<!-- DOMAIN CONTEXTS
     Each section below is loaded independently by its matching domain skill.
     Skills read only their own [context.<domain>] block — not the full file.
-->

## [context.backend]

- Self-hosted branch: `src/platform/standalone.ts` wires SQLite only when `SQLITE_PATH` is set. New SQLite instances use empty seed and no fallback user; require admin keys >=32 characters. Production standalone refuses memory-only persistence. HTTP edge catches request failures and drains on SIGTERM/SIGINT. Netlify composition remains separate.

- Language + runtime: TypeScript 5.8+, Node.js >=22, ESM / NodeNext, strict compiler settings.
- Framework: native Fetch API application core; Node `http` local adapter; Netlify function adapters.
- Entry points: `src/platform/http/server.ts` (local server); `netlify/functions/mcp.ts`; `netlify/functions/health.ts`; composition root `src/bootstrap.ts`.
- Key services / business logic modules: `GatewayApplication` implements `server/discover`, legacy `initialize`, `tools/list`, and `tools/call` as one virtual MCP server. It federates only the assigned upstream MCPs and namespaces listed tools as `<internal-mcp-id>__<tool-name>`; ports are `AccessConfiguration`, `IdentityResolver`, `PolicyService`, `ToolRegistry`, `ToolRouter`, and `AuditLog`. `GET /admin/analytics` derives per-user/per-MCP activity (`src/audit/analytics.ts::computeAnalytics`) from the audit buffer, not a separate store.
- Auth strategy: MVP `LocalIdentityResolver` takes `x-client-id` or `MCP_GATEWAY_TRUSTED_CLIENT_ID`; it is explicitly not public-grade authentication. `ConfiguredMcpPolicy` allows only enabled static users assigned to the requested MCP, deny-by-default.
- Upstream protocol isolation: the legacy router opens `initialize` with `2025-03-26`, reuses the session ID and sends `notifications/initialized`. It does not copy the downstream `MCP-Protocol-Version` header; upstream uses its session version or legacy default. Confirmed on 2026-09-14: forwarding `2026-07-28` makes A30 disappear for the same assigned client ID, while 2025 versions return its tools. No client catalog push is implemented; each new `tools/list` rereads assignments. The actual Claude refresh headers remain NEEDS CLARIFICATION until its audit event is available.
- External APIs consumed: configured HTTPS remote MCP servers via JSON-RPC POST. `DemoToolRouter.forward()` opens a fresh session per call (`initialize` → reuse `Mcp-Session-Id` if returned) since some upstreams (e.g. n8n-hosted MCPs on the official SDK's Streamable HTTP transport) reject bare requests with `400 Server not initialized`; it always sends `Accept: application/json, text/event-stream` to the upstream regardless of the original caller's Accept header (some upstreams 406 otherwise), and `parseRpcBody` in `gateway.ts` handles both plain-JSON and `text/event-stream` upstream responses. No session caching across calls and no long-lived SSE push — out of scope. A remote `McpServer` may set an optional `authorizationHeader` (the credential value) plus `authHeaderName` (defaults to `Authorization`, e.g. for a custom `X-API-Key`), forwarded as-is on every upstream call — never derived from the calling MCP client's own headers. `tools/list` and `server/discover` advertise `ttlMs: 0` (no client-side caching) so admin changes are visible on the next refresh, and `capabilities.tools.listChanged` is `false` since no subscription mechanism is implemented — advertising `true` there previously caused clients to retry `subscriptions/listen` forever.
- Error handling conventions: JSON-RPC failures use standard invalid/parse/method codes plus `-32003` for access denied and `-32603` for router failure; unknown HTTP paths return 404; notifications return 202 without a body.
- Logging approach: every MCP POST creates a sanitized request audit event; local development uses memory and Netlify uses a Blob ring buffer of 200 events. Local listener writes a startup line to stdout.
- Performance constraints: stateless MVP; no persistence, queues, retry policy, rate limiting, or specified latency/SLO. NEEDS CLARIFICATION before production exposure.

## [context.frontend]

- Framework + version: dependency-free static HTML/CSS/JavaScript admin panel in `public/`.
- State management: admin API key is held in session storage; current configuration is fetched after each mutation.
- Routing: `/` serves the panel; `/mcp`, `/admin/*`, and `/health` are handled by the application; `netlify.toml` redirects dynamic endpoints to functions in deployment. MCP IDs are administrative/internal only. The dashboard is split into three client-side tabs (Usuarios / MCPs / Logs, toggled via `[hidden]` on `[data-tab-panel]`, no router) instead of one long scrolling page.
- MCP creation form (`#server-form`) is intentionally minimal: Nombre, URL, and an `authType` select (Ninguna / Bearer / Header personalizado); `kind` and `id` are hidden inputs (`id` auto-slugified from Nombre, never user-edited) rather than visible fields, so any auth-shaped remote MCP can be added without exposing internal concepts.
- Design system / component library: CRIA dark B2B visual system implemented in native CSS: Montserrat for UI, DM Serif Display for the hero, near-black layered surfaces, blue information accents, and magenta primary CTAs.
- API communication layer: browser Fetch sends user-entered `ADMIN_API_KEY` only to `/admin/*`; the development tester uses `x-client-id` only for local policy verification.
- Styling conventions: native responsive CSS with CRIA design tokens; semantic sections, labeled form controls, visible focus states, reduced-motion handling, and live response feedback.
- i18n / accessibility requirements: Spanish UI; native semantic HTML, labels, and `aria-live` / alert feedback.
- Build tooling: static assets need no build; TypeScript compiler builds the gateway.

## [context.data]

- Self-hosted SQLite: Node 24 `node:sqlite`, schema v1 managed transactionally in `src/platform/sqlite/database.ts`, local disk + WAL + FULL sync + 5s busy timeout. One JSON access row, individual audit event rows (latest 200). Optional atomic storage operations prevent read-modify-write losses in SQLite without changing existing Supabase/Blob adapters. Backup via SQLite backup API; rollback uses a restored snapshot and previous image. Single instance, no shared network filesystem.

- Databases (type + name): optional Supabase Postgres (`cria_gateway_access_state`, `cria_gateway_audit_events`, prefixed to coexist with other projects' tables in the same instance), used when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are set; otherwise falls back to Netlify Blobs (`cria-mcp-access`, `cria-mcp-audit`) in deployment or in-memory adapters locally. Selection happens in `src/bootstrap.ts`.
- ORM / query layer: none; `@supabase/supabase-js` client used directly with the `service_role` key server-side only.
- Migration strategy: hand-written idempotent SQL under `supabase/migrations/`, applied manually via the Supabase SQL Editor (no CLI/automation yet).
- Key models / entities: `Principal`, `ToolDefinition`, `AuditEvent`, JSON-RPC request/response. Supabase/Blob adapters both store the same `PublicGatewayConfiguration` / `AuditEvent[]` JSON shape as a single row (`AccessStateStorage`/`AuditStorage` ports), not normalized tables.
- Caching layer: none.
- Data validation approach: narrow runtime validation of the JSON-RPC envelope and `tools/call.params.name`; tool argument-schema validation is not implemented.
- Backup / retention policy: audit is a ring buffer of the latest 200 events (Netlify Blob or Supabase row); external backup/retention remains NEEDS CLARIFICATION. Supabase tables have RLS enabled with no policies, so only `service_role` can read/write.

## [context.testing]

- Self-hosted integration tests use disposable SQLite files, concurrent storage connections, backup/reopen and real loopback HTTP subprocesses with the stdio VPN bridge. `npm run test:docker` validates container recreation on an isolated Compose project and cleans only its own volume.

- Unit test framework: Node built-in `node:test` with `node:assert/strict`.
- Integration test approach: requests are sent directly to `GatewayApplication`; cases cover admin authentication, live access-rule changes, `server/discover`, federated namespaced tools, audit redaction, remote forwarding, health, and the single public endpoint contract.
- E2E tooling: none.
- Coverage targets: none configured. NEEDS CLARIFICATION.
- Test data strategy: deterministic in-memory adapters and the `demo.echo` registered tool.
- CI gate (pass/fail criteria): no CI configuration found; run `npm run check` and `npm test` locally.

## [context.devops]

- Local TLS: optional Compose `https` profile runs Caddy at `localhost:8443`; Node bridges trust its public root through `NODE_EXTRA_CA_CERTS`. Optional `MCP_GATEWAY_API_KEY` gates `/mcp` with `x-api-key`, but is not individual authentication and is unsupported by the current local bridge.

- Customer onboarding and credential placement: `docs/conectar-mcps-y-claude.md` covers HUB setup, assignments, local Claude Desktop configuration on macOS/Windows, VPN troubleshooting and unverified client-ID limits. Installation/backup remain in `docs/self-hosted.md`.

- Permanent edition branches: `main` for Netlify; `docker` for self-hosted Docker/SQLite. Docker PRs target `docker`, never a full-edition merge into `main`. Shared fixes are ported selectively. Repository default remains `main`.

- Self-hosted distribution: multi-stage Node 24 Dockerfile, non-root runtime, `.dockerignore` allowlist, Compose read-only rootfs + `/data` volume. Published port defaults to loopback; `CRIA_BIND_ADDRESS` can target VPN IP. CI workflow `self-hosted.yml` runs tests + Docker smoke, with no deploy/publish. Backup/restore and local Claude Desktop bridge documented in `docs/self-hosted.md`; remote Claude web connectors cannot enter a private VPN. Customer VPN routing/DNS/CA remains environment-specific.

- Cloud provider: Netlify is the MVP deployment target, using site-wide Netlify Blobs for configuration and audit persistence.
- Deployment method: `netlify.toml` builds with `npm run build`, publishes `public/`, packages `netlify/functions`, and redirects `/mcp`, `/admin/*`, and `/health`.
- CI/CD platform: GitHub Actions `self-hosted.yml` validates pushes and PRs targeting `docker`; checks, tests and Docker smoke only, no deployment.
- Environment names (dev / staging / prod): local development is documented; staging/production are NEEDS CLARIFICATION.
- Secrets management: `ADMIN_API_KEY` is required in Netlify to enable the admin; `MCP_GATEWAY_TRUSTED_CLIENT_ID` is a local default identity only. `SUPABASE_SERVICE_ROLE_KEY` (optional, enables Supabase persistence) is a server-only secret. None of these are bundled into static assets.
- Monitoring / alerting: startup stdout and in-memory audit only; NEEDS CLARIFICATION.
- Rollback procedure: Netlify deployment rollback process is not documented. NEEDS CLARIFICATION.
