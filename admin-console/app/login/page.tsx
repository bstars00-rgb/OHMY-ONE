import PageShell from "@/components/PageShell";

export default function Login() {
  return (
    <PageShell title="Sign in" subtitle="Supabase Auth (wiring is a Phase-2 item).">
      <form className="flex max-w-sm flex-col gap-3">
        <input disabled placeholder="Email" className="rounded-lg border border-slate-200/60 bg-transparent px-3 py-2 dark:border-white/10" />
        <input disabled type="password" placeholder="Password" className="rounded-lg border border-slate-200/60 bg-transparent px-3 py-2 dark:border-white/10" />
        <button disabled className="rounded-lg bg-accent px-3 py-2 text-white opacity-70">Sign in</button>
        <p className="text-xs text-slate-400">
          NOTE: never enter real credentials here — this is a disabled mock.
        </p>
      </form>
    </PageShell>
  );
}
