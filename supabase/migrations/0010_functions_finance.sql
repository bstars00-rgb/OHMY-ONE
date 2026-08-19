-- ============================================================
-- 0010 — Finance business logic (deterministic; DB is source of truth)
-- ============================================================
-- P&L is derived from POSTED journal lines only. Claude must never assemble an
-- income statement itself (ADR-001). Sign convention:
--   REVENUE, OTHER_INCOME  -> credit-normal  => amount = credit - debit
--   COGS, EXPENSE, OTHER_EXPENSE -> debit-normal => amount = debit - credit

create or replace function app.resolve_finance_org(p_org_code text)
returns uuid
language plpgsql stable
security definer set search_path = app, public, pg_temp
as $$
declare v_org uuid;
begin
  if p_org_code is null then
    select organization_id into v_org from public.employees where id = app.current_employee_id();
  else
    select id into v_org from public.organizations where code = p_org_code;
  end if;
  return v_org;
end;
$$;

-- Core reusable P&L component aggregation for one org + period.
create or replace function app.pnl_components(p_org uuid, p_period text)
returns table(revenue numeric, cogs numeric, opex numeric, other_income numeric, other_expense numeric)
language sql stable
security definer set search_path = app, public, pg_temp
as $$
  select
    coalesce(sum(case when a.account_type='REVENUE'       then jl.credit - jl.debit end),0),
    coalesce(sum(case when a.account_type='COGS'          then jl.debit  - jl.credit end),0),
    coalesce(sum(case when a.account_type='EXPENSE'       then jl.debit  - jl.credit end),0),
    coalesce(sum(case when a.account_type='OTHER_INCOME'  then jl.credit - jl.debit end),0),
    coalesce(sum(case when a.account_type='OTHER_EXPENSE' then jl.debit  - jl.credit end),0)
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id and je.status='POSTED'
  join public.chart_of_accounts a on a.id = jl.account_id
  where jl.organization_id = p_org and je.period = p_period;
$$;

create or replace function app.require_finance(p_perm text, p_tool text)
returns void
language plpgsql
security definer set search_path = app, public, pg_temp
as $$
begin
  if not app.has_permission(p_perm) then
    perform app.write_audit('PERMISSION_DENIED', false, p_tool, 'finance', null, null, null, null, null, 'missing '||p_perm);
    raise exception 'Not authorized: % required', p_perm using errcode='42501';
  end if;
end;
$$;

create or replace function get_monthly_revenue(p_period text default null, p_org_code text default null)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp as $$
declare v_org uuid := app.resolve_finance_org(p_org_code);
        v_period text := coalesce(p_period, to_char(current_date,'YYYY-MM')); c record;
begin
  perform app.require_finance('FINANCE_REVENUE_READ','get_monthly_revenue');
  select * into c from app.pnl_components(v_org, v_period);
  perform app.write_audit('FINANCE_REPORT_VIEWED', true,'get_monthly_revenue','finance',v_org::text,null,jsonb_build_object('period',v_period,'kind','revenue'));
  return jsonb_build_object('organization',v_org,'period',v_period,'revenue',c.revenue);
end; $$;

create or replace function get_monthly_expenses(p_period text default null, p_org_code text default null)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp as $$
declare v_org uuid := app.resolve_finance_org(p_org_code);
        v_period text := coalesce(p_period, to_char(current_date,'YYYY-MM')); c record;
begin
  perform app.require_finance('FINANCE_EXPENSE_READ','get_monthly_expenses');
  select * into c from app.pnl_components(v_org, v_period);
  perform app.write_audit('FINANCE_REPORT_VIEWED', true,'get_monthly_expenses','finance',v_org::text,null,jsonb_build_object('period',v_period,'kind','expenses'));
  return jsonb_build_object('organization',v_org,'period',v_period,
    'cogs',c.cogs,'operating_expenses',c.opex,'other_expense',c.other_expense,
    'total_expenses', c.cogs + c.opex + c.other_expense);
end; $$;

create or replace function generate_income_statement(p_period text default null, p_org_code text default null)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp as $$
declare v_org uuid := app.resolve_finance_org(p_org_code);
        v_period text := coalesce(p_period, to_char(current_date,'YYYY-MM'));
        c record; v_gross numeric; v_op numeric; v_net numeric;
