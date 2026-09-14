import { PersistentAccessConfiguration, type PublicGatewayConfiguration } from "../access/configuration.js";
import { PersistentAuditLog } from "../audit/audit.js";
import { createGateway } from "../bootstrap.js";

const emptySeed: PublicGatewayConfiguration = { users: [], mcpServers: [], assignments: [] };

export async function createStandaloneRuntime(env: NodeJS.ProcessEnv = process.env) {
  if (env.SQLITE_PATH || env.NODE_ENV === "production") {
    if (!env.ADMIN_API_KEY || env.ADMIN_API_KEY.trim().length < 32 || env.ADMIN_API_KEY === "development-admin-key") {
      throw new Error("Set ADMIN_API_KEY to a unique secret of at least 32 characters");
    }
  }
  if (env.SQLITE_PATH) {
    // Import at the standalone edge only: Netlify never bundles node:sqlite.
    const { SqlitePersistence } = await import("./sqlite/database.js");
    const persistence = new SqlitePersistence(env.SQLITE_PATH);
    try {
      const access = new PersistentAccessConfiguration(persistence.access, emptySeed);
      await access.publicView();
      const app = createGateway({ ...env, MCP_GATEWAY_TRUSTED_CLIENT_ID: env.MCP_GATEWAY_TRUSTED_CLIENT_ID ?? "" }, {
        access, audit: new PersistentAuditLog(persistence.audit)
      });
      return { app, close: () => persistence.close() };
    } catch (error) { persistence.close(); throw error; }
  }
  if (env.NODE_ENV === "production" && !(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("Production requires SQLITE_PATH or configured Supabase persistence");
  }
  return { app: createGateway(env), close: () => {} };
}
