import Link from "next/link";

/** Shared chrome for the secondary admin console pages. */
export default function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← Ask OHMY ONE
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 text-slate-500 dark:text-slate-400">{subtitle}</p>}
      <div className="mt-6 rounded-xl border border-slate-200/60 p-6 dark:border-white/10">
        {children ?? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Skeleton page. In the prototype, live data is served through the OHMY
            ONE MCP RPCs (see <code>docs/MCP_TOOLS.md</code>). This console is the
            secondary surface; the primary interface is the conversation.
          </p>
        )}
      </div>
    </main>
  );
}
