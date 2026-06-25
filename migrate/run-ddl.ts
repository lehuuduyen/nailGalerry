import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closePool, pool } from "./db";

// ─────────────────────────────────────────────────────────────────────────
//  run-ddl.ts — apply schema.sql to Neon (idempotent: all CREATE ... IF NOT
//  EXISTS). Safe to run repeatedly.
//
//  Run:  npx tsx migrate/run-ddl.ts
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  const sql = readFileSync(resolve(process.cwd(), "migrate/schema.sql"), "utf8");
  console.log("Applying schema.sql to Neon…");
  await pool.query(sql);

  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('users','designs','likes')
     ORDER BY table_name`,
  );
  console.log("Tables present:", rows.map((r) => r.table_name).join(", ") || "(none)");
  console.log("DDL applied successfully.");
}

main()
  .catch((err) => {
    console.error("run-ddl failed:", err);
    process.exitCode = 1;
  })
  .finally(closePool);
