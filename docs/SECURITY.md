# OHMY ONE — Security

## Authentication

- The acting employee is derived from the authenticated session, never from tool
  arguments. In the prototype `OHMY_ACTOR` (employee_no/email/uuid) configures
  which employee an MCP instance serves; in production this is the verified
  subject of a Supabase/OIDC access token. Either way the id is bound
  **server-side** via a transaction-local GUC that `app.current_employee_id()`
  reads (ADR-003).
- The service-role key is server-only. It is never sent to a browser or an LLM,
  and the MCP server uses it **only** to invoke vetted RPCs — never raw SQL.

## Authorization — RBAC + scope

- **Roles**: EMPLOYEE, TEAM_LEADER, MANAGER, DIRECTOR, HR, FINANCE, CTO, CSO,
  CEO, ADMIN.
- **Scopes**: SELF, TEAM, DEPARTMENT, ENTITY, REGION, COMPANY, GLOBAL.
- **Permissions** are explicit codes (`HR_LEAVE_READ_TEAM`, `FINANCE_PNL_READ`,
  `APPROVAL_APPROVE`, …) mapped to roles in `role_permissions`.
- The engine lives in the `app` schema: `has_permission(code)`,
  `employee_relation(target)` (SELF/TEAM/DEPARTMENT/ORG/NONE),
  `can_read_employee_hr(target)`, `has_any_finance_read()`.
- Every business RPC checks permission at its top and writes a
  `PERMISSION_DENIED` audit row before raising `42501` on failure.
- **ADMIN is not a super-user**: it holds only `ADMIN_*` permissions and is
  deliberately granted **no** confidential HR/finance read permissions.

## Row-Level Security (last line of defense)

- RLS is `ENABLE`d **and** `FORCE`d on every business table.
- All writes go through `SECURITY DEFINER` RPCs owned by a `BYPASSRLS` role; the
  `authenticated` role gets only SELECT policies, so a direct
  PostgREST/psql connection with a user JWT cannot over-read or write.
- Policies key on `app.current_employee_id()`, ownership, role permissions, and
  scope. A table with RLS on but no SELECT policy exposes zero rows.
- **Column-level**: `employees.base_salary` is revoked from `authenticated`
  entirely; salary is reachable only via the permissioned
  `get_employee_compensation()` RPC (HR only, always audited).
- Verified by `supabase/tests/02_rls_tests.sql` (direct-access attempts as the
  `authenticated` role with a JWT subject claim).

## Audit

- `audit_logs` is **append-only**: `BEFORE UPDATE/DELETE` triggers hard-block any
  mutation (even for the owner). There is no UPDATE/DELETE policy.
- Written by the single `app.write_audit()` function, which stamps the acting
  employee itself — callers cannot forge the actor.
- Captured fields: request_id, employee_id, action, tool_name, entity_type/id,
  old/new value (jsonb), session_ref, success, failure_reason, timestamp.
- Events include `LEAVE_REQUEST_CREATED/APPROVED/REJECTED/CANCELLED`,
  `FINANCE_REPORT_VIEWED`, `COMPENSATION_VIEWED`, `PERMISSION_DENIED`,
  `CRITICAL_TOOL_BLOCKED`.

## MCP protection

- **Business actions only** — no `execute_sql`/`update_table`/`delete_record`
  tool exists (asserted by a unit test).
- RPC names are compile-time constants from the tool registry; arguments are
  bound parameters — no SQL injection surface.
- **Risk tiers** enforced at the gateway:
  | Tier | Behavior |
  |---|---|
  | READ | may run automatically |
  | LOW_RISK_WRITE | reversible create/cancel; runs on explicit user intent |
  | APPROVAL | authorization enforced server-side by the RPC |
  | CRITICAL | **refused** by the gateway in the prototype; audited |
- Examples of CRITICAL (blocked): salary change, payment execution, bank-account
  change, journal close, permission change, employee delete.
- Idempotency keys on write tools prevent duplicate execution on retry.
- Structured stderr logging (request_id, tool, duration, status, sqlstate);
  **never logs secrets or PII values**.

## Financial protection

- All monetary columns are `NUMERIC` (ADR-004) — no float rounding.
- P&L/revenue/expense figures are computed from POSTED double-entry journal
  lines in SQL; the LLM cannot alter a line.
- Journal entries are balance-checked (`app.assert_entry_balanced`).

## Secrets

- `.env` is git-ignored; `.env.example` documents required variables.
- No secret is ever placed in a URL, log line, or LLM-visible payload.

## Threats explicitly addressed (self-critique)

| Risk | Mitigation |
|---|---|
| LLM invents a company number | all values from deterministic SQL (ADR-001) |
| LLM spoofs identity / approver | identity + approver resolved server-side (ADR-003) |
| Confidential employee data exposure | RLS + column-level salary + audited RPC |
| Privilege escalation | no RBAC-mutation tool exposed; RLS blocks direct writes |
| Over-powerful MCP tool | fixed business allow-list; CRITICAL tier refused |
| LLM hallucinates a parameter | zod validation + server-side re-authorization |
| Duplicate execution on retry | idempotency keys + unique indexes (ADR-006) |
| Partial state on mid-transaction failure | single-transaction RPCs |
| SQL injection | parameterized RPC calls; no dynamic SQL from input |

## Known limitations (prototype)

See [QA_REPORT.md](QA_REPORT.md) § "Not yet verified" — this prototype has **not**
undergone a production security review and must not be treated as production
ready.
