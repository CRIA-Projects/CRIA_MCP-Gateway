# Technical plan — MCP access panel

## Architecture

Keep the core application independent of persistence and transport. Add a development configuration adapter that owns three immutable concepts: users, MCP servers, and access assignments. The registry resolves tools by MCP server ID, while policy checks an enabled principal's assignment for that ID.

The HTTP adapter extracts the MCP server ID from `/mcp/{id}` and passes it to the core. `/mcp` continues as an alias for the single `demo` server. A read-only `/admin/config` endpoint exposes a safe view model of the same configuration to a static panel. No endpoint mutates configuration in this phase.

```text
Static panel -> GET /admin/config -> development configuration
MCP client   -> /mcp/{id} -> identity -> access policy -> scoped registry -> router -> audit
```

## Data model notes

- `GatewayUser`: `id`, `name`, `enabled`.
- `McpServer`: `id`, `name`, `description`.
- `McpAccessAssignment`: `userId`, `mcpServerId`.
- `ToolDefinition` gains `mcpServerId`; its current `upstreamId` remains the router destination.
- The public configuration endpoint omits upstream URLs and any credentials.

## Phases

### Phase 1 — Backend access boundary

1. Add static development configuration and read-only interfaces.
2. Scope registry lookups and policy decisions to a requested MCP server.
3. Update core route handling for `/mcp/{id}`, `/mcp` compatibility, and `/admin/config`.
4. Preserve JSON-RPC failure behavior and audit denied calls.

Quality gate: type-check succeeds and direct gateway calls prove each authorization branch.

### Phase 2 — Static development panel

1. Add a dependency-free static HTML/CSS/JavaScript panel.
2. Load the safe configuration endpoint and render MCPs, enabled users, assignments, and a development request tester.
3. Serve static assets locally and configure Netlify static publishing without changing the function transport.

Quality gate: panel assets are reachable locally; tester uses the documented development identity header and reports API responses.

### Phase 3 — Tests and documentation

1. Extend gateway tests for allowed, unassigned, disabled, unknown-MCP, and cross-MCP tool cases.
2. Document the endpoint model, development-only identity, and Supabase replacement seam.

Quality gate: `npm run check` and `npm test` pass.

## Risks and assumptions

- `x-client-id` is spoofable and exists solely to validate the integration path; production must replace it with a verified identity adapter.
- A public, unauthenticated configuration endpoint is suitable only for a local/demo panel. It must become administrator-protected with real persistence.
- One configured server keeps `/mcp` compatibility unambiguous. If multiple defaults are introduced, remove or explicitly configure that alias.