begin
  perform app.require_finance('FINANCE_PNL_READ','generate_income_statement');
  select * into c from app.pnl_components(v_org, v_period);
  v_gross := c.revenue - c.cogs;
  v_op    := v_gross - c.opex;
  v_net   := v_op + c.other_income - c.other_expense;
  perform app.write_audit('FINANCE_REPORT_VIEWED', true,'generate_income_statement','finance',v_org::text,null,jsonb_build_object('period',v_period,'kind','pnl'));
  return jsonb_build_object(
    'organization', v_org, 'period', v_period, 'currency','USD',
    'revenue', c.revenue,
    'cogs', c.cogs,
    'gross_profit', v_gross,
    'operating_expenses', c.opex,
    'operating_profit', v_op,
    'other_income', c.other_income,
    'other_expense', c.other_expense,
    'net_profit', v_net
  );
end; $$;

create or replace function compare_financial_periods(p_period_current text, p_period_prev text, p_org_code text default null)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp as $$
declare v_org uuid := app.resolve_finance_org(p_org_code); cur record; prv record;
begin
  perform app.require_finance('FINANCE_PNL_READ','compare_financial_periods');
  select * into cur from app.pnl_components(v_org, p_period_current);
  select * into prv from app.pnl_components(v_org, p_period_prev);
  perform app.write_audit('FINANCE_REPORT_VIEWED', true,'compare_financial_periods','finance',v_org::text,null,jsonb_build_object('cur',p_period_current,'prev',p_period_prev));
  return jsonb_build_object(
    'organization', v_org,
    'current', jsonb_build_object('period',p_period_current,'revenue',cur.revenue,'cogs',cur.cogs,
        'operating_expenses',cur.opex,'operating_profit',(cur.revenue-cur.cogs-cur.opex),
        'net_profit',(cur.revenue-cur.cogs-cur.opex+cur.other_income-cur.other_expense)),
    'previous', jsonb_build_object('period',p_period_prev,'revenue',prv.revenue,'cogs',prv.cogs,
        'operating_expenses',prv.opex,'operating_profit',(prv.revenue-prv.cogs-prv.opex),
        'net_profit',(prv.revenue-prv.cogs-prv.opex+prv.other_income-prv.other_expense)),
    'variance', jsonb_build_object(
        'revenue', cur.revenue - prv.revenue,
        'operating_expenses', cur.opex - prv.opex,
        'operating_profit', (cur.revenue-cur.cogs-cur.opex) - (prv.revenue-prv.cogs-prv.opex),
        'net_profit', (cur.revenue-cur.cogs-cur.opex+cur.other_income-cur.other_expense)
                     - (prv.revenue-prv.cogs-prv.opex+prv.other_income-prv.other_expense))
  );
end; $$;

create or replace function get_accounts_receivable(p_org_code text default null)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp as $$
declare v_org uuid := app.resolve_finance_org(p_org_code);
begin
  perform app.require_finance('FINANCE_REVENUE_READ','get_accounts_receivable');
  return coalesce((
    select jsonb_build_object('organization',v_org,
      'total_outstanding', coalesce(sum(amount - amount_paid),0),
      'items', coalesce(jsonb_agg(jsonb_build_object('invoice_no',invoice_no,'customer',c.name,
        'amount',amount,'paid',amount_paid,'outstanding',amount-amount_paid,'due_date',due_date,'status',i.status)
        order by due_date),'[]'::jsonb))
    from public.invoices i left join public.customers c on c.id = i.customer_id
    where i.organization_id = v_org and i.direction='INBOUND' and i.status not in ('PAID','VOID')
  ), jsonb_build_object('organization',v_org,'total_outstanding',0,'items','[]'::jsonb));
end; $$;

