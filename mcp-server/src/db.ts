import pg from "pg";

// numeric/decimal come back as strings from pg by default (good — no float loss).
// We keep them as strings end-to-end; Claude never re-computes them.

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.OHMY_PG_POOL ?? 5),
  application_name: "ohmy-one-mcp",
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: "error", msg: "pg pool error", error: err.message }));
});

/**
 * Invoke a whitelisted business RPC as a specific employee, inside one
 * transaction. The acting identity is bound via a transaction-local GUC that
 * app.current_employee_id() reads — it is NEVER taken from tool arguments
 * (ADR-003). `rpc` is always a constant from the tool registry, never user
 * input; `args` are passed as bound parameters, so there is no SQL injection
 * surface and no way to smuggle arbitrary SQL through this path (ADR-002).
 */
export async function callAsActor(
  employeeId: string | null,
  rpc: string,
  args: unknown[] = []
): Promise<unknown> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // transaction-local so it cannot leak across pooled connections
    await client.query("select set_config('app.current_employee_id', $1, true)", [
      employeeId ?? "",
    ]);
    const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `select ${rpc}(${placeholders}) as result`;
    const res = await client.query(sql, args as any[]);
    await client.query("commit");
    return res.rows[0]?.result ?? null;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Low-level read used only at startup to resolve the session's actor. */
export async function resolveEmployee(idOrNoOrEmail: string): Promise<{ id: string; name: string } | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `select id, full_name from public.employees
       where deleted_at is null
         and (employee_no = $1 or email = $1 or id::text = $1)
       limit 1`,
      [idOrNoOrEmail]
    );
    if (res.rowCount === 0) return null;
    return { id: res.rows[0].id, name: res.rows[0].full_name };
  } finally {
    client.release();
  }
}

/** Best-effort audit write for events that happen at the MCP layer itself
 *  (e.g. a CRITICAL tool blocked before it ever reaches the database). */
export async function auditAtGateway(
  employeeId: string | null,
  action: string,
  toolName: string,
  reason: string
): Promise<void> {
  try {
    await callAsActor(employeeId, "app.write_audit", [
      action,
      false,
      toolName,
      null,
      null,
      null,
      null,
      null,
      null,
      reason,
    ]);
  } catch {
    /* auditing must never break the response path; failures are logged by caller */
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
