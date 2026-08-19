# OHMY ONE

**No Menu. Just Ask.** — an AI-native enterprise operating system where
employees run HR, Finance, and Approval functions by talking to Claude instead
of navigating menus. The **database is the source of truth**; Claude interprets
results but never invents numbers.

> Status: **working enterprise prototype**, not a production deployment. See
> [docs/QA_REPORT.md](docs/QA_REPORT.md). Do not treat as "production ready"
> until it passes a real production security review.

## 🔗 Live demo (no database required)

**https://bstars00-rgb.github.io/OHMY-ONE/** — a self-contained, browser-only
demo in [`web/`](web/) that reproduces the backend behavior (permission engine,
deterministic calculations, append-only audit) with no server. Switch personas,
ask in natural language, watch requests flow through the pipeline, see denials
audited. Auto-deployed by [GitHub Actions](.github/workflows/deploy.yml) on every
push to `main`. It is a **simulation for presentations** — the figures are
representative sample data.

## 1. Overview

Claude → **OHMY ONE MCP** (named business actions, no raw SQL) → authentication →
permission engine → deterministic SQL business logic → PostgreSQL (with
Row-Level Security) → immutable audit log. Three modules: **HR** (leave),
**Finance** (P&L/revenue/expenses), **Approval** (reusable engine).

## 2. Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Highlights: two physically
separate MCP surfaces (dev vs. business), server-side identity, defense-in-depth
(permission engine **and** RLS), transactional + idempotent writes, `NUMERIC`
money.

```
mcp-server/         Production Business MCP (TypeScript, stdio)
supabase/
  migrations/       0001..0012 — schema, RBAC, audit, approval, HR, finance, RPCs, RLS
  seed.sql          synthetic OHMY HOTEL data (reconciling)
  tests/            business + RLS SQL test suites
  local/            auth shim for plain Postgres
admin-console/      minimal Next.js console (secondary UI)
docs/               ARCHITECTURE, DATABASE, MCP_TOOLS, SECURITY, PRODUCT_SPEC, QA_REPORT, DEMO, DECISIONS
```

## 3. Prerequisites

- Node.js 20+
- PostgreSQL 15+ — easiest via [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase start`), or any Postgres.

## 4. Environment variables

Copy `.env.example` → `.env` and fill in. Never commit `.env`.
Key vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server-only), `OHMY_ACTOR` (which employee an MCP
instance serves in the prototype).

## 5. Supabase setup

```bash
supabase start
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```
On **plain Postgres** (no Supabase), first run the shim:
```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/local/00_auth_shim.sql
```

## 6. Migrations

```bash
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

## 7. Seed data

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```
Creates 4 orgs, 8 departments, ~9 teams, 30 employees, roles/permissions, leave
balances + requests, an approval flow, and 12 months of a **reconciling**
double-entry ledger.

## 8. Local development

```bash
cd mcp-server
npm install
npm run build          # or: npm run dev  (tsx, no build step)
npm run list-tools     # print the tool catalog (proves 0 raw-SQL tools)
```

## 9. Test commands

```bash
# SQL suites (need DATABASE_URL + seeded DB)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_business_tests.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/02_rls_tests.sql

# MCP-layer unit tests (no DB)
cd mcp-server && npm run build && node --test
```

## 10. MCP configuration (Claude Desktop)

`claude_desktop_config.json`:
```json
{ "mcpServers": { "ohmy-one": {
  "command": "node",
  "args": ["/abs/path/to/mcp-server/dist/index.js"],
  "env": {
    "DATABASE_URL": "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "OHMY_ACTOR": "E005"
  }
}}}
```
Change `OHMY_ACTOR` to switch persona (E005 employee, E004 team leader, E024
finance, E001 CEO).

## 11. Demo scenarios

Full script in [docs/DEMO.md](docs/DEMO.md). The ten Korean scenarios (leave
balance, leave request, approval, P&L, permission denial, cross-functional
analysis) all map to specific tools.

## 12. Security warnings

- The service-role key bypasses RLS — keep it server-side; never expose it to a
  browser or the LLM.
- This prototype has **not** had a production security review. RLS and business
  tests are written but must be **executed** on a live DB before trust (see
  QA_REPORT § "Not yet verified").
- CRITICAL actions (salary change, payments, permission changes) are
  intentionally blocked in the MCP; do not wire them to auto-execution.
- See [docs/SECURITY.md](docs/SECURITY.md).

## License / data

All company data in `seed.sql` is fictional. Do not load real confidential
employee or financial data into the prototype.
