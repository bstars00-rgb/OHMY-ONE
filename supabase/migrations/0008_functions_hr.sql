-- ============================================================
-- 0008 — HR business logic (deterministic RPCs)
-- ============================================================
-- Every value returned here is computed in SQL. Claude interprets; it never
-- calculates. All functions raise a typed error on authorization failure AND
-- write a PERMISSION_DENIED audit row before raising.

-- Working days between two dates inclusive, excluding Sat/Sun.
-- (Public-holiday calendar is a Phase-2 item — see QA_REPORT limitations.)
create or replace function app.count_working_days(p_start date, p_end date)
returns numeric language sql immutable as $$
  select count(*)::numeric
  from generate_series(p_start, p_end, interval '1 day') d
  where extract(isodow from d) < 6;   -- 1..5 = Mon..Fri
$$;

-- Resolve the approver for a flow step relative to the requester.
create or replace function app.resolve_step_approver(p_requester uuid, p_rule text, p_role text)
returns uuid
language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_emp public.employees%rowtype; v_appr uuid;
begin
  select * into v_emp from public.employees where id = p_requester;
  if p_rule = 'TEAM_LEADER' then
    select t.leader_id into v_appr from public.teams t where t.id = v_emp.team_id;
    -- A team leader cannot approve their own request: escalate to dept manager.
    if v_appr is null or v_appr = p_requester then
      select d.manager_id into v_appr from public.departments d where d.id = v_emp.department_id;
    end if;
  elsif p_rule = 'DEPT_MANAGER' then
    select d.manager_id into v_appr from public.departments d where d.id = v_emp.department_id;
  elsif p_rule = 'ROLE' then
    select ur.employee_id into v_appr
      from public.user_roles ur join public.roles r on r.id = ur.role_id
      where r.code = p_role and ur.organization_id = v_emp.organization_id
        and ur.deleted_at is null and ur.employee_id <> p_requester
      limit 1;
  end if;
  return v_appr;
end;
$$;

-- ---------- get_employee_profile ----------
create or replace function get_employee_profile(p_employee uuid default null)
returns jsonb
language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_target uuid := coalesce(p_employee, app.current_employee_id()); v_row jsonb;
begin
  if v_target is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if v_target <> app.current_employee_id() and not app.can_read_employee_hr(v_target) then
    perform app.write_audit('PERMISSION_DENIED', false, 'get_employee_profile',
      'employees', v_target::text, null, null, null, null, 'not authorized to read profile');
    raise exception 'Not authorized to read this profile' using errcode = '42501';
  end if;
  select to_jsonb(x) into v_row from (
    select e.id, e.employee_no, e.full_name, e.email, e.title,
           d.name as department, t.name as team, o.name as organization,
           e.hire_date, e.status
    from public.employees e
    left join public.departments d on d.id = e.department_id
    left join public.teams t on t.id = e.team_id
    left join public.organizations o on o.id = e.organization_id
    where e.id = v_target and e.deleted_at is null
  ) x;
  return coalesce(v_row, jsonb_build_object('error','not_found'));
end;
$$;

-- ---------- get_leave_balance ----------
create or replace function get_leave_balance(p_employee uuid default null, p_year int default null)
returns jsonb
language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare
  v_target uuid := coalesce(p_employee, app.current_employee_id());
  v_year int := coalesce(p_year, extract(year from current_date)::int);
  v_result jsonb;
begin
  if v_target is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if v_target <> app.current_employee_id() and not app.can_read_employee_hr(v_target) then
    perform app.write_audit('PERMISSION_DENIED', false, 'get_leave_balance',
      'leave_balances', v_target::text, null, null, null, null, 'not authorized');
    raise exception 'Not authorized to read this leave balance' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'employee_id', v_target,
    'year', v_year,
    'balances', coalesce(jsonb_agg(jsonb_build_object(
        'leave_type', lt.code,
        'leave_type_name', lt.name,
        'entitled_days', b.entitled_days,
        'carried_days', b.carried_days,
        'used_days', b.used_days,
        'pending_days', b.pending_days,
        'remaining_days', app.leave_remaining(b)
      ) order by lt.code), '[]'::jsonb)
  ) into v_result
  from public.leave_balances b
  join public.leave_types lt on lt.id = b.leave_type_id
  where b.employee_id = v_target and b.year = v_year;

  perform app.write_audit('LEAVE_BALANCE_VIEWED', true, 'get_leave_balance',
    'leave_balances', v_target::text);
  return v_result;
end;
$$;

