# Project Context

## Metadata

- Project: CRIA MCP Gateway
- Version: 0.1.0
- Last updated: 2026-09-08
- Owner: NEEDS CLARIFICATION

## Stack

- Languages: TypeScript (strict), JavaScript output.
- Frameworks: Native Fetch `Request`/`Response`; Node `http`; Netlify Functions adapter.
- Runtime: Node.js >=22, ESM (`NodeNext`).
- Package managers: npm (`package-lock.json`).

## Architecture

- System type: modular monolith, deployable locally or as Netlify serverless functions.
- Main modules: `core` (JSON-RPC/MCP flow), `access`, `identity`, `policy`, `registry`, `router`, `audit`, a static panel, and transport adapters under `platform` / `netlify`.
- Key data flow: static panel -> safe configuration endpoint; MCP HTTP request -> `GatewayApplication` -> identity -> MCP access policy -> scoped registry -> router -> audit -> JSON-RPC response. `src/bootstrap.ts` composes concrete adapters.

## Engineering Standards

- Code style: TypeScript strict mode; ESM imports use `.js` suffixes; small, interface-led modules.
- Naming conventions: PascalCase classes/interfaces; camelCase functions/properties; file names by module responsibility.
- Branch/commit conventions: NEEDS CLARIFICATION (the workspace has no Git metadata).
- PR and review rules: preserve core's dependency on ports only; validate with `npm run check` and `npm test` for code changes.

## Agent Instructions

- Do: keep the gateway stateless and deny MCP access by default; add infrastructure integrations as replaceable adapters composed in `src/bootstrap.ts`; audit allowed, denied, and failed tool calls.
- Avoid: coupling `core` to HTTP, Netlify, in-memory storage, or a specific identity provider; exposing the local `x-client-id` identity or `/admin/config` publicly; adding OAuth, persistence, dashboards, or microservices to the MVP without a spec.
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
- External APIs consumed: none. The only router is `DemoToolRouter`; real upstream MCP Streamable HTTP routing is out of scope.
- Error handling conventions: JSON-RPC failures use standard invalid/parse/method codes plus `-32003` for access denied and `-32603` for router failure; unknown HTTP paths return 404; notifications return 202 without a body.
- Logging approach: `InMemoryAuditLog` records events only for the application lifetime. Local listener writes a startup line to stdout. Persistent logs/observability are NEEDS CLARIFICATION.
- Performance constraints: stateless MVP; no persistence, queues, retry policy, rate limiting, or specified latency/SLO. NEEDS CLARIFICATION before production exposure.

## [context.frontend]

- Framework + version: dependency-free static HTML/CSS/JavaScript panel in `public/`.
- State management: fetched read-only development configuration held in module scope.
- Routing: `/` serves the panel; `/mcp/{mcp-id}`, `/admin/config`, and `/health` are handled by the application; `netlify.toml` redirects dynamic endpoints to functions in deployment.
- Design system / component library: not applicable.
- API communication layer: browser Fetch calls the safe `/admin/config` view and uses a development-only `x-client-id` header in the access tester.
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
- Integration test approach: requests are sent directly to `GatewayApplication`; cases cover health, safe config, allowed access, unassigned/disabled denial, unknown MCPs, endpoint compatibility, and cross-MCP isolation.
- E2E tooling: none.
- Coverage targets: none configured. NEEDS CLARIFICATION.
- Test data strategy: deterministic in-memory adapters and the `demo.echo` registered tool.
- CI gate (pass/fail criteria): no CI configuration found; run `npm run check` and `npm test` locally.

## [context.devops]

- Cloud provider: Netlify is configured as an optional deployment target.
- Deployment method: `netlify.toml` builds with `npm run build`, publishes `public/`, packages `netlify/functions`, and redirects `/mcp/{id}`, `/admin/config`, and `/health`.
- CI/CD platform: NEEDS CLARIFICATION; none found in the repository.
- Environment names (dev / staging / prod): local development is documented; staging/production are NEEDS CLARIFICATION.
- Secrets management: `MCP_GATEWAY_TRUSTED_CLIENT_ID` is an environment variable for local default identity only; production secret/authentication design is out of MVP scope.
- Monitoring / alerting: startup stdout and in-memory audit only; NEEDS CLARIFICATION.
- Rollback procedure: Netlify deployment rollback process is not documented. NEEDS CLARIFICATION.
