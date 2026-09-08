# Technical plan — persistent admin and logs

1. Replace fixed access config with a mutable repository contract and implementations for memory and Netlify Blobs. Preserve a demo server as seed data.
2. Add authenticated management endpoints and a request-audit port. Refactor the gateway to emit one sanitized event for each MCP request.
3. Add remote JSON-RPC POST forwarding behind the existing router boundary.
4. Replace the read-only panel with management forms and a log viewer.
5. Add tests for mutation, authorization refresh, audit redaction, remote forwarding, and admin denial.
6. Configure Netlify functions/dependencies, create/link/deploy the production site, and verify the public URL.
