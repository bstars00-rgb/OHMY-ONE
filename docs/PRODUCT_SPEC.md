# OHMY ONE — Product Spec

## Problem

Traditional ERPs bury company functions under menus. Employees spend time
learning navigation instead of doing work, and simple questions ("how much leave
do I have?") require clicks across screens. **OHMY ONE** replaces the menu with a
conversation: *No Menu. Just Ask.*

## Principle

Claude is the interface, not the system of record. The **database is the source
of truth**. Claude must never invent financial numbers, leave balances, salaries,
approval states, employee records, or transaction values — all critical values
come from deterministic backend logic.

## Scope (prototype)

Three modules that prove the model end-to-end:

1. **HR** — leave balance, leave request, request status, team/company leave.
2. **Finance** — revenue, expenses, P&L, period comparison, AR/AP, budget
   variance, cross-functional HR×Finance.
3. **Approval** — reusable engine: pending list, approve, reject, history.

## Personas & permissions

| Persona | Can | Cannot |
|---|---|---|
| **Employee** | read own profile/leave, create own leave, read own requests | read others' confidential data, read company finance |
| **Team Leader** | employee + read team leave, approve team requests | approve other teams' requests |
| **HR** | employee & leave management, company HR reports, compensation | (finance beyond policy) |
| **Finance** | revenue, expenses, P&L, AR/AP | approve HR requests |
| **Executive (CEO/CTO/CSO)** | permitted executive & finance reports | — |
| **Admin** | system configuration only | confidential HR/finance data (not granted) |

## Core user scenarios (Korean, must work)

1. `내 연차 얼마나 남았어?` → real balance from DB.
2. `내일 연차 쓸게.` → validate → create request → create approval → audit.
3. `내 연차 신청 어떻게 됐어?` → actual workflow status.
4. `이번달 우리팀 연차 현황 보여줘.` (leader) → permitted team data only.
5. `내가 승인할 것 알려줘.` (manager) → pending approvals.
6. `Lucy 연차 승인해줘.` → authorization validated server-side, then approve.
7. `이번달 매출 알려줘.` (finance) → deterministic ledger figure.
8. `이번달 P&L 만들어줘.` → finance function; no LLM-generated accounting.
9. `지난달보다 이익이 왜 줄었어?` → current + previous P&L + variance, then Claude interprets.
10. `CEO 급여 알려줘.` (employee) → **DENY** + `PERMISSION_DENIED` audit.

## Cross-functional (Phase 12)

`인건비가 증가했는데 매출 성장이 따라오지 못한 조직을 찾아줘.` →
`get_labor_vs_revenue_by_department()` returns a deterministic per-department
dataset with a `flagged` column; Claude interprets which orgs are affected. The
seed is constructed so the **Content** department is flagged (payroll rose, revenue flat).

## What was built vs. deferred

**Built**: full schema, RBAC+scope, RLS (incl. column-level salary), audit,
approval engine, HR + finance deterministic RPCs, reconciling seed, MCP server
with risk tiers/idempotency/audit, SQL + MCP tests, docs, admin console skeleton.

**Deferred to Phase 2**: public-holiday leave calendar, multi-entity FX
consolidation, delegation/out-of-office approver routing, notification delivery,
full admin-console CRUD, production auth wiring, executed end-to-end test run in
CI (see QA_REPORT).
