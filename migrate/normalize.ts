import { closePool, pool } from "./db";

// ─────────────────────────────────────────────────────────────────────────
//  normalize.ts — deterministic reclassification of values that currently sit
//  in the wrong column (NOT Gemini). Run before enrich.ts. Idempotent: once a
//  value has moved, the WHERE clauses no longer match it.
//
//    occasion Summer/Winter/Spring/Fall  → season   (occasion cleared)
//    mood     Korean                      → style_origin (mood cleared)
//
//  Run:  npx tsx migrate/normalize.ts
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Normalising overloaded tags…");

  const toSeason = await pool.query(
    `UPDATE designs SET season = occasion
     WHERE occasion IN ('Summer','Winter','Spring','Fall') AND season IS NULL`,
  );
  const clearOcc = await pool.query(
    `UPDATE designs SET occasion = NULL
     WHERE occasion IN ('Summer','Winter','Spring','Fall')`,
  );
  console.log(`  occasion → season: ${toSeason.rowCount} set, ${clearOcc.rowCount} occasion cleared`);

  const toOrigin = await pool.query(
    `UPDATE designs SET style_origin = 'Korean'
     WHERE mood = 'Korean' AND style_origin IS NULL`,
  );
  const clearMood = await pool.query(`UPDATE designs SET mood = NULL WHERE mood = 'Korean'`);
  console.log(`  mood → style_origin: ${toOrigin.rowCount} set, ${clearMood.rowCount} mood cleared`);

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("normalize failed:", err);
    process.exitCode = 1;
  })
  .finally(closePool);
