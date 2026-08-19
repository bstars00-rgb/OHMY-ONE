-- ============================================================
-- 0006 — HR: leave, attendance, business trips
-- ============================================================

create table leave_types (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code            text not null,                 -- ANNUAL, SICK, UNPAID ...
  name            text not null,
  is_paid         boolean not null default true,
  requires_balance boolean not null default true,
  status          record_status not null default 'ACTIVE',
  unique (organization_id, code)
);

create table leave_policies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  leave_type_id   uuid not null references leave_types(id),
  annual_days     numeric(6,2) not null default 15,   -- entitlement / year
  max_carryover   numeric(6,2) not null default 0,
  effective_year  int not null,
  unique (organization_id, leave_type_id, effective_year)
);

-- Balance is authoritative state: entitled + carried - used - pending.
create table leave_balances (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  employee_id     uuid not null references employees(id) on delete cascade,
  leave_type_id   uuid not null references leave_types(id),
  year            int not null,
  entitled_days   numeric(6,2) not null default 0,
  carried_days    numeric(6,2) not null default 0,
  used_days       numeric(6,2) not null default 0,
  pending_days    numeric(6,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);
-- Convenience computed view of remaining days.
create or replace function app.leave_remaining(b leave_balances)
returns numeric language sql immutable as $$
  select b.entitled_days + b.carried_days - b.used_days - b.pending_days;
$$;

create table leave_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  employee_id     uuid not null references employees(id),
  leave_type_id   uuid not null references leave_types(id),
  start_date      date not null,
  end_date        date not null,
  working_days    numeric(6,2) not null,
  reason          text,
  status          approval_status not null default 'PENDING',
  approval_request_id uuid references approval_requests(id),
  idempotency_key uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  decided_at      timestamptz,
  deleted_at      timestamptz,
  constraint leave_dates_ck check (end_date >= start_date)
);
create unique index uq_leave_idem
  on leave_requests(idempotency_key) where idempotency_key is not null;
create index idx_leave_emp    on leave_requests(employee_id) where deleted_at is null;
create index idx_leave_status on leave_requests(status);
create index idx_leave_dates  on leave_requests(start_date, end_date);

create table attendance_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  employee_id     uuid not null references employees(id),
  work_date       date not null,
  check_in        timestamptz,
  check_out       timestamptz,
  source          text default 'SYSTEM',
  unique (employee_id, work_date)
);

create table business_trips (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  employee_id     uuid not null references employees(id),
  destination     text not null,
  start_date      date not null,
  end_date        date not null,
  purpose         text,
  status          approval_status not null default 'PENDING',
  approval_request_id uuid references approval_requests(id),
  created_at      timestamptz not null default now(),
  constraint trip_dates_ck check (end_date >= start_date)
);
