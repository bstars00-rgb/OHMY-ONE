-- ============================================================
-- 0011 — Row-Level Security (last line of defense, always ON)
-- ============================================================
-- Model (ADR-005):
--   * All WRITES flow through SECURITY DEFINER RPCs owned by a BYPASSRLS role.
--   * The `authenticated` role gets ONLY the SELECT policies below, so a direct
--     PostgREST/psql connection with a user JWT cannot over-read.
--   * `service_role` bypasses RLS but the MCP server never runs raw SQL with it —
--     it only calls the vetted RPCs (ADR-002).
-- Column-level: base_salary is revoked from `authenticated` entirely; it is only
-- reachable via a permissioned SECURITY DEFINER RPC.

-- Helper: does the acting user hold ANY finance read permission?
create or replace function app.has_any_finance_read()
returns boolean language sql stable
security definer set search_path = app, public, pg_temp as $$
  select app.has_permission('FINANCE_REVENUE_READ')
      or app.has_permission('FINANCE_EXPENSE_READ')
      or app.has_permission('FINANCE_PNL_READ');
$$;

create or replace function app.same_org(p_org uuid)
returns boolean language sql stable
security definer set search_path = app, public, pg_temp as $$
  select exists (select 1 from public.employees
    where id = app.current_employee_id() and organization_id = p_org);
$$;

-- Convenience macro-ish: enable + force RLS.
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','departments','teams','employees','user_profiles',
    'roles','permissions','role_permissions','user_roles',
    'leave_types','leave_policies','leave_balances','leave_requests',
    'attendance_records','business_trips',
    'approval_flows','approval_steps','approval_requests','approval_step_assignees','approval_actions',
    'chart_of_accounts','cost_centers','journal_entries','journal_lines',
    'customers','vendors','invoices','invoice_lines','payments','expenses',
    'budgets','monthly_financial_snapshots',
    'audit_logs','notifications','attachments'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end $$;

-- ---------- Directory / org structure (same-org readable) ----------
create policy org_self_read on organizations for select to authenticated
  using (app.same_org(id) or id = (select organization_id from public.employees where id = app.current_employee_id()));
create policy dept_read on departments for select to authenticated using (app.same_org(organization_id));
create policy team_read on teams for select to authenticated using (app.same_org(organization_id));

-- ---------- employees ----------
-- Row visible: self, org-wide HR reader, or someone who leads/manages the person.
create policy emp_read on employees for select to authenticated using (
  id = app.current_employee_id()
  or app.has_permission('HR_EMPLOYEE_READ_ALL')
  or app.employee_relation(id) in ('TEAM','DEPARTMENT')
);
create policy profile_read on user_profiles for select to authenticated
  using (employee_id = app.current_employee_id() or app.has_permission('HR_EMPLOYEE_READ_ALL'));

-- ---------- RBAC (a user may see their own role grants) ----------
create policy userroles_self on user_roles for select to authenticated
  using (employee_id = app.current_employee_id() or app.has_permission('ADMIN_RBAC_MANAGE'));
create policy roles_read on roles for select to authenticated using (true);
create policy perms_read on permissions for select to authenticated using (true);
create policy roleperms_read on role_permissions for select to authenticated using (true);

-- ---------- HR ----------
create policy ltype_read on leave_types for select to authenticated using (app.same_org(organization_id));
create policy lpolicy_read on leave_policies for select to authenticated using (app.same_org(organization_id));
create policy lbal_read on leave_balances for select to authenticated
  using (employee_id = app.current_employee_id() or app.can_read_employee_hr(employee_id));
create policy lreq_read on leave_requests for select to authenticated
  using (employee_id = app.current_employee_id() or app.can_read_employee_hr(employee_id));
create policy att_read on attendance_records for select to authenticated
  using (employee_id = app.current_employee_id() or app.can_read_employee_hr(employee_id));
create policy trip_read on business_trips for select to authenticated
  using (employee_id = app.current_employee_id() or app.can_read_employee_hr(employee_id));

-- ---------- Approval ----------
create policy aflow_read on approval_flows for select to authenticated using (app.same_org(organization_id));
create policy astep_read on approval_steps for select to authenticated using (true);
create policy areq_read on approval_requests for select to authenticated using (
  requester_id = app.current_employee_id()
  or app.has_permission('APPROVAL_READ')
  or exists (select 1 from public.approval_step_assignees a
             where a.request_id = approval_requests.id and a.approver_id = app.current_employee_id())
);
create policy aassignee_read on approval_step_assignees for select to authenticated using (
  approver_id = app.current_employee_id()
  or app.has_permission('APPROVAL_READ')
  or exists (select 1 from public.approval_requests ar
             where ar.id = approval_step_assignees.request_id and ar.requester_id = app.current_employee_id())
);
create policy aaction_read on approval_actions for select to authenticated using (
  actor_id = app.current_employee_id()
  or app.has_permission('APPROVAL_READ')
  or exists (select 1 from public.approval_requests ar
             where ar.id = approval_actions.request_id and ar.requester_id = app.current_employee_id())
);

-- ---------- Finance (any finance read perm + same org) ----------
create policy coa_read   on chart_of_accounts for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));
create policy cc_read    on cost_centers for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));
create policy je_read    on journal_entries for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));
create policy jl_read    on journal_lines for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));
create policy cust_read  on customers for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));
create policy vend_read  on vendors for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));
create policy inv_read   on invoices for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));
create policy invl_read  on invoice_lines for select to authenticated using (
  exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and app.same_org(i.organization_id)) and app.has_any_finance_read());
create policy pay_read   on payments for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));
create policy exp_read   on expenses for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));
create policy bud_read   on budgets for select to authenticated using (app.has_permission('FINANCE_PNL_READ') and app.same_org(organization_id));
create policy snap_read  on monthly_financial_snapshots for select to authenticated using (app.has_any_finance_read() and app.same_org(organization_id));

-- ---------- Audit / notifications / attachments ----------
create policy audit_read on audit_logs for select to authenticated
  using (app.has_permission('ADMIN_AUDIT_READ') or employee_id = app.current_employee_id());
create policy notif_read on notifications for select to authenticated
  using (employee_id = app.current_employee_id());
create policy attach_read on attachments for select to authenticated
  using (app.same_org(organization_id));

-- ---------- Grants ----------
-- Table-level SELECT so RLS can *filter* on the authenticated/PostgREST path.
-- RLS still enforces row visibility; any table whose RLS is enabled but has no
-- SELECT policy exposes zero rows to authenticated (secure default).
grant select on all tables in schema public to authenticated;

-- Column-level salary protection: the blanket grant above re-added every column,
-- so re-revoke employees and grant back everything EXCEPT base_salary. Salary is
-- then reachable only through the permissioned get_employee_compensation() RPC.
revoke select on public.employees from authenticated;
grant select (id, organization_id, department_id, team_id, manager_id, user_id,
  employee_no, full_name, email, title, employment_type, hire_date, status,
  created_at, updated_at, deleted_at) on public.employees to authenticated;

-- The RPCs are callable by the app roles; execution is still gated INSIDE each
-- function by the permission engine.
grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
