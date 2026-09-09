import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AccessStateStorage } from "../../access/configuration.js";
import { SupabaseAccessStateStorage } from "../../access/supabase.js";
import type { AuditStorage } from "../../audit/audit.js";
import { SupabaseAuditStorage } from "../../audit/supabase.js";

export function isSupabaseConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseClient(env: NodeJS.ProcessEnv): SupabaseClient {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to create a Supabase adapter");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export interface SupabasePersistenceAdapters { access: AccessStateStorage; audit: AuditStorage; }

export function createSupabasePersistenceAdapters(env: NodeJS.ProcessEnv): SupabasePersistenceAdapters | undefined {
  if (!isSupabaseConfigured(env)) return undefined;
  const client = createSupabaseClient(env);
  return { access: new SupabaseAccessStateStorage(client), audit: new SupabaseAuditStorage(client) };
}
