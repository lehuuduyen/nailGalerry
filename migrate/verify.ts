import { closePool, pool } from "./db";
import { ACCENT_COLOR, ENUMS, type EnumField } from "./taxonomy";

// ─────────────────────────────────────────────────────────────────────────
//  verify.ts — reconciliation after migrate + enrich:
//    • row counts and image hosting status
//    • enrichment coverage (% with skin_tone / season / description / slug…)
//    • any stored tag value that falls OUTSIDE the taxonomy enums (to review)
//
//  Run:  npx tsx migrate/verify.ts
// ─────────────────────────────────────────────────────────────────────────

async function scalar(sql: string): Promise<number> {
  const { rows } = await pool.query(sql);
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const total = await scalar(`SELECT count(*)::int AS count FROM designs`);
  const users = await scalar(`SELECT count(*)::int AS count FROM users`);

  console.log("──────── Counts ────────");
  console.log(`  users:    ${users}`);
  console.log(`  designs:  ${total}`);
  const onR2 = await scalar(`SELECT count(*)::int AS count FROM designs WHERE image_url LIKE '%.r2.dev/%'`);
  console.log(`  image on R2: ${onR2}/${total}`);

  // ── Enrichment coverage ──
  console.log("\n──────── Enrichment coverage ────────");
  const pct = (n: number) => `${n}/${total} (${total ? Math.round((n / total) * 100) : 0}%)`;
  const coverage: [string, string][] = [
    ["description", `description IS NOT NULL`],
    ["alt_text", `alt_text IS NOT NULL`],
    ["slug", `slug IS NOT NULL`],
    ["season", `season IS NOT NULL`],
    ["occasion", `occasion IS NOT NULL`],
    ["mood", `mood IS NOT NULL`],
    ["style_origin", `style_origin IS NOT NULL`],
    ["skin_tone", `skin_tone IS NOT NULL`],
    ["undertone", `undertone IS NOT NULL`],
    ["accent_colors", `accent_colors IS NOT NULL AND accent_colors <> '{}'`],
  ];
  for (const [label, cond] of coverage) {
    const n = await scalar(`SELECT count(*)::int AS count FROM designs WHERE ${cond}`);
    console.log(`  ${label.padEnd(14)}: ${pct(n)}`);
  }

  // ── Duplicate / missing slug & description checks (SEO) ──
  const dupSlug = await scalar(
    `SELECT count(*)::int AS count FROM (SELECT slug FROM designs WHERE slug IS NOT NULL GROUP BY slug HAVING count(*) > 1) t`,
  );
  const dupDesc = await scalar(
    `SELECT count(*)::int AS count FROM (SELECT description FROM designs WHERE description IS NOT NULL GROUP BY description HAVING count(*) > 1) t`,
  );
  console.log(`  duplicate slugs:        ${dupSlug}`);
  console.log(`  duplicate descriptions: ${dupDesc}`);

  // ── Out-of-enum scan ──
  console.log("\n──────── Values outside taxonomy (review) ────────");
  let anyBad = false;
  for (const field of Object.keys(ENUMS) as EnumField[]) {
    const allowed = ENUMS[field] as readonly string[];
    const { rows } = await pool.query(
      `SELECT DISTINCT ${field} AS v FROM designs WHERE ${field} IS NOT NULL AND NOT (${field} = ANY($1))`,
      [allowed],
    );
    if (rows.length) {
      anyBad = true;
      console.log(`  ${field}: ${rows.map((r) => JSON.stringify(r.v)).join(", ")}`);
    }
  }
  // accent_colors is an array — unnest and check each element.
  const badAccents = await pool.query(
    `SELECT DISTINCT c AS v FROM designs, unnest(accent_colors) AS c WHERE NOT (c = ANY($1))`,
    [ACCENT_COLOR as readonly string[]],
  );
  if (badAccents.rows.length) {
    anyBad = true;
    console.log(`  accent_colors: ${badAccents.rows.map((r) => JSON.stringify(r.v)).join(", ")}`);
  }
  if (!anyBad) console.log("  ✓ all tag values are within the taxonomy enums");
}

main()
  .catch((err) => {
    console.error("verify failed:", err);
    process.exitCode = 1;
  })
  .finally(closePool);
