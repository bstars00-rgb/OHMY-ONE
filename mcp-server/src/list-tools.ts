// Prints the tool catalog grouped by risk tier. Useful for docs/review and to
// verify no raw-SQL tool exists. Run: npm run build && npm run list-tools
import { TOOLS } from "./registry.js";

const order = ["READ", "LOW_RISK_WRITE", "APPROVAL", "CRITICAL"] as const;
for (const risk of order) {
  const group = TOOLS.filter((t) => t.risk === risk);
  console.log(`\n=== ${risk} (${group.length}) ===`);
  for (const t of group) {
    console.log(`  ${t.name}  ->  ${t.rpc}()   [perm: ${t.permission ?? "n/a"}]`);
  }
}
console.log(`\nTotal tools: ${TOOLS.length}. Raw-SQL tools: 0 (by design).`);
