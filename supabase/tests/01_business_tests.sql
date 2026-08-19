-- ============================================================
-- OHMY ONE — Business logic, permission & security tests
-- Run AFTER migrations + seed. Recommended:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_business_tests.sql
-- Any failed assertion raises an exception and aborts the run; reaching the
-- final notice means every test passed. Identity is bound per-test via
-- app.set_current_employee() — the same mechanism the MCP gateway uses.
-- ============================================================
set search_path = public, app;

create schema if not exists _t;

create or replace function _t.ok(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond then raise notice 'PASS: %', label;
  else raise exception 'FAIL: %', label; end if;
end $$;

create or replace function _t.emp(p text) returns uuid
language sql stable as $$ select id from public.employees where employee_no = p $$;

create or replace function _t.appr_for(emp_no text) returns uuid
language sql stable as $$
  select ar.id from public.approval_requests ar
  join public.leave_requests lr on lr.approval_request_id = ar.id
  where lr.employee_id = _t.emp(emp_no) and ar.status='PENDING'
  order by ar.created_at limit 1
$$;

-- =========================================================
-- POSITIVE PATH
-- =========================================================

-- P1: employee reads own balance (deterministic, from DB)
select app.set_current_employee(_t.emp('E005'));  -- Lucy
select _t.ok(jsonb_array_length(get_leave_balance()->'balances') >= 1, 'P1 own leave balance returned');

-- P2: employee creates a leave request (new, Noah)
select app.set_current_employee(_t.emp('E007'));  -- Noah
select _t.ok((create_leave_request('ANNUAL', current_date+3, current_date+3, 'checkup',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')->>'status') = 'created', 'P2 leave request created');

-- P3: team leader sees and approves a team member's request; effect applied
select app.set_current_employee(_t.emp('E004'));  -- David (leads OP1 = Lucy's team)
select _t.ok(jsonb_array_length(get_my_pending_approvals()) >= 1, 'P3a leader sees pending approvals');
select approve_request(_t.appr_for('E005'));       -- approve Lucy's seeded request
select _t.ok((select status from public.leave_requests
   where employee_id=_t.emp('E005') and idempotency_key='11111111-1111-1111-1111-111111111111')='APPROVED',
   'P3b leave marked APPROVED after approval');
select _t.ok((select used_days from public.leave_balances b
   join public.leave_types lt on lt.id=b.leave_type_id
   where b.employee_id=_t.emp('E005') and lt.code='ANNUAL' and b.year=extract(year from current_date)::int) >= 1,
   'P3c reserved days moved to used on approval');

-- P4: finance reads revenue (deterministic > 0)
select app.set_current_employee(_t.emp('E024'));  -- Fiona (FINANCE)
select _t.ok((get_monthly_revenue(to_char(current_date,'YYYY-MM'))->>'revenue')::numeric > 0, 'P4 revenue from ledger');

-- P5: P&L reconciles with the monthly snapshot (financial integrity)
select _t.ok(
  (generate_income_statement(to_char(current_date,'YYYY-MM'))->>'net_profit')::numeric
   = (select net_profit from public.monthly_financial_snapshots
      where period=to_char(current_date,'YYYY-MM')
        and organization_id=(select organization_id from public.employees where employee_no='E024')),
  'P5 income statement net_profit reconciles with snapshot');

-- P5b: income statement identity holds (gross/operating/net computed correctly)
select _t.ok(
  (select (g->>'gross_profit')::numeric = (g->>'revenue')::numeric - (g->>'cogs')::numeric
       and (g->>'operating_profit')::numeric = (g->>'gross_profit')::numeric - (g->>'operating_expenses')::numeric
       and (g->>'net_profit')::numeric = (g->>'operating_profit')::numeric + (g->>'other_income')::numeric - (g->>'other_expense')::numeric
   from (select generate_income_statement(to_char(current_date,'YYYY-MM')) g) s),
  'P5b P&L subtotal identities hold');

-- P6: period comparison returns variance
select _t.ok(
  (compare_financial_periods(to_char(current_date,'YYYY-MM'),
     to_char(current_date - interval '1 month','YYYY-MM'))->'variance') is not null,
  'P6 period comparison variance present');

-- P7: cross-functional dataset flags the CONTENT department (labor up, revenue flat)
select _t.ok(
  exists(select 1 from jsonb_array_elements(
    get_labor_vs_revenue_by_department(to_char(current_date,'YYYY-MM'),
      to_char(current_date - interval '1 month','YYYY-MM'))) e
    where e->>'department'='Content' and (e->>'flagged')::boolean = true),
  'P7 cross-functional query flags Content');

-- =========================================================
-- NEGATIVE / SECURITY PATH  (mandatory tests)
-- =========================================================

-- N1: employee reads ANOTHER employee's leave balance -> denied
select app.set_current_employee(_t.emp('E005'));  -- Lucy
do $$ begin
  begin perform get_leave_balance(_t.emp('E006')); perform _t.ok(false,'N1 must deny');
  exception when insufficient_privilege then perform _t.ok(true,'N1 cross-employee leave read denied');
  end; end $$;

-- N2: employee reads P&L -> denied  (Scenario 10 family)
do $$ begin
  begin perform generate_income_statement(); perform _t.ok(false,'N2 must deny');
  exception when insufficient_privilege then perform _t.ok(true,'N2 employee P&L read denied');
  end; end $$;

-- N2b: employee reads CEO compensation -> denied + audited (Scenario 10 exact)
do $$ begin
  begin perform get_employee_compensation(_t.emp('E001')); perform _t.ok(false,'N2b must deny');
  exception when insufficient_privilege then perform _t.ok(true,'N2b employee reading CEO salary denied');
  end; end $$;

-- N3: HR attempts an unauthorized finance operation -> denied
select app.set_current_employee(_t.emp('E027'));  -- Hana (HR, no finance perms)
do $$ begin
  begin perform get_monthly_revenue(); perform _t.ok(false,'N3 must deny');
  exception when insufficient_privilege then perform _t.ok(true,'N3 HR denied finance read');
  end; end $$;

-- N4: a leader approves a request they are NOT the assignee of (cross-team) -> denied
select app.set_current_employee(_t.emp('E008'));  -- Olivia leads OP2, not Mina's OP1
do $$ begin
  begin perform approve_request(_t.appr_for('E006')); perform _t.ok(false,'N4 must deny');
  exception when insufficient_privilege then perform _t.ok(true,'N4 non-assignee approval denied');
  end; end $$;

-- N5: nonexistent employee id handled gracefully (no crash)
select app.set_current_employee(_t.emp('E027'));  -- HR may read profiles
select _t.ok((get_employee_profile('00000000-0000-0000-0000-0000000000ff')->>'error')='not_found',
  'N5 nonexistent employee id returns not_found');

-- N6: duplicate leave request (idempotency) -> no second row
select app.set_current_employee(_t.emp('E005'));  -- Lucy, reuse seeded key
select _t.ok((create_leave_request('ANNUAL', current_date+1, current_date+1, 'dup',
  '11111111-1111-1111-1111-111111111111')->>'status') = 'duplicate_ignored',
  'N6 idempotent create returns duplicate_ignored');
select _t.ok((select count(*) from public.leave_requests
   where idempotency_key='11111111-1111-1111-1111-111111111111') = 1,
  'N6b only one row exists for the idempotency key');

-- N7: insufficient balance -> denied
select app.set_current_employee(_t.emp('E009'));  -- Peter
do $$ begin
  begin perform create_leave_request('ANNUAL', current_date+30, current_date+90, 'too much',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); perform _t.ok(false,'N7 must deny');
  exception when check_violation then perform _t.ok(true,'N7 insufficient balance denied');
  end; end $$;

-- N8: invalid/empty financial period -> zeros, not an error
select app.set_current_employee(_t.emp('E024'));  -- Fiona
select _t.ok((get_monthly_revenue('2099-01')->>'revenue')::numeric = 0,
  'N8 invalid period yields 0 rather than fabricated data');

-- N9: past-dated leave -> rejected by validation
select app.set_current_employee(_t.emp('E010'));  -- Quinn
do $$ begin
  begin perform create_leave_request('ANNUAL', current_date-5, current_date-3, 'past',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'); perform _t.ok(false,'N9 must reject past dates');
  exception when others then perform _t.ok(true,'N9 past-dated leave rejected');
  end; end $$;

-- N10: SQL-injection string is stored as literal text; schema intact
select app.set_current_employee(_t.emp('E011'));  -- Rachel
select create_leave_request('ANNUAL', current_date+4, current_date+4,
  ''';drop table public.employees;--', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
select _t.ok((select count(*) from public.employees where deleted_at is null) = 30,
  'N10 injection payload stored as data; employees table intact');

-- N11: employee holds no finance permission (no self-escalation path via tools)
select app.set_current_employee(_t.emp('E005'));
select _t.ok(not app.has_permission('FINANCE_PNL_READ'), 'N11 employee cannot self-grant finance access');

-- Audit assertions: denials and sensitive reads were recorded immutably
select _t.ok((select count(*) from public.audit_logs where action='PERMISSION_DENIED') >= 4,
  'AUDIT permission denials recorded');
select _t.ok((select count(*) from public.audit_logs where action='LEAVE_REQUEST_CREATED') >= 1,
  'AUDIT leave creation recorded');
select _t.ok((select count(*) from public.audit_logs where action='LEAVE_REQUEST_APPROVED') >= 1,
  'AUDIT approval recorded');

-- Audit immutability: UPDATE/DELETE must be blocked
do $$ begin
  begin update public.audit_logs set action='TAMPER' where true; perform _t.ok(false,'AUDIT must be immutable');
  exception when insufficient_privilege then perform _t.ok(true,'AUDIT append-only enforced');
  end; end $$;

select app.set_current_employee(null);
do $$ begin raise notice '================  ALL BUSINESS TESTS PASSED  ================'; end $$;
