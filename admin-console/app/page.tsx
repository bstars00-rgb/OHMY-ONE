import Link from "next/link";

// Primary UI: "Ask OHMY ONE". The conversation is the product; the admin console
// is secondary. This page is a static mock of the entry experience — in the real
// system the input routes to Claude + the OHMY ONE MCP, never to raw SQL.

const EXAMPLES = [
  { text: "내 연차 얼마나 남았어?", tag: "HR · 잔여 연차" },
  { text: "내일 연차 쓸게.", tag: "HR · 연차 신청" },
  { text: "이번달 P&L 보여줘.", tag: "Finance · 손익" },
  { text: "내가 승인해야 할 것 보여줘.", tag: "Approval · 결재" },
];

const ADMIN_LINKS = [
  ["/admin/employees", "Employees"],
  ["/admin/organization", "Organization"],
  ["/admin/permissions", "Permissions"],
  ["/admin/approval-flows", "Approval Flows"],
  ["/admin/audit", "Audit Log"],
  ["/hr/leave", "HR · Leave"],
  ["/finance/pnl", "Finance · P&L"],
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="text-center">
        <p className="text-sm font-medium tracking-widest text-accent">OHMY ONE</p>
        <h1 className="mt-2 text-4xl font-semibold sm:text-5xl">No Menu. Just Ask.</h1>
        <p className="mt-3 text-slate-500 dark:text-slate-400">
          Run HR, Finance, and Approvals by asking. The database is the source of
          truth — answers come from your data, never invented.
        </p>
      </header>

      <section aria-label="Ask input" className="rounded-2xl border border-slate-200/60 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-surface">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-black/20">
          <span className="text-accent">◍</span>
          <input
            disabled
            placeholder="Ask OHMY ONE…  (예: 내 연차 얼마나 남았어?)"
            className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">↵</kbd>
        </div>
        <p className="px-4 py-2 text-xs text-slate-400">
          Mock input — in the live app this routes to Claude + the OHMY ONE MCP.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {EXAMPLES.map((e) => (
          <div key={e.text} className="rounded-xl border border-slate-200/60 p-4 dark:border-white/10">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{e.tag}</p>
            <p className="mt-1 text-lg">“{e.text}”</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-slate-200/60 pt-6 dark:border-white/10">
        <p className="mb-3 text-xs uppercase tracking-wide text-slate-400">Admin console (secondary)</p>
        <nav className="flex flex-wrap gap-2">
          {ADMIN_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg border border-slate-200/60 px-3 py-1.5 text-sm hover:border-accent hover:text-accent dark:border-white/10">
              {label}
            </Link>
          ))}
          <Link href="/login" className="rounded-lg border border-slate-200/60 px-3 py-1.5 text-sm hover:border-accent hover:text-accent dark:border-white/10">
            Sign in
          </Link>
        </nav>
      </footer>
    </main>
  );
}
