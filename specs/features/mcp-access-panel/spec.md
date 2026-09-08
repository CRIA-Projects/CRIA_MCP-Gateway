# MCP access panel

## Summary

Provide a small web panel that makes the MVP gateway configuration understandable: registered MCP servers, enabled users, and their MCP assignments. The gateway must enforce the same configured user-to-MCP access on every MCP request.

## Actors

- Gateway administrator: inspects the hardcoded development configuration in the panel.
- Enabled development user: connects to an assigned MCP through the gateway.
- Unassigned or disabled user: is rejected by the gateway.

## User journeys

1. An administrator opens the panel and sees MCP servers, enabled users, and each user's assigned MCPs.
2. A development user selects their configured identity in the panel, selects an MCP, and can test listing its available tools.
3. The gateway receives an MCP request for a named server, resolves the caller identity, and allows it only if that user has an active assignment to that server.
4. An unassigned or disabled identity receives an access-denied JSON-RPC response and does not receive a tool list.

## Acceptance criteria

1. The root web page presents separate, accessible sections for registered MCPs, enabled users, and user-to-MCP assignments.
2. The panel obtains its displayed configuration from the gateway's read-only development configuration endpoint, so UI and enforcement cannot drift.
3. MCP requests are addressed to `/mcp/{mcp-id}`; requests to an unknown MCP return an appropriate not-found response.
4. An enabled, assigned identity can call `initialize`, `tools/list`, and an assigned tool on its MCP endpoint.
5. An enabled identity without an assignment, and a disabled identity, are denied before tools are listed or called.
6. Tool listing and routing are constrained to the selected MCP; tools from another MCP are never exposed or called through that endpoint.
7. The current local `x-client-id` mechanism is clearly identified as development-only in the panel and documentation.
8. The existing `/mcp` endpoint remains compatible for the single demo server during the MVP transition.
9. Automated tests cover allowed, unassigned, disabled, and unknown-MCP flows without a real network or database.

## Edge cases

- Missing `x-client-id` uses the configured local development identity and is subject to its access record.
- A request with a tool name that belongs to a different MCP is rejected as unknown for the selected MCP.
- A panel configuration request does not disclose secrets; MCP endpoint URLs and credentials are not modeled in this MVP.
- The panel may render no assigned MCPs for an enabled user.

## Assumptions

- This phase uses a fixed, source-controlled development configuration; it has no mutation API or persistent storage.
- One demo MCP server (`demo`) with `demo.echo` is sufficient to prove routing and authorization boundaries.
- The panel is a local/development administration aid and does not implement administrator authentication.

## Open questions

- NEEDS CLARIFICATION: Which production identity provider and user lifecycle should Supabase Auth own?
- NEEDS CLARIFICATION: Should later permissions grant whole MCP servers only, or permit per-tool overrides?

## Handoff

- Spec owner: Codex
- Plan agent: Codex
- Implementation agent: Codex
- Spec confidence: high
- Blocking questions: none
- Ready for /plan: yes
