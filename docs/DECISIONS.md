# Architecture Decision Record — OHMY ONE

Format: each decision has Context / Decision / Consequences. Newest first.

---

## ADR-000 — Scope and honesty of this prototype

**Context.** The master build prompt targets a fully production-tested enterprise
OS scoring ≥96 on three rubrics. That is a multi-week, multi-engineer effort. A
single build session cannot honestly produce that with a live Supabase project,
executed tests, and a passed production security review.

**Decision.** Build the *architectural core* end-to-end and correctly — schema,
RLS, deterministic business logic, MCP tool layer, seed data, tests, docs — as a
**working enterprise prototype**, not a production deployment. Scores in
`QA_REPORT.md` are self-assessments with written justification and an explicit
list of what has NOT yet been executed against a live database. No score is
recorded as "passed" without evidence.

**Consequences.** The repo is runnable against a local or hosted Supabase, but the
operator must run migrations, seed, and tests to validate. "Production Ready" is
never claimed. See QA_REPORT.md § "Not yet verified".

---

## ADR-001 — Database is the single source of truth; Claude never computes

**Context.** The core product principle is that Claude must never invent leave
balances, salaries, approval states, or financial figures.

**Decision.** Every business value is produced by a deterministic PostgreSQL
function (`SECURITY DEFINER`, `search_path` pinned). MCP tools call these RPCs and
return their structured output verbatim. Claude may *interpret* results (e.g.
"profit fell because opex rose") but the numbers always originate in SQL.

**Consequences.** No arithmetic lives in the MCP/TypeScript layer or the prompt.
Financial reconciliation is testable at the DB level independent of the AI.

---

## ADR-002 — Two physically separate MCP surfaces

**Context.** Developers need broad DB access; employees must never get raw SQL.

**Decision.**
- *Development MCP*: the Supabase/Postgres MCP used by Claude Code against the
  **dev** database only. Not shipped to users.
- *Production Business MCP* (`mcp-server/`): exposes named business actions
  (`ohmy_hr_get_leave_balance`, …). It has **no** `execute_sql`, `update_table`,
  or `delete_record` tool. Its allow-list of RPCs is fixed in code.

**Consequences.** Even a fully compromised MCP prompt cannot run arbitrary SQL —
the tool surface does not contain that capability.

---

## ADR-003 — Identity is resolved server-side, never from the LLM

**Context.** An LLM could be induced to pass `approver_id = <someone else>` or
`employee_id = <victim>`.

**Decision.** The acting employee is derived from the authenticated session
(`auth.uid()` → `employees.user_id`) inside SQL via `app.current_employee_id()`.
Write/approval RPCs ignore any actor id an LLM supplies for *authority* purposes.
An LLM-supplied target id (e.g. "approve Lucy's request") is treated as an
untrusted *lookup key* that is then re-authorized server-side.

**Consequences.** Prompt injection cannot escalate identity. Tested by the
negative test suite (approver-spoofing, cross-department approval).

---

## ADR-004 — Money is NUMERIC, never floating point

**Context.** Float rounding corrupts financial statements.

**Decision.** All monetary columns are `NUMERIC(18,2)` (rates `NUMERIC(18,6)`).
Percentages `NUMERIC(9,4)`. No `float`/`double precision` anywhere in finance.

**Consequences.** P&L totals reconcile exactly; enforced by a reconciliation test.

---

## ADR-005 — RLS is the last line of defense, always on

**Context.** Frontend/tool checks are not a security boundary.

**Decision.** Every business table has RLS enabled with `FORCE`. The permission
engine (functions in `app` schema) is the *primary* gate; RLS re-checks the same
ownership/scope so a direct DB connection with a user JWT still cannot over-read.
The service-role key is used only to invoke vetted `SECURITY DEFINER` RPCs.

**Consequences.** Bypassing the tool layer does not bypass authorization.

---

## ADR-006 — Idempotent writes via client keys

**Context.** An LLM may retry a tool call; "book tomorrow off" must not create two
leave requests.

**Decision.** Write RPCs accept an `idempotency_key` (uuid). A unique index makes a
repeat call return the existing record instead of inserting a duplicate. Multi-step
writes (leave + approval + audit) run in a single function body = one transaction.

**Consequences.** Retries are safe; partial state is impossible.
