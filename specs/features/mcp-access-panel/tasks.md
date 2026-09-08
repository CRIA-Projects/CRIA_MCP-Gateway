# Tasks — MCP access panel

## Backend

- [x] B1 (high, sequential): Add immutable development users, MCP servers, and assignments behind a configuration interface. Validation: public configuration contains no secret fields.
- [x] B2 (high, sequential; depends on B1): Scope policy and registry behavior to MCP server ID; support `/mcp/{id}`, default `/mcp`, and `/admin/config`. Validation: allowed, unassigned, disabled, unknown-server, and cross-server requests return the specified outcomes.

## Frontend

- [x] F1 (high, sequential; depends on B2): Create a dependency-free static panel that reads `/admin/config` and renders MCPs, enabled users, assignments, and development-only status. Validation: it degrades visibly on failed config load.
- [x] F2 (medium, sequential; depends on F1): Add a request tester using an explicitly selected development identity and MCP server. Validation: it displays JSON-RPC success and denial responses without persisting changes.

## Testing

- [x] T1 (high, sequential; depends on B2): Add deterministic direct-application tests for authorization and server-scoping behavior. Validation: `npm test` passes without network/database dependencies.

## Documentation / devops

- [x] D1 (medium, sequential; depends on B2, F2): Document endpoints and the development-only limitation; make the local server and Netlify serve the static panel. Validation: README matches the running endpoints and `npm run check` passes.
