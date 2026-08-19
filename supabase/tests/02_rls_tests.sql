-- ============================================================
-- OHMY ONE — Row-Level Security direct-access tests
-- Proves that bypassing the MCP/RPC layer and hitting tables directly with a
-- user identity STILL cannot over-read (ADR-005). We impersonate the
-- `authenticated` role with a JWT subject claim, exactly as PostgREST would.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/02_rls_tests.sql
-- ============================================================
set search_path = public, app;

-- Reuse the assert helper if 01 already created it; define defensively otherwise.
create schema if not exists _t;
create or replace function _t.ok(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond then raise notice 'PASS: %', label;
  else raise exception 'FAIL: %', label; end if;
end $$;

-- R1: Lucy (employee) cannot see a colleague's leave_balances rows directly.
do $$
declare v_lucy uuid; v_mina uuid; v_cnt int;
begin
  select user_id into v_lucy from public.employees where employee_no='E005';
  select id      into v_mina from public.employees where employee_no='E006';
  perform set_config('app.current_employee_id','', true);          -- force auth.uid() path
  perform set_config('request.jwt.claim.sub', v_lucy::text, true);
  set local role authenticated;
    select count(*) into v_cnt from public.leave_balances where employee_id = v_mina;
  reset role;
  perform _t.ok(v_cnt = 0, 'R1 RLS hides other employees'' leave_balances from direct access');
end $$;

-- R2: Lucy CAN see her own leave_balances (RLS permits self).
do $$
declare v_lucy uuid; v_self uuid; v_cnt int;
begin
  select user_id, id into v_lucy, v_self from public.employees where employee_no='E005';
  perform set_config('app.current_employee_id','', true);
  perform set_config('request.jwt.claim.sub', v_lucy::text, true);
  set local role authenticated;
    select count(*) into v_cnt from public.leave_balances where employee_id = v_self;
  reset role;
  perform _t.ok(v_cnt >= 1, 'R2 RLS permits self leave_balances read');
end $$;

-- R3: Lucy cannot read ANY finance ledger rows directly (no finance perm).
do $$
declare v_lucy uuid; v_cnt int;
begin
  select user_id into v_lucy from public.employees where employee_no='E005';
  perform set_config('app.current_employee_id','', true);
  perform set_config('request.jwt.claim.sub', v_lucy::text, true);
  set local role authenticated;
    select count(*) into v_cnt from public.journal_lines;
  reset role;
  perform _t.ok(v_cnt = 0, 'R3 RLS hides all ledger rows from a non-finance user');
end $$;

-- R4: base_salary column is unreadable by authenticated (column-level privilege).
do $$
declare v_lucy uuid; v_blocked boolean := false;
begin
  select user_id into v_lucy from public.employees where employee_no='E005';
  perform set_config('request.jwt.claim.sub', v_lucy::text, true);
  set local role authenticated;
    begin
      perform base_salary from public.employees limit 1;
    exception when insufficient_privilege then v_blocked := true;
    end;
  reset role;
  perform _t.ok(v_blocked, 'R4 base_salary column not selectable by authenticated');
end $$;

-- R5: authenticated cannot INSERT into audit_logs directly (no write path).
do $$
declare v_lucy uuid; v_blocked boolean := false;
begin
  select user_id into v_lucy from public.employees where employee_no='E005';
  perform set_config('request.jwt.claim.sub', v_lucy::text, true);
  set local role authenticated;
    begin
      insert into public.audit_logs(action) values ('FORGED');
    exception when insufficient_privilege then v_blocked := true;
    end;
  reset role;
  perform _t.ok(v_blocked, 'R5 authenticated cannot write audit_logs directly');
end $$;

do $$ begin raise notice '================  ALL RLS TESTS PASSED  ================'; end $$;
