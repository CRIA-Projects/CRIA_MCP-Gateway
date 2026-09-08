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
- Key data flow: admin panel -> authenticated management API -> Netlify Blobs; MCP HTTP request -> identity -> persisted MCP access policy -> scoped registry or remote router -> sanitized audit -> JSON-RPC response. `src/bootstrap.ts` composes local adapters and Netlify function composition supplies Blob adapters.

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

- Language + runtime: TypeScript 5.8+, Node.js >=22, ESM / NodeNext, strict compiler settings.
- Framework: native Fetch API application core; Node `http` local adapter; Netlify function adapters.
- Entry points: `src/platform/http/server.ts` (local server); `netlify/functions/mcp.ts`; `netlify/functions/health.ts`; composition root `src/bootstrap.ts`.
- Key services / business logic modules: `GatewayApplication` implements `initialize`, `tools/list`, and `tools/call` for a named MCP; ports are `AccessConfiguration`, `IdentityResolver`, `PolicyService`, `ToolRegistry`, `ToolRouter`, and `AuditLog`.
- Auth strategy: MVP `LocalIdentityResolver` takes `x-client-id` or `MCP_GATEWAY_TRUSTED_CLIENT_ID`; it is explicitly not public-grade authentication. `ConfiguredMcpPolicy` allows only enabled static users assigned to the requested MCP, deny-by-default.
- External APIs consumed: configured HTTPS remote MCP servers via JSON-RPC POST. The router supports static demo tools and remote forwarding; session-aware Streamable HTTP/SSE is out of scope.
- Error handling conventions: JSON-RPC failures use standard invalid/parse/method codes plus `-32003` for access denied and `-32603` for router failure; unknown HTTP paths return 404; notifications return 202 without a body.
- Logging approach: every MCP POST creates a sanitized request audit event; local development uses memory and Netlify uses a Blob ring buffer of 200 events. Local listener writes a startup line to stdout.
- Performance constraints: stateless MVP; no persistence, queues, retry policy, rate limiting, or specified latency/SLO. NEEDS CLARIFICATION before production exposure.

## [context.frontend]

- Framework + version: dependency-free static HTML/CSS/JavaScript admin panel in `public/`.
- State management: admin API key is held in session storage; current configuration is fetched after each mutation.
- Routing: `/` serves the panel; `/mcp/{mcp-id}`, `/admin/*`, and `/health` are handled by the application; `netlify.toml` redirects dynamic endpoints to functions in deployment.
- Design system / component library: not applicable.
- API communication layer: browser Fetch sends user-entered `ADMIN_API_KEY` only to `/admin/*`; the development tester uses `x-client-id` only for local policy verification.
- Styling conventions: native CSS; dark responsive layout, semantic sections, labeled form controls, and live response feedback.
- i18n / accessibility requirements: Spanish UI; native semantic HTML, labels, and `aria-live` / alert feedback.
- Build tooling: static assets need no build; TypeScript compiler builds the gateway.

## [context.data]

- Databases (type + name): none.
- ORM / query layer: none.
- Migration strategy: none.
- Key models / entities: `Principal`, `ToolDefinition`, `AuditEvent`, JSON-RPC request/response.
- Caching layer: none.
- Data validation approach: narrow runtime validation of the JSON-RPC envelope and `tools/call.params.name`; tool argument-schema validation is not implemented.
- Backup / retention policy: none; audit events exist only in memory. NEEDS CLARIFICATION for any persistent deployment.

## [context.testing]

- Unit test framework: Node built-in `node:test` with `node:assert/strict`.
- Integration test approach: requests are sent directly to `GatewayApplication`; cases cover admin authentication, live access-rule changes, audit redaction, remote forwarding, health, and endpoint compatibility.
- E2E tooling: none.
- Coverage targets: none configured. NEEDS CLARIFICATION.
- Test data strategy: deterministic in-memory adapters and the `demo.echo` registered tool.
- CI gate (pass/fail criteria): no CI configuration found; run `npm run check` and `npm test` locally.

## [context.devops]

- Cloud provider: Netlify is the MVP deployment target, using site-wide Netlify Blobs for configuration and audit persistence.
- Deployment method: `netlify.toml` builds with `npm run build`, publishes `public/`, packages `netlify/functions`, and redirects `/mcp/{id}`, `/admin/*`, and `/health`.
- CI/CD platform: NEEDS CLARIFICATION; none found in the repository.
- Environment names (dev / staging / prod): local development is documented; staging/production are NEEDS CLARIFICATION.
- Secrets management: `ADMIN_API_KEY` is required in Netlify to enable the admin; `MCP_GATEWAY_TRUSTED_CLIENT_ID` is a local default identity only. Neither is bundled into static assets.
- Monitoring / alerting: startup stdout and in-memory audit only; NEEDS CLARIFICATION.
- Rollback procedure: Netlify deployment rollback process is not documented. NEEDS CLARIFICATION.
