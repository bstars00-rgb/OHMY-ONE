-- ============================================================
-- 0009 — Approval engine business logic
-- ============================================================
-- CRITICAL: the acting approver is ALWAYS app.current_employee_id(). An id
-- supplied by the LLM is never trusted for authority. Authorization = "is the
-- current user a PENDING assignee of the request's CURRENT step".

create or replace function get_my_pending_approvals()
returns jsonb
language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_me uuid := app.current_employee_id();
begin
  if v_me is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if not app.has_permission('APPROVAL_APPROVE') and not app.has_permission('APPROVAL_READ') then
    -- team leaders/managers get APPROVAL_APPROVE via their role; deny others cleanly
    perform app.write_audit('PERMISSION_DENIED', false,'get_my_pending_approvals',null,null,null,null,null,null,'no approval perm');
    raise exception 'Not authorized to view approvals' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'approval_request_id', ar.id,
      'request_type', ar.request_type,
      'requester', e.full_name,
      'requester_no', e.employee_no,
      'step_no', a.step_no,
      'entity_type', ar.entity_type,
      'entity_id', ar.entity_id,
      'summary', case ar.entity_type
        when 'leave_requests' then (
          select lt.code || ' ' || lr.start_date || '~' || lr.end_date || ' (' || lr.working_days || 'd)'
          from public.leave_requests lr join public.leave_types lt on lt.id = lr.leave_type_id
          where lr.id = ar.entity_id)
        else ar.request_type end,
      'created_at', ar.created_at))
    from public.approval_step_assignees a
    join public.approval_requests ar on ar.id = a.request_id
    join public.employees e on e.id = ar.requester_id
    where a.approver_id = v_me and a.status = 'PENDING'
      and ar.status = 'PENDING' and a.step_no = ar.current_step_no
    order by ar.created_at
  ), '[]'::jsonb);
end;
$$;

-- Apply the domain side effect once an approval request reaches its terminal state.
create or replace function app.apply_approval_effect(p_appr public.approval_requests, p_final approval_status)
returns void
language plpgsql
security definer set search_path = app, public, pg_temp
as $$
declare v_lr public.leave_requests%rowtype;
begin
  if p_appr.entity_type = 'leave_requests' then
    select * into v_lr from public.leave_requests where id = p_appr.entity_id for update;
    if v_lr.id is null then return; end if;
    if p_final = 'APPROVED' then
      update public.leave_requests set status='APPROVED', decided_at=now(), updated_at=now() where id=v_lr.id;
      -- move reserved (pending) days to used
      update public.leave_balances set
        pending_days = greatest(pending_days - v_lr.working_days, 0),
        used_days    = used_days + v_lr.working_days,
        updated_at   = now()
      where employee_id = v_lr.employee_id and leave_type_id = v_lr.leave_type_id
        and year = extract(year from v_lr.start_date)::int;
    elsif p_final = 'REJECTED' then
      update public.leave_requests set status='REJECTED', decided_at=now(), updated_at=now() where id=v_lr.id;
      update public.leave_balances set
        pending_days = greatest(pending_days - v_lr.working_days, 0), updated_at = now()
      where employee_id = v_lr.employee_id and leave_type_id = v_lr.leave_type_id
        and year = extract(year from v_lr.start_date)::int;
    end if;
  end if;
end;
$$;

create or replace function approve_request(
  p_approval_request_id uuid, p_comment text default null)
