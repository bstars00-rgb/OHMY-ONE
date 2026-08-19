# OHMY ONE — MCP Tools

The Production Business MCP (`mcp-server/`) exposes **22 named business actions**
and **zero raw-SQL tools**. Each tool maps to one allow-listed database RPC.
Run `npm run build && npm run list-tools` to print this catalog from code.

Tool description format (returned to Claude): `[RISK] perm:<permission> — <text>`.

## Risk tiers

| Tier | Gateway behavior |
|---|---|
| `READ` | may run automatically |
| `LOW_RISK_WRITE` | reversible; runs on explicit user intent; idempotency key injected |
| `APPROVAL` | authorization enforced server-side by the RPC |
| `CRITICAL` | refused by the gateway (prototype); audited as `CRITICAL_TOOL_BLOCKED` |

## HR

| Tool | RPC | Risk | Permission |
|---|---|---|---|
| `ohmy_whoami` | `get_my_context` | READ | self |
| `ohmy_hr_get_leave_balance` | `get_leave_balance` | READ | self / team-lead / HR |
| `ohmy_hr_get_leave_status` | `get_leave_request_status` | READ | self |
| `ohmy_hr_get_team_leave_report` | `get_team_leave_report` | READ | `HR_LEAVE_READ_TEAM/ALL` |
| `ohmy_hr_get_company_leave_report` | `get_company_leave_report` | READ | `HR_LEAVE_READ_ALL` |
| `ohmy_hr_get_employee_profile` | `get_employee_profile` | READ | self / HR / manager |
| `ohmy_hr_find_employee` | `find_employee` | READ | same-org directory |
| `ohmy_hr_get_compensation` | `get_employee_compensation` | READ (sensitive) | `HR_EMPLOYEE_READ_ALL` |
| `ohmy_hr_create_leave_request` | `create_leave_request` | LOW_RISK_WRITE | `HR_LEAVE_CREATE_SELF` |
| `ohmy_hr_cancel_leave_request` | `cancel_leave_request` | LOW_RISK_WRITE | owner |

## Approval

| Tool | RPC | Risk | Permission |
|---|---|---|---|
| `ohmy_approval_get_pending` | `get_my_pending_approvals` | READ | `APPROVAL_APPROVE/READ` |
| `ohmy_approval_approve` | `approve_request` | APPROVAL | `APPROVAL_APPROVE` + step assignee |
| `ohmy_approval_reject` | `reject_request` | APPROVAL | `APPROVAL_REJECT` + step assignee |

## Finance

| Tool | RPC | Risk | Permission |
|---|---|---|---|
| `ohmy_finance_get_revenue` | `get_monthly_revenue` | READ | `FINANCE_REVENUE_READ` |
| `ohmy_finance_get_expenses` | `get_monthly_expenses` | READ | `FINANCE_EXPENSE_READ` |
| `ohmy_finance_generate_pnl` | `generate_income_statement` | READ | `FINANCE_PNL_READ` |
| `ohmy_finance_compare_periods` | `compare_financial_periods` | READ | `FINANCE_PNL_READ` |
| `ohmy_finance_get_ar` | `get_accounts_receivable` | READ | `FINANCE_REVENUE_READ` |
| `ohmy_finance_get_ap` | `get_accounts_payable` | READ | `FINANCE_EXPENSE_READ` |
| `ohmy_finance_budget_variance` | `get_budget_variance` | READ | `FINANCE_PNL_READ` |
| `ohmy_finance_labor_vs_revenue` | `get_labor_vs_revenue_by_department` | READ | `FINANCE_PNL_READ` |

## CRITICAL (blocked demonstrator)

| Tool | Risk | Behavior |
|---|---|---|
| `ohmy_hr_change_salary` | CRITICAL | gateway refuses + audits; must be done by a human in the console |

## Design rules honored

- Every tool description states: what it does, when to use it, when **not** to,
  parameters, required permission, expected output, and side effects.
- Output is the RPC's structured JSON, returned verbatim — Claude interprets but
  never recomputes values.
- Identity is server-side; an employee id in arguments is a lookup key that the
  RPC re-authorizes.
- Income statement output includes: Revenue, COGS, Gross Profit, Operating
  Expenses, Operating Profit, Other Income/Expense, Net Profit.
