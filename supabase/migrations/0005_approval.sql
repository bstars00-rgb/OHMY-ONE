-- ============================================================
-- 0005 — Approval engine tables
-- ============================================================
-- A reusable approval workflow. A request_type (e.g. LEAVE, EXPENSE) selects a
-- flow; a flow has ordered steps; each step names an approver resolved by role
-- or by an org-relative rule (e.g. requester's team leader). approval_actions
-- is the immutable trail of who did what.

create table approval_flows (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code            text not null,                 -- LEAVE_STANDARD, EXPENSE_STANDARD
  name            text not null,
  request_type    text not null,                 -- LEAVE | EXPENSE | ...
  min_amount      numeric(18,2),                 -- optional threshold gating
  max_amount      numeric(18,2),
  status          record_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  unique (organization_id, code)
);

create table approval_steps (
  id              uuid primary key default gen_random_uuid(),
  flow_id         uuid not null references approval_flows(id) on delete cascade,
  step_no         int not null,
  name            text not null,
  -- How the approver for this step is determined (resolved server-side):
  approver_rule   text not null,                 -- TEAM_LEADER | DEPT_MANAGER | ROLE
  approver_role   text,                          -- when approver_rule = ROLE
  unique (flow_id, step_no)
);

create table approval_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  flow_id         uuid not null references approval_flows(id),
  request_type    text not null,
  entity_type     text not null,                 -- 'leave_requests'
  entity_id       uuid not null,                 -- FK target row
  requester_id    uuid not null references employees(id),
  amount          numeric(18,2),
  current_step_no int not null default 1,
  status          approval_status not null default 'PENDING',
  idempotency_key uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  decided_at      timestamptz
);

create unique index uq_approval_idem
  on approval_requests(idempotency_key) where idempotency_key is not null;
create index idx_approval_status on approval_requests(status);
create index idx_approval_entity on approval_requests(entity_type, entity_id);

-- Per-step assignee snapshot: who is authorized to act on the current step.
-- Resolving the approver at request-creation time and storing it here means the
-- approve RPC re-checks against a server-computed assignee, never an LLM-supplied id.
create table approval_step_assignees (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references approval_requests(id) on delete cascade,
  step_no         int not null,
  approver_id     uuid not null references employees(id),
  status          approval_status not null default 'PENDING',
  unique (request_id, step_no, approver_id)
);
create index idx_step_assignee_approver
  on approval_step_assignees(approver_id) where status = 'PENDING';

create table approval_actions (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references approval_requests(id) on delete cascade,
  step_no       int not null,
  actor_id      uuid not null references employees(id),
  action        approval_action_type not null,
  comment       text,
  created_at    timestamptz not null default now()
);
create index idx_approval_actions_req on approval_actions(request_id);
