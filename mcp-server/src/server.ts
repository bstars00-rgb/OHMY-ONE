import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, TOOL_BY_NAME } from "./registry.js";
import { getActor } from "./identity.js";
import { auditAtGateway, callAsActor } from "./db.js";
import { log, makeIdempotencyKey, newRequestId, zodObjectToJsonSchema } from "./util.js";

export function createServer(): Server {
  const server = new Server(
    { name: "ohmy-one", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: `[${t.risk}] perm:${t.permission ?? "n/a"} — ${t.description}`,
      inputSchema: zodObjectToJsonSchema(t.schema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const requestId = newRequestId();
    const started = Date.now();
    const name = req.params.name;
    const tool = TOOL_BY_NAME.get(name);

    const fail = (message: string, status: string) => {
      log({ level: "warn", request_id: requestId, tool: name, status, ms: Date.now() - started });
      return { isError: true, content: [{ type: "text" as const, text: message }] };
    };

    if (!tool) return fail(`Unknown tool: ${name}`, "unknown_tool");

    // 1. Validate arguments (handles malformed MCP input gracefully).
    const parsed = tool.schema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return fail(
        `Invalid arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        "invalid_args"
      );
    }

    let actor;
    try {
      actor = await getActor();
    } catch (e: any) {
      return fail(`Session not authenticated: ${e.message}`, "no_actor");
    }

    // 2. Risk-tier gate.
    if (tool.risk === "CRITICAL") {
      await auditAtGateway(actor.id, "CRITICAL_TOOL_BLOCKED", name, "critical tier blocked in prototype");
      return fail(
        `'${name}' is a CRITICAL, irreversible action and is disabled in this prototype. ` +
          `It must be performed by a human in the admin console under dual control.`,
        "critical_blocked"
      );
    }

    // 3. Idempotency: always send a key for create_* writes so retries can't duplicate.
    const args: any = { ...parsed.data };
    if (tool.name === "ohmy_hr_create_leave_request" && !args.idempotency_key) {
      args.idempotency_key = makeIdempotencyKey(actor.id, tool.name, {
        leave_type_code: args.leave_type_code,
        start_date: args.start_date,
        end_date: args.end_date,
      });
    }

    // 4. Execute the whitelisted RPC as the bound actor.
    try {
      const result = await callAsActor(actor.id, tool.rpc, tool.toParams(args));
      log({
        level: "info",
        request_id: requestId,
        tool: name,
        risk: tool.risk,
        status: "ok",
        ms: Date.now() - started,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      // Permission denials (SQLSTATE 42501) are already audited inside the RPC.
      const code = e?.code;
      const denied = code === "42501" || code === "28000";
      log({
        level: denied ? "warn" : "error",
        request_id: requestId,
        tool: name,
        status: denied ? "denied" : "db_error",
        sqlstate: code,
        ms: Date.now() - started,
      });
      const msg = denied
        ? `Permission denied: ${e.message}. This was recorded in the audit log.`
        : `The request could not be completed: ${e.message}`;
      return { isError: true, content: [{ type: "text" as const, text: msg }] };
    }
  });

  return server;
}
