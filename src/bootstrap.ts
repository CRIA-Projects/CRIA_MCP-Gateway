import { createDevelopmentAccessConfiguration, developmentAccessSeed, PersistentAccessConfiguration, type AccessConfiguration } from "./access/configuration.js";
import { createDevelopmentAuditLog, PersistentAuditLog, type AuditLog } from "./audit/audit.js";
import { GatewayApplication } from "./core/gateway.js";
import type { DeviceCredentials } from "./identity/credentials.js";
import { LocalIdentityResolver } from "./identity/identity.js";
import { createSupabasePersistenceAdapters } from "./platform/supabase/client.js";
import { ConfiguredMcpPolicy } from "./policy/policy.js";
import { InMemoryToolRegistry } from "./registry/registry.js";
import { DemoToolRouter } from "./router/router.js";

export interface GatewayOptions { access?: AccessConfiguration; audit?: AuditLog; credentials?: DeviceCredentials; }

export function createGateway(env: NodeJS.ProcessEnv = process.env, options: GatewayOptions = {}): GatewayApplication {
  const supabase = options.access && options.audit ? undefined : createSupabasePersistenceAdapters(env);
  const access = options.access ?? (supabase ? new PersistentAccessConfiguration(supabase.access, developmentAccessSeed) : createDevelopmentAccessConfiguration());
  const audit = options.audit ?? (supabase ? new PersistentAuditLog(supabase.audit) : createDevelopmentAuditLog());
  return new GatewayApplication({
    credentials: options.credentials,
    identity: options.credentials ?? new LocalIdentityResolver(env.MCP_GATEWAY_TRUSTED_CLIENT_ID ?? "local-development-client"),
    policy: new ConfiguredMcpPolicy(access),
    registry: new InMemoryToolRegistry([
      { name: "demo.echo", description: "Verifies an authorized gateway route.", inputSchema: { type: "object", properties: { message: { type: "string" } } }, mcpServerId: "demo", upstreamId: "demo" },
      { name: "analysis.status", description: "Returns a demo analysis status.", inputSchema: { type: "object", properties: {} }, mcpServerId: "analysis", upstreamId: "demo" }
    ]),
    router: new DemoToolRouter(),
    audit,
    access,
    adminApiKey: env.ADMIN_API_KEY ?? (env.NETLIFY ? "" : "development-admin-key"),
    mcpApiKey: env.MCP_GATEWAY_API_KEY ?? ""
  });
}