-- ---------- create_leave_request (transactional, idempotent) ----------
create or replace function create_leave_request(
  p_leave_type_code text,
  p_start_date date,
  p_end_date date,
  p_reason text default null,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql
security definer set search_path = app, public, pg_temp
as $$
declare
  v_emp public.employees%rowtype;
  v_type public.leave_types%rowtype;
  v_days numeric(6,2);
  v_bal public.leave_balances%rowtype;
  v_remaining numeric;
  v_flow public.approval_flows%rowtype;
  v_req_id uuid;
  v_appr_req_id uuid;
  v_existing public.leave_requests%rowtype;
  v_step record;
  v_appr uuid;
  v_year int;
begin
  -- 1. identify employee (server-side, never from LLM)
  select * into v_emp from public.employees where id = app.current_employee_id() and deleted_at is null;
  if v_emp.id is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  -- Idempotency: a retried tool call returns the original request, not a new one.
  if p_idempotency_key is not null then
    select * into v_existing from public.leave_requests where idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      return jsonb_build_object('status','duplicate_ignored','request_id',v_existing.id,
        'leave_status', v_existing.status);
    end if;
  end if;

  -- 2. validate dates
  if p_end_date < p_start_date then raise exception 'end_date before start_date' using errcode='22007'; end if;
  if p_start_date < current_date then raise exception 'Cannot request leave in the past' using errcode='22007'; end if;

  -- 3. validate leave type
  select * into v_type from public.leave_types
    where organization_id = v_emp.organization_id and code = p_leave_type_code and status='ACTIVE';
  if v_type.id is null then raise exception 'Unknown leave type %', p_leave_type_code using errcode='22023'; end if;

  -- 4. calculate working days
  v_days := app.count_working_days(p_start_date, p_end_date);
  if v_days <= 0 then raise exception 'Requested range has no working days' using errcode='22007'; end if;

  v_year := extract(year from p_start_date)::int;

  -- 5. check balance (row-locked to prevent concurrent double-spend)
  if v_type.requires_balance then
    select * into v_bal from public.leave_balances
      where employee_id = v_emp.id and leave_type_id = v_type.id and year = v_year
      for update;
    if v_bal.id is null then raise exception 'No leave balance configured for % %', p_leave_type_code, v_year using errcode='23503'; end if;
    v_remaining := app.leave_remaining(v_bal);
    if v_remaining < v_days then
      perform app.write_audit('LEAVE_REQUEST_DENIED', false, 'create_leave_request',
        'leave_requests', null, null,
        jsonb_build_object('requested',v_days,'remaining',v_remaining), null, null,
        'insufficient balance');
      raise exception 'Insufficient leave balance: requested %, remaining %', v_days, v_remaining
        using errcode='23514';
    end if;
  end if;

  -- 6. detect conflicting leave (overlap, not cancelled/rejected)
  if exists (
    select 1 from public.leave_requests
    where employee_id = v_emp.id and deleted_at is null
      and status in ('PENDING','APPROVED')
      and daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) then
    raise exception 'Overlapping leave request already exists' using errcode='23505';
  end if;

  -- 7. determine approval flow
  select * into v_flow from public.approval_flows
    where organization_id = v_emp.organization_id and request_type='LEAVE' and status='ACTIVE'
    order by created_at limit 1;
  if v_flow.id is null then raise exception 'No approval flow configured for LEAVE' using errcode='23503'; end if;

  -- 8. create leave request
  insert into public.leave_requests(organization_id, employee_id, leave_type_id,
      start_date, end_date, working_days, reason, status, idempotency_key, created_by)
  values (v_emp.organization_id, v_emp.id, v_type.id, p_start_date, p_end_date,
      v_days, p_reason, 'PENDING', p_idempotency_key, v_emp.id)
  returning id into v_req_id;

  -- 9. create approval request + resolve step assignees (server-side approvers)
  insert into public.approval_requests(organization_id, flow_id, request_type,
      entity_type, entity_id, requester_id, amount, status, created_by)
  values (v_emp.organization_id, v_flow.id, 'LEAVE', 'leave_requests', v_req_id,
      v_emp.id, null, 'PENDING', v_emp.id)
  returning id into v_appr_req_id;

  update public.leave_requests set approval_request_id = v_appr_req_id where id = v_req_id;

  for v_step in select * from public.approval_steps where flow_id = v_flow.id order by step_no loop
    v_appr := app.resolve_step_approver(v_emp.id, v_step.approver_rule, v_step.approver_role);
    if v_appr is not null then
      insert into public.approval_step_assignees(request_id, step_no, approver_id)
      values (v_appr_req_id, v_step.step_no, v_appr)
      on conflict do nothing;
    end if;
  end loop;

  -- reserve the days
  if v_type.requires_balance then
    update public.leave_balances set pending_days = pending_days + v_days, updated_at = now()
      where id = v_bal.id;
  end if;

  -- 10. audit
  perform app.write_audit('LEAVE_REQUEST_CREATED', true, 'create_leave_request',
    'leave_requests', v_req_id::text, null,
    jsonb_build_object('leave_type',p_leave_type_code,'start',p_start_date,'end',p_end_date,'days',v_days));

  -- 11. structured result
  return jsonb_build_object(
    'status','created',
    'request_id', v_req_id,
    'approval_request_id', v_appr_req_id,
    'leave_type', p_leave_type_code,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'working_days', v_days,
    'leave_status','PENDING',
    'approvers', (select coalesce(jsonb_agg(jsonb_build_object('step',step_no,'approver_id',approver_id)),'[]'::jsonb)
                  from public.approval_step_assignees where request_id = v_appr_req_id)
  );
end;
$$;

-- ---------- cancel_leave_request ----------
create or replace function cancel_leave_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer set search_path = app, public, pg_temp
as $$
declare v_req public.leave_requests%rowtype;
begin
  select * into v_req from public.leave_requests where id = p_request_id and deleted_at is null for update;
  if v_req.id is null then raise exception 'Request not found' using errcode='P0002'; end if;
  if v_req.employee_id <> app.current_employee_id() then
    perform app.write_audit('PERMISSION_DENIED', false, 'cancel_leave_request',
      'leave_requests', p_request_id::text,null,null,null,null,'not owner');
    raise exception 'Only the requester can cancel' using errcode='42501';
  end if;
  if v_req.status <> 'PENDING' then raise exception 'Only PENDING requests can be cancelled' using errcode='22023'; end if;

  update public.leave_requests set status='CANCELLED', decided_at=now(), updated_at=now() where id = v_req.id;
  update public.approval_requests set status='CANCELLED', decided_at=now() where id = v_req.approval_request_id;
  -- release reserved days
  update public.leave_balances b set pending_days = greatest(pending_days - v_req.working_days,0), updated_at=now()
    where b.employee_id = v_req.employee_id and b.leave_type_id = v_req.leave_type_id
      and b.year = extract(year from v_req.start_date)::int;
  perform app.write_audit('LEAVE_REQUEST_CANCELLED', true,'cancel_leave_request','leave_requests',v_req.id::text);
  return jsonb_build_object('status','cancelled','request_id',v_req.id);
end;
$$;

-- ---------- get_leave_request_status ----------
create or replace function get_leave_request_status(p_request_id uuid default null)
returns jsonb
language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_me uuid := app.current_employee_id();
begin
  return coalesce((
    select jsonb_agg(row) from (
      select jsonb_build_object(
        'request_id', lr.id, 'leave_type', lt.code,
        'start_date', lr.start_date, 'end_date', lr.end_date,
        'working_days', lr.working_days, 'status', lr.status,
        'created_at', lr.created_at, 'decided_at', lr.decided_at,
        'pending_step', ar.current_step_no
      ) as row
      from public.leave_requests lr
      join public.leave_types lt on lt.id = lr.leave_type_id
      left join public.approval_requests ar on ar.id = lr.approval_request_id
      where lr.employee_id = v_me and lr.deleted_at is null
        and (p_request_id is null or lr.id = p_request_id)
      order by lr.created_at desc
    ) t
  ), '[]'::jsonb);
end;
$$;

-- ---------- get_team_leave_report ----------
create or replace function get_team_leave_report(p_period text default null)
returns jsonb
language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_me uuid := app.current_employee_id(); v_period text := coalesce(p_period, to_char(current_date,'YYYY-MM'));
begin
  if not app.has_permission('HR_LEAVE_READ_TEAM') and not app.has_permission('HR_LEAVE_READ_ALL') then
    perform app.write_audit('PERMISSION_DENIED', false,'get_team_leave_report',null,null,null,null,null,null,'no team read perm');
    raise exception 'Not authorized to view team leave' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'employee', e.full_name, 'employee_no', e.employee_no,
      'leave_type', lt.code, 'start_date', lr.start_date, 'end_date', lr.end_date,
      'working_days', lr.working_days, 'status', lr.status))
    from public.leave_requests lr
    join public.employees e on e.id = lr.employee_id
    join public.leave_types lt on lt.id = lr.leave_type_id
    join public.teams tm on tm.id = e.team_id
    where lr.deleted_at is null
      and to_char(lr.start_date,'YYYY-MM') = v_period
      -- only teams the viewer leads, unless they hold org-wide read
      and (app.has_permission('HR_LEAVE_READ_ALL') or tm.leader_id = v_me)
  ), '[]'::jsonb);
end;
$$;

-- ---------- get_company_leave_report (HR only) ----------
create or replace function get_company_leave_report(p_period text default null)
returns jsonb
language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_period text := coalesce(p_period, to_char(current_date,'YYYY-MM'));
begin
  if not app.has_permission('HR_LEAVE_READ_ALL') then
    perform app.write_audit('PERMISSION_DENIED', false,'get_company_leave_report',null,null,null,null,null,null,'no company read perm');
    raise exception 'Not authorized to view company leave' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'department', d.name, 'leave_type', lt.code,
      'total_requests', cnt, 'total_days', total_days))
    from (
      select e.department_id, lr.leave_type_id, count(*) cnt, sum(lr.working_days) total_days
      from public.leave_requests lr join public.employees e on e.id = lr.employee_id
      where lr.deleted_at is null and to_char(lr.start_date,'YYYY-MM') = v_period
        and lr.status in ('PENDING','APPROVED')
      group by e.department_id, lr.leave_type_id
    ) g
    join public.departments d on d.id = g.department_id
    join public.leave_types lt on lt.id = g.leave_type_id
  ), '[]'::jsonb);
end;
$$;
