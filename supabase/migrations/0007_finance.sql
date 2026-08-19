-- ============================================================
-- 0007 — Finance: GL, AR/AP, expenses, budgets, snapshots
-- ============================================================
-- Double-entry general ledger is the source of truth. Revenue/expense/P&L
-- functions aggregate POSTED journal lines. All money is NUMERIC (ADR-004).

create table chart_of_accounts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code            text not null,                 -- 4000, 5000 ...
  name            text not null,
  account_type    account_type not null,
  parent_id       uuid references chart_of_accounts(id),
  is_active       boolean not null default true,
  unique (organization_id, code)
);
create index idx_coa_org_type on chart_of_accounts(organization_id, account_type);

create table cost_centers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  department_id   uuid references departments(id),
  code            text not null,
  name            text not null,
  unique (organization_id, code)
);

create table journal_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  entry_no        text not null,
  entry_date      date not null,
  period          text not null,                 -- 'YYYY-MM' for fast filtering
  memo            text,
  status          journal_status not null default 'POSTED',
  source          text default 'MANUAL',
  created_at      timestamptz not null default now(),
  created_by      uuid,
  unique (organization_id, entry_no)
);
create index idx_je_org_period on journal_entries(organization_id, period) where status = 'POSTED';

create table journal_lines (
  id              uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  account_id      uuid not null references chart_of_accounts(id),
  cost_center_id  uuid references cost_centers(id),
  department_id   uuid references departments(id),
  debit           numeric(18,2) not null default 0,
  credit          numeric(18,2) not null default 0,
  memo            text,
  constraint jl_nonneg_ck check (debit >= 0 and credit >= 0),
  constraint jl_one_side_ck check (not (debit > 0 and credit > 0))
);
create index idx_jl_entry   on journal_lines(journal_entry_id);
create index idx_jl_account on journal_lines(account_id);
create index idx_jl_dept    on journal_lines(department_id);

-- Enforce balanced entries (sum debit = sum credit) at posting time.
create or replace function app.assert_entry_balanced(p_entry uuid)
returns void language plpgsql
security definer set search_path = app, public, pg_temp as $$
declare v_d numeric(18,2); v_c numeric(18,2);
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_d, v_c from public.journal_lines where journal_entry_id = p_entry;
  if v_d <> v_c then
    raise exception 'Unbalanced journal entry %: debit % <> credit %', p_entry, v_d, v_c
      using errcode = 'check_violation';
  end if;
end;
$$;

create table customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null, name text not null,
  status record_status not null default 'ACTIVE',
  unique (organization_id, code)
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null, name text not null,
  status record_status not null default 'ACTIVE',
  unique (organization_id, code)
);

create table invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  customer_id     uuid references customers(id),   -- AR when set
  vendor_id       uuid references vendors(id),     -- AP when set
  direction       payment_direction not null,      -- INBOUND=AR, OUTBOUND=AP
  invoice_no      text not null,
  issue_date      date not null,
  due_date        date not null,
  period          text not null,
  amount          numeric(18,2) not null,
  amount_paid     numeric(18,2) not null default 0,
  status          invoice_status not null default 'ISSUED',
  created_at      timestamptz not null default now(),
  unique (organization_id, invoice_no),
  constraint inv_party_ck check (
    (direction = 'INBOUND' and customer_id is not null) or
    (direction = 'OUTBOUND' and vendor_id is not null))
);
create index idx_inv_org_status on invoices(organization_id, status);

create table invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  description  text,
  quantity     numeric(18,4) not null default 1,
  unit_price   numeric(18,2) not null default 0,
  line_total   numeric(18,2) not null default 0
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  invoice_id      uuid references invoices(id),
  direction       payment_direction not null,
  amount          numeric(18,2) not null,
  paid_date       date not null,
  method          text,
  created_at      timestamptz not null default now()
);

create table expenses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  department_id   uuid references departments(id),
  employee_id     uuid references employees(id),
  account_id      uuid references chart_of_accounts(id),
  category        text not null,                 -- PAYROLL, MARKETING ...
  period          text not null,
  amount          numeric(18,2) not null,
  memo            text,
  status          approval_status not null default 'APPROVED',
  approval_request_id uuid references approval_requests(id),
  created_at      timestamptz not null default now()
);
create index idx_expense_org_period on expenses(organization_id, period);

create table budgets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  department_id   uuid references departments(id),
  account_id      uuid references chart_of_accounts(id),
  period          text not null,
  amount          numeric(18,2) not null,
  -- Generated key lets NULL departments participate in the unique constraint
  -- (NULLs are otherwise treated as distinct, allowing duplicate org-wide rows).
  dept_key        uuid generated always as
                    (coalesce(department_id, '00000000-0000-0000-0000-000000000000')) stored,
  unique (organization_id, dept_key, account_id, period)
);

-- Pre-aggregated monthly snapshot (fast dashboards + reconciliation reference).
create table monthly_financial_snapshots (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  period          text not null,
  revenue         numeric(18,2) not null default 0,
  cogs            numeric(18,2) not null default 0,
  opex            numeric(18,2) not null default 0,
  other_income    numeric(18,2) not null default 0,
  other_expense   numeric(18,2) not null default 0,
  net_profit      numeric(18,2) not null default 0,
  created_at      timestamptz not null default now(),
  unique (organization_id, period)
);
