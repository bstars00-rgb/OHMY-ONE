-- ============================================================
-- 0003 — RBAC + Scope, and the permission-engine helper functions
-- ============================================================

create table roles (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,            -- EMPLOYEE, TEAM_LEADER, HR ...
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,            -- HR_LEAVE_READ_TEAM ...
  domain      text not null,                   -- HR | FINANCE | APPROVAL | ADMIN
  description text not null,
  created_at  timestamptz not null default now()
);

create table role_permissions (
  role_id       uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- A user may hold a role with a scope + optional scope anchor (team/dept/org).
create table user_roles (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  role_id         uuid not null references roles(id),
  scope           scope_level not null default 'SELF',
  scope_ref       uuid,                        -- team_id / department_id / org_id per scope
  organization_id uuid references organizations(id),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  deleted_at      timestamptz,
  unique (employee_id, role_id, scope, scope_ref)
);

create index idx_user_roles_emp on user_roles(employee_id) where deleted_at is null;

-- ============================================================
-- Permission engine — all SECURITY DEFINER, search_path pinned.
-- These are the ONLY sanctioned way to answer "who am I / what may I do".
-- ============================================================

-- Who is the acting employee?
-- Priority: explicit GUC override (tests / service context) -> Supabase auth.uid().
create or replace function app.current_employee_id()
returns uuid
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_emp uuid;
  v_uid uuid;
begin
  begin
    v_emp := nullif(current_setting('app.current_employee_id', true), '')::uuid;
  exception when others then v_emp := null; end;
  if v_emp is not null then
    return v_emp;
  end if;

  begin
    v_uid := auth.uid();
  exception when others then v_uid := null; end;

  if v_uid is not null then
    select id into v_emp from public.employees
      where user_id = v_uid and deleted_at is null;
  end if;

  return v_emp;
end;
$$;

-- Does the acting employee hold a permission code (via any of their roles)?
create or replace function app.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p       on p.id = rp.permission_id
    where ur.employee_id = app.current_employee_id()
      and ur.deleted_at is null
      and p.code = p_code
  );
$$;

-- Relationship of the acting viewer to a target employee, most-privileged first.
-- Returns one of: SELF, TEAM (viewer leads target's team),
-- DEPARTMENT (viewer manages target's dept), ORG (same org), NONE.
create or replace function app.employee_relation(p_target uuid)
returns text
language plpgsql
stable
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_viewer uuid := app.current_employee_id();
  v_t      public.employees%rowtype;
  v_v      public.employees%rowtype;
begin
  if v_viewer is null or p_target is null then return 'NONE'; end if;
  if v_viewer = p_target then return 'SELF'; end if;

  select * into v_t from public.employees where id = p_target and deleted_at is null;
  select * into v_v from public.employees where id = v_viewer and deleted_at is null;
  if v_t.id is null or v_v.id is null then return 'NONE'; end if;

  -- viewer is the leader of target's team
  if v_t.team_id is not null and exists (
       select 1 from public.teams t
       where t.id = v_t.team_id and t.leader_id = v_viewer and t.deleted_at is null
     ) then
    return 'TEAM';
  end if;

  -- viewer manages target's department
  if v_t.department_id is not null and exists (
       select 1 from public.departments d
       where d.id = v_t.department_id and d.manager_id = v_viewer and d.deleted_at is null
     ) then
    return 'DEPARTMENT';
  end if;

  if v_t.organization_id = v_v.organization_id then
    return 'ORG';
  end if;

  return 'NONE';
end;
$$;

-- Convenience: may the acting user read this employee's HR/leave data?
-- SELF always; TEAM if TEAM perm + leads team; ALL if org-wide perm.
create or replace function app.can_read_employee_hr(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select case app.employee_relation(p_target)
    when 'SELF' then true
    when 'TEAM' then app.has_permission('HR_LEAVE_READ_TEAM')
    when 'DEPARTMENT' then app.has_permission('HR_LEAVE_READ_TEAM')
                          or app.has_permission('HR_LEAVE_READ_ALL')
    else app.has_permission('HR_LEAVE_READ_ALL')
  end;
$$;

-- Test/utility hook: bind the acting employee for the current session.
create or replace function app.set_current_employee(p_employee uuid)
returns void
language sql
volatile
as $$
  select set_config('app.current_employee_id', coalesce(p_employee::text, ''), false);
$$;

comment on function app.current_employee_id is 'Authoritative acting-employee id. Never trust an id supplied by the client/LLM for authority (ADR-003).';
