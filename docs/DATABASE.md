# OHMY ONE — Database

PostgreSQL, normalized, RLS-guarded. Every business record carries (where
relevant) `id, organization_id, created_at, created_by, updated_at, updated_by,
status`, plus `deleted_at` for soft deletion. Money is `NUMERIC(18,2)` (rates
`NUMERIC(18,6)`); no floating point in finance.

## Schemas

- **`public`** — all business tables + the deterministic RPCs (callable surface).
- **`app`** — permission engine + internal helpers. Not client-reachable.
- **`auth`** — Supabase-provided (stubbed in the local test harness).

## Tables by domain

**Core / org**: `organizations`, `departments`, `teams`, `employees`,
`user_profiles`.

**RBAC**: `roles`, `permissions`, `role_permissions`, `user_roles`
(role + `scope` + optional `scope_ref`).

**Approval engine**: `approval_flows`, `approval_steps`, `approval_requests`,
`approval_step_assignees` (server-computed authorized approver per step),
`approval_actions` (trail).

**HR**: `leave_types`, `leave_policies`, `leave_balances`
(entitled+carried−used−pending), `leave_requests`, `attendance_records`,
`business_trips`.

**Finance**: `chart_of_accounts`, `cost_centers`, `journal_entries`,
`journal_lines` (double-entry), `customers`, `vendors`, `invoices`,
`invoice_lines`, `payments`, `expenses`, `budgets`,
`monthly_financial_snapshots`.

**Platform**: `audit_logs` (append-only), `notifications`, `attachments`.

## Migrations (ordered)

| File | Contents |
|---|---|
| `0001_extensions_and_enums.sql` | extensions, `app` schema, enums |
| `0002_core.sql` | orgs, departments, teams, employees, profiles |
| `0003_rbac.sql` | roles/permissions + permission-engine functions |
| `0004_audit.sql` | append-only audit + `write_audit()`, notifications, attachments |
| `0005_approval.sql` | approval flows/steps/requests/assignees/actions |
| `0006_hr.sql` | leave types/policies/balances/requests, attendance, trips |
| `0007_finance.sql` | COA, GL, AR/AP, expenses, budgets, snapshots |
| `0008_functions_hr.sql` | leave RPCs (balance, create, cancel, status, reports) |
| `0009_functions_approval.sql` | pending, approve, reject, history |
| `0010_functions_finance.sql` | revenue, expenses, P&L, compare, AR/AP, variance, cross-fn |
| `0011_rls.sql` | enable+force RLS, policies, grants, column-level salary |
| `0012_functions_context.sql` | `get_my_context`, compensation, `find_employee` |

## Key relationships

- `employees.organization_id/department_id/team_id/manager_id` place a person.
- `teams.leader_id`, `departments.manager_id` drive `employee_relation()` and
  approver resolution.
- `leave_requests.approval_request_id → approval_requests.id`;
  `approval_requests.entity_type/entity_id` points back to the domain row
  (e.g. `leave_requests`), so the engine is reusable for other request types.
- `journal_lines.department_id` enables per-department revenue (used by the
  cross-functional HR×Finance query).

## Integrity

- FKs, `CHECK` constraints (date ordering, non-negative amounts, one-sided
  journal lines), enums, and partial unique indexes (idempotency keys).
- `app.assert_entry_balanced()` guarantees debits = credits per journal entry.
- `monthly_financial_snapshots` is derived from the same POSTED ledger, and the
  reconciliation test asserts it equals `generate_income_statement()`.

## ER overview

```
organizations ─< departments ─< teams ─< employees ─< user_roles >─ roles >─ role_permissions >─ permissions
                                            │
                     leave_balances >───────┤
                     leave_requests >───────┴──> approval_requests ─< approval_step_assignees
                                                        └─< approval_actions
chart_of_accounts ─< journal_lines >─ journal_entries        expenses / invoices / budgets
                                   (department_id)            audit_logs (append-only)
```
