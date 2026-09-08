# Persistent admin and gateway logs

## Summary

Make the MCP gateway deployable as a functional Netlify MVP. An administrator must persistently manage users, MCP servers, and user-to-server assignments, while inspecting sanitized incoming gateway traffic from MCP clients such as ChatGPT.

## Acceptance criteria

1. The admin panel authenticates admin API requests with a user-supplied key; no admin secret is bundled into static assets.
2. An administrator can create, edit, enable/disable, and remove users; create, edit, and remove MCP server records; and grant or revoke a user-to-MCP assignment.
3. Gateway authorization reads the current persisted assignment on every MCP request; disabled, unassigned, and unknown users are denied.
4. MCP server records can represent the built-in demo server and HTTPS remote MCP endpoints. Requests to an authorized remote server are forwarded without exposing its configuration to unauthorized clients.
5. Every MCP POST request produces an admin-visible audit event containing timestamp, route, MCP ID, resolved user, JSON-RPC method/ID/params, safe request headers, outcome, HTTP status, and error code when present.
6. Sensitive header values and sensitive fields in request params are redacted from audit events.
7. State and audit logs persist across Netlify function invocations and deploys through Netlify Blobs; local development retains an in-memory fallback.
8. Netlify configuration routes the static admin, management API, logs API, and MCP paths correctly, and production deployment yields a live URL.

## Assumptions

- A shared `ADMIN_API_KEY` is adequate for this MVP admin boundary; production should replace it with real administrator identity/roles.
- Remote MCP forwarding supports JSON-RPC POST requests. Session-aware Streamable HTTP/SSE support remains a later extension.
- Audit logs are bounded to the most recent 200 events per deployment environment to control storage cost.

## Handoff

- Spec owner: Codex
- Plan agent: Codex
- Implementation agent: Codex
- Spec confidence: high
- Blocking questions: none
- Ready for /plan: yes
