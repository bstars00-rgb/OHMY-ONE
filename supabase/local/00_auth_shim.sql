-- ============================================================
-- Local / plain-PostgreSQL compatibility shim.
-- Supabase provides the `auth` schema, `auth.uid()`, and the `anon` /
-- `authenticated` / `service_role` roles out of the box. On a plain Postgres
-- instance, run THIS FILE FIRST (before the migrations) to create equivalents.
-- Do NOT run this against a real Supabase project — it already has them.
-- ============================================================

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
-- allow the bootstrap superuser to SET ROLE to these (needed by tests)
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;

-- Mirrors Supabase's auth.uid(): the authenticated subject from the request JWT.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
