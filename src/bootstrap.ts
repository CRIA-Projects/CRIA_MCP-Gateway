import { createDevelopmentAccessConfiguration, type AccessConfiguration } from "./access/configuration.js";
import { createDevelopmentAuditLog, type AuditLog } from "./audit/audit.js";
import { GatewayApplication } from "./core/gateway.js";
import { LocalIdentityResolver } from "./identity/identity.js";
import { ConfiguredMcpPolicy } from "./policy/policy.js";
import { InMemoryToolRegistry } from "./registry/registry.js";
import { DemoToolRouter } from "./router/router.js";

export interface GatewayOptions { access?: AccessConfiguration; audit?: AuditLog; }

export function createGateway(env: NodeJS.ProcessEnv = process.env, options: GatewayOptions = {}): GatewayApplication {
  const access = options.access ?? createDevelopmentAccessConfiguration();
  return new GatewayApplication({
    identity: new LocalIdentityResolver(env.MCP_GATEWAY_TRUSTED_CLIENT_ID ?? "local-development-client"),
    policy: new ConfiguredMcpPolicy(access),
    registry: new InMemoryToolRegistry([
      { name: "demo.echo", description: "Verifies an authorized gateway route.", inputSchema: { type: "object", properties: { message: { type: "string" } } }, mcpServerId: "demo", upstreamId: "demo" },
      { name: "analysis.status", description: "Returns a demo analysis status.", inputSchema: { type: "object", properties: {} }, mcpServerId: "analysis", upstreamId: "demo" }
    ]),
    router: new DemoToolRouter(),
    audit: options.audit ?? createDevelopmentAuditLog(),
    access,
    adminApiKey: env.ADMIN_API_KEY ?? (env.NETLIFY ? "" : "development-admin-key")
  });
}
