-- CRIA MCP Gateway persistence tables.
-- Prefixed with cria_gateway_ so they coexist safely in a Supabase project shared
-- with other apps' tables. Each table holds a single JSON blob row, mirroring the
-- Netlify Blobs adapter this replaces (AccessStateStorage / AuditStorage ports).
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Safe to re-run: every statement is idempotent.

create table if not exists public.cria_gateway_access_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cria_gateway_audit_events (
  id text primary key,
  events jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS is enabled with no policies: only requests using the service_role key
-- (server-side only, see SUPABASE_SERVICE_ROLE_KEY) can read or write these
-- rows. The anon/authenticated roles used by other projects in this Supabase
-- instance get zero access, by default, to gateway state or audit data.
alter table public.cria_gateway_access_state enable row level security;
alter table public.cria_gateway_audit_events enable row level security;
