import PageShell from "@/components/PageShell";
export default function Page() {
  return (
    <PageShell title="Finance · P&L" subtitle="Income statement from POSTED journal lines via generate_income_statement(). Numbers computed in SQL — never by the LLM.">
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {["Revenue","COGS","Gross Profit","Operating Expenses","Operating Profit","Other Income/Expense","Net Profit"].map((l) => (
          <li key={l} className="flex justify-between rounded border border-slate-200/60 px-3 py-2 dark:border-white/10">
            <span>{l}</span><span className="text-slate-400">—</span>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
