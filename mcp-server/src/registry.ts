import { z } from "zod";

/**
 * Risk tiers (see docs/SECURITY.md §Tool Security):
 *   READ            – no state change; may run automatically.
 *   LOW_RISK_WRITE  – creates/cancels a reversible record; runs on explicit user intent.
 *   APPROVAL        – an approval decision; authorization is enforced server-side by the RPC.
 *   CRITICAL        – irreversible / high-impact; the gateway REFUSES to run it in the
 *                     prototype and tells the user to use the admin console with a human.
 */
export type Risk = "READ" | "LOW_RISK_WRITE" | "APPROVAL" | "CRITICAL";

export interface ToolDef {
  name: string;
  risk: Risk;
  /** The database RPC this tool maps to (constant, allow-listed). */
  rpc: string;
  description: string;
  /** zod schema for the tool arguments (also rendered to JSON Schema for MCP). */
  schema: z.ZodObject<any>;
  /** Map validated args -> ordered RPC parameter array. */
  toParams: (a: any) => unknown[];
  /** Permission the underlying RPC requires (documentation + list_tools output). */
  permission?: string;
}

const nullableStr = () => z.string().trim().min(1).optional();

export const TOOLS: ToolDef[] = [
  // ---------------- Identity ----------------
  {
    name: "ohmy_whoami",
    risk: "READ",
    rpc: "get_my_context",
    permission: "(none — self)",
    description:
      "Return the acting employee's identity, roles, and effective permission codes. " +
      "USE FIRST in a session to learn what the user is allowed to do before offering actions. " +
      "DO NOT infer permissions any other way. No side effects. Output: {authenticated, employee, roles[], permissions[]}.",
    schema: z.object({}),
    toParams: () => [],
  },

  // ---------------- HR: reads ----------------
  {
    name: "ohmy_hr_get_leave_balance",
    risk: "READ",
    rpc: "get_leave_balance",
    permission: "HR_LEAVE_READ_SELF (self) / HR_LEAVE_READ_TEAM|ALL (others)",
    description:
      "Get remaining/used/pending leave days by leave type for an employee and year. " +
      "USE for questions like '내 연차 얼마나 남았어?' (my leave balance). " +
      "Omit employee_id for the current user. Supplying another employee_id is a request to read THAT person's " +
      "balance and is re-authorized in the database (self/team-lead/HR only); unauthorized reads are denied and audited. " +
      "DO NOT guess or state a number that did not come from this tool. Read-only.",
    schema: z.object({
      employee_id: z.string().uuid().optional(),
      year: z.number().int().optional(),
    }),
    toParams: (a) => [a.employee_id ?? null, a.year ?? null],
  },
  {
    name: "ohmy_hr_get_leave_status",
    risk: "READ",
    rpc: "get_leave_request_status",
    permission: "self",
    description:
      "List the current user's leave requests with their workflow status (PENDING/APPROVED/REJECTED/CANCELLED). " +
      "USE for '내 연차 신청 어떻게 됐어?'. Optionally pass a request_id to filter. Read-only.",
    schema: z.object({ request_id: z.string().uuid().optional() }),
    toParams: (a) => [a.request_id ?? null],
  },
  {
    name: "ohmy_hr_get_team_leave_report",
    risk: "READ",
    rpc: "get_team_leave_report",
    permission: "HR_LEAVE_READ_TEAM or HR_LEAVE_READ_ALL",
    description:
      "Leave records for the teams the current user LEADS, for a month (YYYY-MM, default current). " +
      "USE for a team leader asking '이번달 우리팀 연차 현황'. Returns only permitted teams; " +
      "a user with no team-read permission is denied and the denial is audited. Read-only.",
    schema: z.object({ period: nullableStr() }),
    toParams: (a) => [a.period ?? null],
  },
  {
    name: "ohmy_hr_get_company_leave_report",
    risk: "READ",
    rpc: "get_company_leave_report",
    permission: "HR_LEAVE_READ_ALL",
    description:
      "Company-wide leave summary aggregated by department and leave type for a month. " +
      "HR only. Non-HR callers are denied + audited. Read-only.",
    schema: z.object({ period: nullableStr() }),
    toParams: (a) => [a.period ?? null],
  },
  {
    name: "ohmy_hr_get_employee_profile",
    risk: "READ",
    rpc: "get_employee_profile",
    permission: "self / HR / manager of the person",
    description:
      "Non-confidential profile (name, title, team, department, org, hire date). " +
      "Omit employee_id for self. Does NOT include salary — use ohmy_hr_get_compensation for that. Read-only.",
    schema: z.object({ employee_id: z.string().uuid().optional() }),
    toParams: (a) => [a.employee_id ?? null],
  },
  {
    name: "ohmy_hr_find_employee",
    risk: "READ",
    rpc: "find_employee",
    permission: "same-organization directory",
    description:
      "Resolve an employee id from a partial name or employee number, within the user's organization. " +
      "USE to turn 'Lucy' into an id before another tool. This is a LOOKUP only and confers NO authority: " +
      "the resulting id must still be authorized by whatever tool consumes it. Ambiguous names return several candidates. Read-only.",
    schema: z.object({ query: z.string().trim().min(1) }),
    toParams: (a) => [a.query],
  },
  {
    name: "ohmy_hr_get_compensation",
    risk: "READ",
    rpc: "get_employee_compensation",
    permission: "HR_EMPLOYEE_READ_ALL",
    description:
      "SENSITIVE. Return an employee's base salary. Requires the HR org-wide people permission; " +
      "every access — allowed OR denied — is audited. USE only when an HR user explicitly asks for compensation. " +
      "If the current user is not HR (e.g. an employee asking for the CEO's salary) the database DENIES this and records " +
      "a PERMISSION_DENIED audit row; report the denial plainly and never fabricate a figure. Read-only but high-sensitivity.",
    schema: z.object({ employee_id: z.string().uuid() }),
    toParams: (a) => [a.employee_id],
  },

  // ---------------- HR: writes ----------------
  {
    name: "ohmy_hr_create_leave_request",
    risk: "LOW_RISK_WRITE",
    rpc: "create_leave_request",
    permission: "HR_LEAVE_CREATE_SELF",
    description:
      "Create a leave request FOR THE CURRENT USER. USE for '내일 연차 쓸게' / '연차 신청'. " +
      "The database validates dates, computes working days, checks the balance, detects overlaps, determines the " +
      "approval flow, creates the request + approval + audit atomically, and reserves the days. " +
      "leave_type_code is typically 'ANNUAL' (also 'SICK','UNPAID'). Dates are ISO 'YYYY-MM-DD' and cannot be in the past. " +
      "Idempotent: an idempotency_key is always sent so a retry never creates a duplicate. " +
      "DO NOT use this to request leave for someone else. Side effect: creates a PENDING request and an approval task.",
    schema: z.object({
      leave_type_code: z.string().trim().min(1).default("ANNUAL"),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: nullableStr(),
      idempotency_key: z.string().uuid().optional(),
    }),
    toParams: (a) => [a.leave_type_code, a.start_date, a.end_date, a.reason ?? null, a.idempotency_key],
  },
  {
    name: "ohmy_hr_cancel_leave_request",
    risk: "LOW_RISK_WRITE",
    rpc: "cancel_leave_request",
    permission: "owner only",
    description:
      "Cancel the current user's own PENDING leave request and release the reserved days. " +
      "Only the requester may cancel; only PENDING requests are cancellable. Side effect: status -> CANCELLED.",
    schema: z.object({ request_id: z.string().uuid() }),
    toParams: (a) => [a.request_id],
  },

  // ---------------- Approval ----------------
  {
    name: "ohmy_approval_get_pending",
    risk: "READ",
    rpc: "get_my_pending_approvals",
    permission: "APPROVAL_APPROVE / APPROVAL_READ",
    description:
      "List approval requests currently awaiting the CURRENT user's decision (they are the assignee of the current step). " +
      "USE for a manager asking '내가 승인해야 할 것 보여줘'. Read-only. Returns approval_request_id values to pass to approve/reject.",
    schema: z.object({}),
    toParams: () => [],
  },
  {
    name: "ohmy_approval_approve",
    risk: "APPROVAL",
    rpc: "approve_request",
    permission: "APPROVAL_APPROVE + be the current-step assignee",
    description:
      "Approve one approval request by approval_request_id. USE for 'Lucy 연차 승인해줘' AFTER resolving the request via " +
      "ohmy_approval_get_pending. CRITICAL SAFETY: the approver is the authenticated user, resolved server-side; the database " +
      "verifies they are the authorized assignee of the request's CURRENT step and REJECTS the call otherwise (denial audited). " +
      "You cannot approve on behalf of another approver. Advances the workflow or finalizes it (which applies the domain effect, " +
      "e.g. marks leave APPROVED and moves reserved days to used). Idempotent: approving an already-decided request is a no-op. Side effect: records a decision.",
    schema: z.object({ approval_request_id: z.string().uuid(), comment: nullableStr() }),
    toParams: (a) => [a.approval_request_id, a.comment ?? null],
  },
  {
    name: "ohmy_approval_reject",
    risk: "APPROVAL",
    rpc: "reject_request",
    permission: "APPROVAL_REJECT + be the current-step assignee",
    description:
      "Reject one approval request by approval_request_id. Same server-side approver authorization as approve. " +
      "Finalizes the request as REJECTED and releases any reserved resources (e.g. pending leave days). Side effect: records a decision.",
    schema: z.object({ approval_request_id: z.string().uuid(), comment: nullableStr() }),
    toParams: (a) => [a.approval_request_id, a.comment ?? null],
  },

  // ---------------- Finance ----------------
  {
    name: "ohmy_finance_get_revenue",
    risk: "READ",
    rpc: "get_monthly_revenue",
    permission: "FINANCE_REVENUE_READ",
    description:
      "Monthly revenue for an org (default: the user's org), computed from POSTED journal lines. " +
      "USE for '이번달 매출 알려줘'. period is 'YYYY-MM' (default current month). Non-finance users are denied + audited. " +
      "The figure is authoritative from the ledger — never estimate it yourself. Read-only.",
    schema: z.object({ period: nullableStr(), org_code: nullableStr() }),
    toParams: (a) => [a.period ?? null, a.org_code ?? null],
  },
  {
    name: "ohmy_finance_get_expenses",
    risk: "READ",
    rpc: "get_monthly_expenses",
    permission: "FINANCE_EXPENSE_READ",
    description:
      "Monthly COGS / operating expense / other expense totals for an org, from the ledger. period 'YYYY-MM'. " +
      "Non-finance users denied + audited. Read-only.",
    schema: z.object({ period: nullableStr(), org_code: nullableStr() }),
    toParams: (a) => [a.period ?? null, a.org_code ?? null],
  },
  {
    name: "ohmy_finance_generate_pnl",
    risk: "READ",
    rpc: "generate_income_statement",
    permission: "FINANCE_PNL_READ",
    description:
      "Produce a full income statement for a period from the double-entry ledger: revenue, COGS, gross profit, " +
      "operating expenses, operating profit, other income/expense, net profit. USE for '이번달 P&L 만들어줘'. " +
      "ALL numbers are computed in the database — you may summarize and interpret them but MUST NOT calculate or alter any line. " +
      "Non-finance users denied + audited. Read-only.",
    schema: z.object({ period: nullableStr(), org_code: nullableStr() }),
    toParams: (a) => [a.period ?? null, a.org_code ?? null],
  },
  {
    name: "ohmy_finance_compare_periods",
    risk: "READ",
    rpc: "compare_financial_periods",
    permission: "FINANCE_PNL_READ",
    description:
      "Compare two periods' P&L and return per-line variance. USE to explain '지난달보다 이익이 왜 줄었어?': call this to get " +
      "deterministic current/previous/variance numbers, THEN interpret the drivers in prose. Both periods are 'YYYY-MM'. Read-only.",
    schema: z.object({
      period_current: z.string().regex(/^\d{4}-\d{2}$/),
      period_prev: z.string().regex(/^\d{4}-\d{2}$/),
      org_code: nullableStr(),
    }),
    toParams: (a) => [a.period_current, a.period_prev, a.org_code ?? null],
  },
  {
    name: "ohmy_finance_get_ar",
    risk: "READ",
    rpc: "get_accounts_receivable",
    permission: "FINANCE_REVENUE_READ",
    description:
      "List outstanding accounts receivable — unpaid or partially paid inbound (customer) invoices — with per-invoice " +
      "outstanding amounts, due dates, and the total owed to the company, for an org. Requires finance revenue read. Read-only.",
    schema: z.object({ org_code: nullableStr() }),
    toParams: (a) => [a.org_code ?? null],
  },
  {
    name: "ohmy_finance_get_ap",
    risk: "READ",
    rpc: "get_accounts_payable",
    permission: "FINANCE_EXPENSE_READ",
    description:
      "List outstanding accounts payable — unpaid or partially paid outbound (vendor) invoices — with per-invoice " +
      "outstanding amounts, due dates, and the total the company owes, for an org. Requires finance expense read. Read-only.",
    schema: z.object({ org_code: nullableStr() }),
    toParams: (a) => [a.org_code ?? null],
  },
  {
    name: "ohmy_finance_budget_variance",
    risk: "READ",
    rpc: "get_budget_variance",
    permission: "FINANCE_PNL_READ",
    description:
      "Budget vs. actual by department and account for a period ('YYYY-MM', default current). Actuals come from POSTED " +
      "ledger lines; variance is budget minus actual. USE to see where spend is over or under plan. Read-only.",
    schema: z.object({ period: nullableStr(), org_code: nullableStr() }),
    toParams: (a) => [a.period ?? null, a.org_code ?? null],
  },
  {
    name: "ohmy_finance_labor_vs_revenue",
    risk: "READ",
    rpc: "get_labor_vs_revenue_by_department",
    permission: "FINANCE_PNL_READ",
    description:
      "Cross-functional dataset (HR × Finance): per department, labor cost and revenue for two periods with deltas and a " +
      "'flagged' boolean where labor rose but revenue did not keep pace. USE for the executive query " +
      "'인건비가 증가했는데 매출 성장이 따라오지 못한 조직을 찾아줘'. The dataset is deterministic; interpret it in prose afterward. Read-only.",
    schema: z.object({
      period_current: z.string().regex(/^\d{4}-\d{2}$/),
      period_prev: z.string().regex(/^\d{4}-\d{2}$/),
      org_code: nullableStr(),
    }),
    toParams: (a) => [a.period_current, a.period_prev, a.org_code ?? null],
  },

  // ---------------- CRITICAL (blocked in prototype) ----------------
  {
    name: "ohmy_hr_change_salary",
    risk: "CRITICAL",
    rpc: "__blocked__",
    permission: "N/A in prototype",
    description:
      "Change an employee's base salary. CRITICAL and IRREVERSIBLE. This tool is intentionally BLOCKED in the prototype: " +
      "the gateway refuses to execute it and records an audit event. Salary changes must be performed by a human in the admin " +
      "console under dual control. Present here only to demonstrate the CRITICAL tier guard.",
    schema: z.object({
      employee_id: z.string().uuid(),
      new_salary: z.number(),
    }),
    toParams: (a) => [a.employee_id, a.new_salary],
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
