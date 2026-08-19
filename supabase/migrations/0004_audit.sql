-- ============================================================
-- 0004 — Audit, notifications, attachments
-- ============================================================
-- audit_logs is append-only. No UPDATE/DELETE policy is ever granted; a BEFORE
-- trigger hard-blocks mutation so records are immutable even for the table owner
-- in normal DML paths.

create table audit_logs (
  id             bigint generated always as identity primary key,
  request_id     uuid,                         -- correlates to MCP request_id
  employee_id    uuid,                          -- acting employee (may be null if unauthenticated)
  action         text not null,                 -- LEAVE_REQUEST_CREATED, PERMISSION_DENIED ...
  tool_name      text,                          -- MCP tool that triggered it
  entity_type    text,
  entity_id      text,
  old_value      jsonb,
  new_value      jsonb,
  session_ref    text,                          -- ip / session hash — never raw PII
  success        boolean not null default true,
  failure_reason text,
  created_at     timestamptz not null default now()
);

create index idx_audit_employee on audit_logs(employee_id);
create index idx_audit_action    on audit_logs(action);
create index idx_audit_created   on audit_logs(created_at);
create index idx_audit_request   on audit_logs(request_id);

-- Immutability guard.
create or replace function app.block_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger trg_audit_no_update before update on audit_logs
  for each row execute function app.block_audit_mutation();
create trigger trg_audit_no_delete before delete on audit_logs
  for each row execute function app.block_audit_mutation();

-- Canonical audit writer. SECURITY DEFINER so any authorized RPC can log,
-- but callers cannot forge the acting employee — it is resolved here.
create or replace function app.write_audit(
  p_action         text,
  p_success        boolean default true,
  p_tool_name      text default null,
  p_entity_type    text default null,
  p_entity_id      text default null,
  p_old            jsonb default null,
  p_new            jsonb default null,
  p_request_id     uuid default null,
  p_session_ref    text default null,
  p_failure_reason text default null
) returns bigint
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare v_id bigint;
begin
  insert into public.audit_logs(
    request_id, employee_id, action, tool_name, entity_type, entity_id,
    old_value, new_value, session_ref, success, failure_reason)
  values (
    p_request_id, app.current_employee_id(), p_action, p_tool_name,
    p_entity_type, p_entity_id, p_old, p_new, p_session_ref, p_success, p_failure_reason)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- notifications ----------
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text,
  entity_type  text,
  entity_id    text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index idx_notifications_emp on notifications(employee_id) where read_at is null;

-- ---------- attachments ----------
create table attachments (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entity_type   text not null,
  entity_id     uuid not null,
  storage_path  text not null,
  filename      text not null,
  content_type  text,
  size_bytes    bigint,
  uploaded_by   uuid references employees(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_attachments_entity on attachments(entity_type, entity_id);