create or replace function get_accounts_payable(p_org_code text default null)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp as $$
declare v_org uuid := app.resolve_finance_org(p_org_code);
begin
  perform app.require_finance('FINANCE_EXPENSE_READ','get_accounts_payable');
  return coalesce((
    select jsonb_build_object('organization',v_org,
      'total_outstanding', coalesce(sum(amount - amount_paid),0),
      'items', coalesce(jsonb_agg(jsonb_build_object('invoice_no',invoice_no,'vendor',v.name,
        'amount',amount,'paid',amount_paid,'outstanding',amount-amount_paid,'due_date',due_date,'status',i.status)
        order by due_date),'[]'::jsonb))
    from public.invoices i left join public.vendors v on v.id = i.vendor_id
    where i.organization_id = v_org and i.direction='OUTBOUND' and i.status not in ('PAID','VOID')
  ), jsonb_build_object('organization',v_org,'total_outstanding',0,'items','[]'::jsonb));
end; $$;

create or replace function get_budget_variance(p_period text default null, p_org_code text default null)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp as $$
declare v_org uuid := app.resolve_finance_org(p_org_code);
        v_period text := coalesce(p_period, to_char(current_date,'YYYY-MM'));
begin
  perform app.require_finance('FINANCE_PNL_READ','get_budget_variance');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'department', d.name, 'account', a.name,
      'budget', b.amount, 'actual', coalesce(act.actual,0),
      'variance', b.amount - coalesce(act.actual,0)))
    from public.budgets b
    join public.chart_of_accounts a on a.id = b.account_id
    left join public.departments d on d.id = b.department_id
    left join lateral (
      select sum(jl.debit - jl.credit) actual
      from public.journal_lines jl
      join public.journal_entries je on je.id=jl.journal_entry_id and je.status='POSTED'
      where jl.account_id = b.account_id and je.period = b.period
        and (b.department_id is null or jl.department_id = b.department_id)
    ) act on true
    where b.organization_id = v_org and b.period = v_period
  ), '[]'::jsonb);
end; $$;

-- ---------- Phase 12: cross-functional HR x Finance dataset ----------
-- Deterministic dataset the executive query interprets: departments whose labor
-- cost rose while revenue did not keep pace. Claude reads this; it invents nothing.
create or replace function get_labor_vs_revenue_by_department(
  p_period_current text, p_period_prev text, p_org_code text default null)
returns jsonb language plpgsql stable
security definer set search_path = app, public, pg_temp as $$
declare v_org uuid := app.resolve_finance_org(p_org_code);
begin
  perform app.require_finance('FINANCE_PNL_READ','get_labor_vs_revenue_by_department');
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by (x.labor_delta - x.revenue_delta) desc)
    from (
      select d.name as department,
        coalesce(lc_cur.labor,0) as labor_current,
        coalesce(lc_prev.labor,0) as labor_prev,
        coalesce(lc_cur.labor,0) - coalesce(lc_prev.labor,0) as labor_delta,
        coalesce(rev_cur.rev,0) as revenue_current,
        coalesce(rev_prev.rev,0) as revenue_prev,
        coalesce(rev_cur.rev,0) - coalesce(rev_prev.rev,0) as revenue_delta,
        (coalesce(lc_cur.labor,0) > coalesce(lc_prev.labor,0)
          and (coalesce(rev_cur.rev,0) - coalesce(rev_prev.rev,0))
              <= (coalesce(lc_cur.labor,0) - coalesce(lc_prev.labor,0))) as flagged
      from public.departments d
      left join lateral (select sum(amount) labor from public.expenses
        where department_id=d.id and category='PAYROLL' and period=p_period_current) lc_cur on true
      left join lateral (select sum(amount) labor from public.expenses
        where department_id=d.id and category='PAYROLL' and period=p_period_prev) lc_prev on true
      left join lateral (select sum(jl.credit-jl.debit) rev from public.journal_lines jl
        join public.journal_entries je on je.id=jl.journal_entry_id and je.status='POSTED'
        join public.chart_of_accounts a on a.id=jl.account_id and a.account_type='REVENUE'
        where jl.department_id=d.id and je.period=p_period_current) rev_cur on true
      left join lateral (select sum(jl.credit-jl.debit) rev from public.journal_lines jl
        join public.journal_entries je on je.id=jl.journal_entry_id and je.status='POSTED'
        join public.chart_of_accounts a on a.id=jl.account_id and a.account_type='REVENUE'
        where jl.department_id=d.id and je.period=p_period_prev) rev_prev on true
      where d.organization_id = v_org
    ) x
  ), '[]'::jsonb);
end; $$;
