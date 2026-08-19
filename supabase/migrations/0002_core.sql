-- ============================================================
-- 0002 — Core org structure & people
-- ============================================================

-- ---------- organizations (legal entities / regions) ----------
create table organizations (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,              -- e.g. OHMY_VN
  name            text not null,
  parent_id       uuid references organizations(id), -- OHMYHOTEL group -> country entities
  region          text,                              -- e.g. APAC
  currency        char(3) not null default 'USD',
  status          record_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz
);

-- ---------- departments ----------
create table departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code            text not null,                     -- OP, FIN, HR ...
  name            text not null,
  manager_id      uuid,                              -- FK added after employees exists
  status          record_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz,
  unique (organization_id, code)
);

-- ---------- teams ----------
create table teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  department_id   uuid not null references departments(id),
  code            text not null,
  name            text not null,
  leader_id       uuid,                              -- FK added after employees exists
  status          record_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz,
  unique (organization_id, code)
);

-- ---------- employees ----------
-- `user_id` links to Supabase auth.users. Nullable so seed/demo employees can
-- exist before an auth account is provisioned.
create table employees (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  department_id   uuid references departments(id),
  team_id         uuid references teams(id),
  manager_id      uuid references employees(id),
  user_id         uuid unique,                       -- = auth.users.id in Supabase
  employee_no     text not null unique,
  full_name       text not null,
  email           citext not null unique,
  title           text,
  employment_type text not null default 'FULL_TIME',
  hire_date       date not null,
  base_salary     numeric(18,2),                     -- confidential; RLS-guarded
  status          record_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz
);

-- Backfill the manager/leader FKs now that employees exists.
alter table departments
  add constraint departments_manager_fk
  foreign key (manager_id) references employees(id);

alter table teams
  add constraint teams_leader_fk
  foreign key (leader_id) references employees(id);

-- ---------- user_profiles (non-sensitive presentation data) ----------
create table user_profiles (
  employee_id     uuid primary key references employees(id) on delete cascade,
  display_name    text,
  locale          text not null default 'ko-KR',
  timezone        text not null default 'Asia/Seoul',
  avatar_url      text,
  phone           text,
  updated_at      timestamptz not null default now()
);

-- ---------- indexes ----------
create index idx_departments_org       on departments(organization_id) where deleted_at is null;
create index idx_teams_dept            on teams(department_id) where deleted_at is null;
create index idx_employees_org         on employees(organization_id) where deleted_at is null;
create index idx_employees_team        on employees(team_id) where deleted_at is null;
create index idx_employees_dept        on employees(department_id) where deleted_at is null;
create index idx_employees_manager     on employees(manager_id) where deleted_at is null;
create index idx_employees_user        on employees(user_id) where user_id is not null;
