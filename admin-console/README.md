# OHMY ONE — Admin Console (secondary UI)

Minimal Next.js (App Router + Tailwind) console. The **primary** interface is the
conversation ("Ask OHMY ONE"); this console is deliberately thin — system
configuration and read-only views only.

```bash
cd admin-console
npm install
npm run dev      # http://localhost:3000
```

Pages: `/` (Ask OHMY ONE), `/login`, `/admin`, `/admin/employees`,
`/admin/organization`, `/admin/permissions`, `/admin/approval-flows`,
`/admin/audit`, `/hr/leave`, `/finance/pnl`.

Status: **skeleton**. Live data wiring (Supabase Auth + rendering MCP/RPC output)
is a Phase-2 item; see `docs/PRODUCT_SPEC.md`. Never enter real credentials into
the mock login form.
