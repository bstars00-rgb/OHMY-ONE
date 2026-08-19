# OHMY ONE — Demo Procedure

## 0. Prerequisites

- Docker + [Supabase CLI](https://supabase.com/docs/guides/cli), or any
  PostgreSQL 15+.
- Node.js 20+.

## 1. Bring up the database

```bash
supabase start
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
# apply migrations in order, then seed
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

> Not using Supabase CLI? Point `DATABASE_URL` at any Postgres and run the same
> loop. The migrations create a stub `auth.uid()` only if your DB lacks it — on
> plain Postgres, first run `supabase/local/00_auth_shim.sql` (see README).

## 2. Run the tests (evidence)

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_business_tests.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/02_rls_tests.sql
```
Both scripts print `PASS: …` per assertion and a final banner; any failure aborts
with `FAIL: …`.

## 3. Start the MCP server

```bash
cd mcp-server
npm install && npm run build
# choose which employee this session serves (see personas below)
OHMY_ACTOR=E005 DATABASE_URL="$DATABASE_URL" npm start   # E005 = Lucy Park (employee)
```
Register it with Claude (Claude Desktop `claude_desktop_config.json`):
```json
{ "mcpServers": { "ohmy-one": {
  "command": "node", "args": ["/abs/path/mcp-server/dist/index.js"],
  "env": { "DATABASE_URL": "postgresql://…", "OHMY_ACTOR": "E005" } } } }
```

## Demo personas (from the seed)

| Employee | Role | Use for |
|---|---|---|
| `E005` Lucy Park | Employee | scenarios 1–3, 10 (denials) |
| `E004` David Kim | Team Leader of Lucy's team | scenarios 4–6 (approvals) |
| `E024` Fiona Lee | Finance | scenarios 7–8 |
| `E001` Grace Choi | CEO | scenario 9, cross-functional |

## Demo script

**Employee (OHMY_ACTOR=E005)**
1. `내 연차 얼마나 남았어?` → `ohmy_hr_get_leave_balance` → real remaining days.
2. `내일 연차 쓸게.` → `ohmy_hr_create_leave_request` → PENDING request + approval + audit.
3. `내 연차 신청 어떻게 됐어?` → `ohmy_hr_get_leave_status` → PENDING.
4. `회사 전체 P&L 보여줘.` → `ohmy_finance_generate_pnl` → **Permission denied** (audited).

**Team Leader (OHMY_ACTOR=E004)**
5. `내가 승인해야 할 것 보여줘.` → `ohmy_approval_get_pending` → Lucy's request visible.
6. `Lucy 연차 승인해줘.` → `ohmy_hr_find_employee` → `ohmy_approval_get_pending` →
   `ohmy_approval_approve` → authorization validated server-side → APPROVED + audit.

**Finance (OHMY_ACTOR=E024)**
7. `이번달 매출 알려줘.` → `ohmy_finance_get_revenue`.
8. `이번달 P&L 만들어줘.` → `ohmy_finance_generate_pnl` → full income statement from ledger.

**Executive (OHMY_ACTOR=E001)**
9. `지난달보다 이익이 왜 줄었어?` → `ohmy_finance_compare_periods` → Claude interprets variance.
10. `인건비가 증가했는데 매출 성장이 따라오지 못한 조직을 찾아줘.` →
    `ohmy_finance_labor_vs_revenue` → Content flagged; Claude explains.

## What to look for

- Numbers in Claude's answers match `psql` queries — nothing invented.
- Denials produce a `PERMISSION_DENIED` row: `select * from audit_logs where action='PERMISSION_DENIED';`
- Approving twice is a no-op; requesting the same leave twice returns
  `duplicate_ignored`.
