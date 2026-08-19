# OHMY ONE — Architecture

> **No Menu. Just Ask.** An AI-native enterprise operating system where employees
> run company functions through conversation, not menus. The **database is the
> single source of truth**; Claude interprets, it never invents.

## Request path (production design)

```
USER (natural language)
  ↓
CLAUDE                         interprets intent, chooses a business tool
  ↓
OHMY ONE MCP (mcp-server/)     named business actions only — NO raw SQL
  ↓
AUTHENTICATION                 acting employee bound from the session, never from the LLM
  ↓
PERMISSION ENGINE (app schema) has_permission / employee_relation / scope checks
  ↓
BUSINESS LOGIC (SQL functions) deterministic calculations, in one transaction
  ↓
SUPABASE / POSTGRESQL          tables + Row-Level Security (last line of defense)
  ↓
AUDIT LOG                      immutable record of every sensitive action
```

Two MCP surfaces are kept physically separate (ADR-002):

| | Development | Production |
|---|---|---|
| Client | Claude Code | Claude (end user) |
| MCP | Supabase/Postgres dev MCP | **OHMY ONE MCP** (`mcp-server/`) |
| Capability | broad SQL on **dev** DB | fixed allow-list of business actions |
| Target | development database | production database |

The production MCP exposes actions like `ohmy_hr_get_leave_balance`,
`ohmy_approval_approve`, `ohmy_finance_generate_pnl` — and **contains no**
`execute_sql` / `update_table` / `delete_record` tool. That capability does not
exist in the tool surface, so no prompt can invoke it.

## Components

- **`supabase/migrations/`** — 12 ordered SQL migrations: schema, RBAC, audit,
  approval engine, HR, finance, deterministic RPCs, and RLS.
- **`supabase/seed.sql`** — synthetic OHMY HOTEL data (30 employees, 8 depts,
  12 months of a reconciling ledger).
- **`mcp-server/`** — TypeScript MCP server (stdio). Resolves the session actor,
  binds it per transaction, calls only allow-listed RPCs, enforces risk tiers,
  and injects idempotency keys.
- **`admin-console/`** — minimal Next.js console (secondary UI). Primary UI is
  the conversation.
- **`supabase/tests/`** — SQL business/permission/RLS/reconciliation tests.

## Key invariants

1. **Determinism** — every number (balance, salary, revenue, P&L, approval
   state) is produced by a SQL function. The LLM never computes them (ADR-001).
2. **Server-side identity** — the acting employee is
   `app.current_employee_id()`, resolved from the authenticated session. An id
   supplied by the LLM is only ever an *untrusted lookup key*, re-authorized
   server-side (ADR-003).
3. **Defense in depth** — the permission engine gates each RPC *and* RLS
   independently re-checks ownership/scope, so bypassing the tool layer with a
   direct DB connection still fails (ADR-005).
4. **Atomicity + idempotency** — multi-step writes (leave + approval + audit)
   run in one transaction; write RPCs take idempotency keys so retries never
   duplicate (ADR-006).
5. **Money is NUMERIC** — never floating point (ADR-004).

See [DECISIONS.md](DECISIONS.md) for the full rationale of each choice.
