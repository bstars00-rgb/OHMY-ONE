-- ============================================================
-- 0012 — Session context + permissioned compensation access
-- ============================================================

-- Identity + effective permissions for the acting user. The MCP server calls
-- this once per conversation to know who it is serving and what it may offer.
create or replace function get_my_context()
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_me uuid := app.current_employee_id();
begin
  if v_me is null then return jsonb_build_object('authenticated', false); end if;
  return jsonb_build_object(
    'authenticated', true,
    'employee', (select jsonb_build_object('id',e.id,'name',e.full_name,'employee_no',e.employee_no,
        'title',e.title,'team',t.name,'department',d.name,'organization',o.name)
      from public.employees e
      left join public.teams t on t.id=e.team_id
      left join public.departments d on d.id=e.department_id
      left join public.organizations o on o.id=e.organization_id
      where e.id=v_me),
    'roles', (select coalesce(jsonb_agg(distinct r.code),'[]'::jsonb)
      from public.user_roles ur join public.roles r on r.id=ur.role_id
      where ur.employee_id=v_me and ur.deleted_at is null),
    'permissions', (select coalesce(jsonb_agg(distinct p.code),'[]'::jsonb)
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id=ur.role_id
      join public.permissions p on p.id=rp.permission_id
      where ur.employee_id=v_me and ur.deleted_at is null)
  );
end; $$;

-- Compensation is the most sensitive field. Reachable ONLY here, ONLY with the
-- HR org-wide people permission. Every access (allowed or denied) is audited.
-- This is the deterministic backstop for Scenario 10 (employee asks CEO salary).
create or replace function get_employee_compensation(p_employee uuid)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_row jsonb;
begin
  if not app.has_permission('HR_EMPLOYEE_READ_ALL') then
    perform app.write_audit('PERMISSION_DENIED', false,'get_employee_compensation',
      'employees', p_employee::text, null, null, null, null, 'compensation read denied');
    raise exception 'Not authorized to read compensation' using errcode='42501';
  end if;
  select jsonb_build_object('employee_id',e.id,'name',e.full_name,
    'base_salary',e.base_salary,'currency',o.currency)
    into v_row
  from public.employees e join public.organizations o on o.id=e.organization_id
  where e.id = p_employee and e.deleted_at is null;
  perform app.write_audit('COMPENSATION_VIEWED', true,'get_employee_compensation','employees',p_employee::text);
  return coalesce(v_row, jsonb_build_object('error','not_found'));
end; $$;

-- Resolve an employee id from a human name/number for LLM convenience. This is a
-- LOOKUP only — it returns candidates the caller may already read per RLS; it
-- never confers authority (ADR-003). Ambiguous names return multiple candidates.
create or replace function find_employee(p_query text)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_me_org uuid;
begin
  select organization_id into v_me_org from public.employees where id = app.current_employee_id();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id',e.id,'name',e.full_name,'employee_no',e.employee_no,
      'title',e.title,'team',t.name))
    from public.employees e left join public.teams t on t.id=e.team_id
    where e.organization_id = v_me_org and e.deleted_at is null
      and (e.full_name ilike '%'||p_query||'%' or e.employee_no ilike '%'||p_query||'%')
    limit 10
  ), '[]'::jsonb);
end; $$;

grant execute on all functions in schema public to authenticated, service_role;
