#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { closePool } from "./db.js";
import { log } from "./util.js";

async function main() {
  if (!process.env.DATABASE_URL) {
    log({ level: "error", msg: "DATABASE_URL is required" });
    process.exit(1);
  }
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log({ level: "info", msg: "OHMY ONE MCP server started (stdio)" });

  const shutdown = async () => {
    await closePool().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  log({ level: "error", msg: "fatal", error: e.message });
  process.exit(1);
});
