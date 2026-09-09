import { getStore } from "@netlify/blobs";
import { PersistentAccessConfiguration, developmentAccessSeed } from "../../src/access/configuration.js";
import { NetlifyBlobAccessStateStorage } from "../../src/access/netlify-blob.js";
import { PersistentAuditLog } from "../../src/audit/audit.js";
import { NetlifyBlobAuditStorage } from "../../src/audit/netlify-blob.js";
import { createGateway } from "../../src/bootstrap.js";
import { isSupabaseConfigured } from "../../src/platform/supabase/client.js";

// Supabase takes over as soon as SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set (bootstrap.ts picks
// it up by default); Netlify Blobs stays as the fallback until then, so deploys never regress.
const useSupabase = isSupabaseConfigured(process.env);
const access = useSupabase ? undefined : new PersistentAccessConfiguration(new NetlifyBlobAccessStateStorage(getStore({ name: "cria-mcp-access", consistency: "strong" })), developmentAccessSeed);
const audit = useSupabase ? undefined : new PersistentAuditLog(new NetlifyBlobAuditStorage(getStore({ name: "cria-mcp-audit", consistency: "strong" })));
const app = createGateway(process.env, { access, audit });

export default async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const functionPrefix = "/.netlify/functions/mcp";
  if (url.pathname.startsWith(functionPrefix)) {
    const internalPath = url.pathname.slice(functionPrefix.length);
    url.pathname = internalPath === "/admin/config" ? internalPath : `/mcp${internalPath}`;
  }
  return app.handleRequest(new Request(url, request));
};
