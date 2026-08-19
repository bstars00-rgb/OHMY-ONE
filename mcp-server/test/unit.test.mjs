// MCP-layer unit tests (no database required). Run: npm run build && node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeIdempotencyKey, zodObjectToJsonSchema, newRequestId } from "../dist/util.js";
import { TOOLS, TOOL_BY_NAME } from "../dist/registry.js";

test("idempotency key is deterministic for identical logical requests", () => {
  const a = makeIdempotencyKey("emp-1", "ohmy_hr_create_leave_request", { start_date: "2026-08-20" });
  const b = makeIdempotencyKey("emp-1", "ohmy_hr_create_leave_request", { start_date: "2026-08-20" });
  assert.equal(a, b);
});

test("idempotency key differs for different actor/args", () => {
  const a = makeIdempotencyKey("emp-1", "t", { d: 1 });
  const b = makeIdempotencyKey("emp-2", "t", { d: 1 });
  const c = makeIdempotencyKey("emp-1", "t", { d: 2 });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("no raw-SQL / generic mutation tool is exposed", () => {
  for (const bad of ["execute_sql", "execute_any_sql", "update_any_table", "delete_record", "query", "sql"]) {
    assert.equal(TOOL_BY_NAME.has(bad), false, `must not expose ${bad}`);
  }
});

test("every tool maps to a non-empty rpc and has a substantial description", () => {
  for (const t of TOOLS) {
    assert.ok(t.rpc && t.rpc.length > 0, `${t.name} has rpc`);
    assert.ok(t.description.length > 80, `${t.name} description is detailed`);
    assert.ok(["READ", "LOW_RISK_WRITE", "APPROVAL", "CRITICAL"].includes(t.risk));
  }
});

test("CRITICAL tools point at the blocked sentinel (never a real rpc)", () => {
  for (const t of TOOLS.filter((t) => t.risk === "CRITICAL")) {
    assert.equal(t.rpc, "__blocked__", `${t.name} must be blocked`);
  }
});

test("write tools carry idempotency-capable params; approval tools take an id", () => {
  const create = TOOL_BY_NAME.get("ohmy_hr_create_leave_request");
  const schema = zodObjectToJsonSchema(create.schema);
  assert.deepEqual(schema.required?.sort(), ["end_date", "start_date"]);
  const approve = TOOL_BY_NAME.get("ohmy_approval_approve");
  assert.ok(zodObjectToJsonSchema(approve.schema).required.includes("approval_request_id"));
});

test("request id is a uuid", () => {
  assert.match(newRequestId(), /^[0-9a-f-]{36}$/);
});
