import PageShell from "@/components/PageShell";
import Link from "next/link";

const SECTIONS = [
  ["/admin/employees", "Employees", "Directory, reporting lines, teams"],
  ["/admin/organization", "Organization", "Entities, departments, teams"],
  ["/admin/permissions", "Permissions", "Roles, permission codes, grants"],
  ["/admin/approval-flows", "Approval Flows", "Steps and approver rules"],
  ["/admin/audit", "Audit Log", "Immutable record of sensitive actions"],
];

export default function Admin() {
  return (
    <PageShell title="Admin console" subtitle="System configuration only — no confidential HR/finance data here.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map(([href, title, desc]) => (
          <Link key={href} href={href} className="rounded-lg border border-slate-200/60 p-4 hover:border-accent dark:border-white/10">
            <p className="font-medium">{title}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{desc}</p>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