returns jsonb
language plpgsql
security definer set search_path = app, public, pg_temp
as $$
declare
  v_me uuid := app.current_employee_id();
  v_ar public.approval_requests%rowtype;
  v_assignee public.approval_step_assignees%rowtype;
  v_next int;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if not app.has_permission('APPROVAL_APPROVE') then
    perform app.write_audit('PERMISSION_DENIED', false,'approve_request','approval_requests',p_approval_request_id::text,null,null,null,null,'no approve perm');
    raise exception 'Not authorized to approve' using errcode='42501';
  end if;

  select * into v_ar from public.approval_requests where id = p_approval_request_id for update;
  if v_ar.id is null then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_ar.status <> 'PENDING' then
    return jsonb_build_object('status','already_decided','decision',v_ar.status,'approval_request_id',v_ar.id);
  end if;

  -- Server-side authorization: current user must be a PENDING assignee of the CURRENT step.
  select * into v_assignee from public.approval_step_assignees
    where request_id = v_ar.id and step_no = v_ar.current_step_no
      and approver_id = v_me and status='PENDING';
  if v_assignee.id is null then
    perform app.write_audit('PERMISSION_DENIED', false,'approve_request','approval_requests',v_ar.id::text,null,null,null,null,'not an authorized approver for current step');
    raise exception 'You are not an authorized approver for this request' using errcode='42501';
  end if;

  insert into public.approval_actions(request_id, step_no, actor_id, action, comment)
    values (v_ar.id, v_ar.current_step_no, v_me, 'APPROVE', p_comment);
  update public.approval_step_assignees set status='APPROVED' where id = v_assignee.id;

  -- Advance to next step, or finalize.
  select min(step_no) into v_next from public.approval_step_assignees
    where request_id = v_ar.id and step_no > v_ar.current_step_no;
  if v_next is null then
    update public.approval_requests set status='APPROVED', decided_at=now(), updated_at=now(), updated_by=v_me where id=v_ar.id;
    perform app.apply_approval_effect(v_ar, 'APPROVED');
    perform app.write_audit('LEAVE_REQUEST_APPROVED', true,'approve_request','approval_requests',v_ar.id::text,null,jsonb_build_object('final','APPROVED'));
    return jsonb_build_object('status','approved','final',true,'approval_request_id',v_ar.id);
  else
    update public.approval_requests set current_step_no=v_next, updated_at=now(), updated_by=v_me where id=v_ar.id;
    perform app.write_audit('APPROVAL_STEP_APPROVED', true,'approve_request','approval_requests',v_ar.id::text,null,jsonb_build_object('advanced_to_step',v_next));
    return jsonb_build_object('status','approved','final',false,'next_step',v_next,'approval_request_id',v_ar.id);
  end if;
end;
$$;

create or replace function reject_request(
  p_approval_request_id uuid, p_comment text default null)
returns jsonb
language plpgsql
security definer set search_path = app, public, pg_temp
as $$
declare
  v_me uuid := app.current_employee_id();
  v_ar public.approval_requests%rowtype;
  v_assignee public.approval_step_assignees%rowtype;
begin
  if v_me is null then raise exception 'Not authenticated' using errcode='28000'; end if;
  if not app.has_permission('APPROVAL_REJECT') then
    perform app.write_audit('PERMISSION_DENIED', false,'reject_request','approval_requests',p_approval_request_id::text,null,null,null,null,'no reject perm');
    raise exception 'Not authorized to reject' using errcode='42501';
  end if;

  select * into v_ar from public.approval_requests where id = p_approval_request_id for update;
  if v_ar.id is null then raise exception 'Approval request not found' using errcode='P0002'; end if;
  if v_ar.status <> 'PENDING' then
    return jsonb_build_object('status','already_decided','decision',v_ar.status,'approval_request_id',v_ar.id);
  end if;

  select * into v_assignee from public.approval_step_assignees
    where request_id = v_ar.id and step_no = v_ar.current_step_no and approver_id = v_me and status='PENDING';
  if v_assignee.id is null then
    perform app.write_audit('PERMISSION_DENIED', false,'reject_request','approval_requests',v_ar.id::text,null,null,null,null,'not an authorized approver');
    raise exception 'You are not an authorized approver for this request' using errcode='42501';
  end if;

  insert into public.approval_actions(request_id, step_no, actor_id, action, comment)
    values (v_ar.id, v_ar.current_step_no, v_me, 'REJECT', p_comment);
  update public.approval_step_assignees set status='REJECTED' where id = v_assignee.id;
  update public.approval_requests set status='REJECTED', decided_at=now(), updated_at=now(), updated_by=v_me where id=v_ar.id;
  perform app.apply_approval_effect(v_ar, 'REJECTED');
  perform app.write_audit('LEAVE_REQUEST_REJECTED', true,'reject_request','approval_requests',v_ar.id::text,null,jsonb_build_object('final','REJECTED'));
  return jsonb_build_object('status','rejected','approval_request_id',v_ar.id);
end;
$$;

create or replace function get_approval_history(p_approval_request_id uuid default null)
returns jsonb
language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_me uuid := app.current_employee_id();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'approval_request_id', aa.request_id, 'step_no', aa.step_no,
      'actor', e.full_name, 'action', aa.action, 'comment', aa.comment, 'at', aa.created_at)
      order by aa.created_at)
    from public.approval_actions aa
    join public.employees e on e.id = aa.actor_id
    join public.approval_requests ar on ar.id = aa.request_id
    where (p_approval_request_id is null or aa.request_id = p_approval_request_id)
      -- history visible to the actor, the requester, or org-wide approval readers
      and (aa.actor_id = v_me or ar.requester_id = v_me or app.has_permission('APPROVAL_READ'))
  ), '[]'::jsonb);
end;
$$;
