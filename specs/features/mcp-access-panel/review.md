# Review — MCP access panel

## Acceptance criteria

| # | Status | Evidence |
| --- | --- | --- |
| 1 | ⚠️ | `public/index.html` contains distinct semantic sections for MCPs, users and assignments; the static UI has no automated browser test. |
| 2 | ⚠️ | `public/app.js` fetches `/admin/config`; `StaticAccessConfiguration` is also the policy source. The endpoint shape is covered by `gateway.test.ts`; browser rendering is not automated. |
| 3 | ✅ | `GatewayApplication` accepts `/mcp/{id}` and returns HTTP 404 for unknown IDs; covered by the unknown-MCP test. |
| 4 | ✅ | `initialize`, `tools/list`, and `tools/call` pass for `ana` on `demo`; covered by the allowed-access test. |
| 5 | ✅ | `ana` is rejected from `analysis` and disabled `invitado` is rejected from `demo`; covered by the denial test. |
| 6 | ✅ | `ToolRegistry` scopes list/find by `mcpServerId`; a cross-server call returns `-32602`, covered by test. |
| 7 | ⚠️ | Panel notice and README explicitly mark `x-client-id` and `/admin/config` development-only; no documentation/UI assertion test exists. |
| 8 | ✅ | `/mcp` maps to `demo`; covered by the legacy-endpoint test. |
| 9 | ✅ | Seven Node tests run without a database or network, including all requested authorization branches. |

## Quality gates

- `npm run check`: passed.
- `npm test`: passed, 7/7 tests.
- Local smoke test: the root panel assets and `/admin/config` responded; an unassigned identity received `MCP access denied` from `/mcp/analysis`.
- Netlify route reconstruction is covered by a direct function-adapter test.

## Verdict

Accepted for the hardcoded development MVP. The three amber items are presentation/documentation assertions only; the authorization boundary itself is implemented and tested. Before public exposure, replace the local identity and unauthenticated configuration endpoint with authenticated Supabase-backed adapters.
