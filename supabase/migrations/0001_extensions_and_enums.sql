-- ============================================================
-- 0001 — Extensions, schemas, enums
-- ============================================================
-- The `app` schema holds the permission engine + business-logic helpers.
-- Nothing in `app` is directly reachable by clients; it is called by
-- SECURITY DEFINER functions and RLS policies only.

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";         -- case-insensitive emails

create schema if not exists app;

-- ---------- Enums ----------

-- Generic lifecycle status used by many business records.
do $$ begin
  create type record_status as enum ('DRAFT','ACTIVE','INACTIVE','ARCHIVED');
exception when duplicate_object then null; end $$;

-- Authorization scope granularity (matches PRODUCT spec Phase 3).
do $$ begin
  create type scope_level as enum
    ('SELF','TEAM','DEPARTMENT','ENTITY','REGION','COMPANY','GLOBAL');
exception when duplicate_object then null; end $$;

-- Workflow / approval state, shared by leave requests and generic approvals.
do $$ begin
  create type approval_status as enum ('PENDING','APPROVED','REJECTED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_action_type as enum ('APPROVE','REJECT','CANCEL','DELEGATE','COMMENT');
exception when duplicate_object then null; end $$;

-- Finance document states.
do $$ begin
  create type journal_status as enum ('DRAFT','POSTED','VOID');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('DRAFT','ISSUED','PARTIAL','PAID','VOID','OVERDUE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_type as enum ('ASSET','LIABILITY','EQUITY','REVENUE','COGS','EXPENSE','OTHER_INCOME','OTHER_EXPENSE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_direction as enum ('INBOUND','OUTBOUND');
exception when duplicate_object then null; end $$;

comment on schema app is 'Permission engine and business-logic helpers. Not client-reachable; invoked by SECURITY DEFINER functions and RLS policies.';
