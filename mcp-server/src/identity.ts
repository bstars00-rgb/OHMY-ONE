import { resolveEmployee } from "./db.js";
import { log } from "./util.js";

/**
 * The session's acting employee. In the prototype the identity is supplied by
 * configuration (OHMY_ACTOR = employee_no | email | uuid) — one MCP server
 * instance serves one human, mirroring a Claude Desktop per-user config.
 *
 * In PRODUCTION this is replaced by the verified subject of the user's
 * Supabase/OIDC access token; the rest of the server is unchanged because the
 * acting id is always bound server-side and never read from tool arguments
 * (ADR-003). The gateway holds exactly one identity for the whole process.
 */
export interface Actor {
  id: string;
  name: string;
}

let cached: Actor | null = null;

export async function getActor(): Promise<Actor> {
  if (cached) return cached;
  const ref = process.env.OHMY_ACTOR;
  if (!ref) {
    throw new Error(
      "OHMY_ACTOR is not set. Set it to the employee_no, email, or uuid of the user this MCP server serves."
    );
  }
  const emp = await resolveEmployee(ref);
  if (!emp) {
    throw new Error(`OHMY_ACTOR '${ref}' did not resolve to an active employee.`);
  }
  cached = emp;
  log({ level: "info", msg: "actor resolved", actor_id: emp.id });
  return emp;
}
