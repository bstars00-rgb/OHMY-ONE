import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

/**
 * Deterministic idempotency key (UUIDv5-style) derived from the actor, tool and
 * normalized args. Identical retries of the same logical request produce the
 * same key, so create_* RPCs return the original record instead of duplicating
 * (ADR-006). Different requests differ in args and get different keys.
 */
export function makeIdempotencyKey(actor: string, tool: string, args: unknown): string {
  const canonical = `${actor}|${tool}|${stableStringify(args)}`;
  const h = createHash("sha1").update(canonical).digest(); // 20 bytes
  const b = h.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as any)[k])}`).join(",")}}`;
}

export function newRequestId(): string {
  return randomUUID();
}

/** Minimal zod -> JSON Schema for the small subset of shapes used by the tools. */
export function zodObjectToJsonSchema(schema: z.ZodObject<any>): Record<string, unknown> {
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, def] of Object.entries(shape)) {
    let node: z.ZodTypeAny = def;
    let optional = false;
    if (node instanceof z.ZodDefault) node = node._def.innerType;
    if (node instanceof z.ZodOptional) {
      optional = true;
      node = node._def.innerType;
    }
    let prop: Record<string, unknown>;
    if (node instanceof z.ZodString) prop = { type: "string" };
    else if (node instanceof z.ZodNumber) prop = { type: "number" };
    else if (node instanceof z.ZodBoolean) prop = { type: "boolean" };
    else prop = { type: "string" };
    properties[key] = prop;
    if (!optional && !(def instanceof z.ZodDefault) && !(def instanceof z.ZodOptional)) required.push(key);
  }
  const out: Record<string, unknown> = { type: "object", properties };
  if (required.length) out.required = required;
  out.additionalProperties = false;
  return out;
}

/** Structured stderr log (stdout is reserved for the MCP protocol). Never logs secrets/PII values. */
export function log(fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}
