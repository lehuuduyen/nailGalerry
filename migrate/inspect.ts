import { getJsonArray } from "./r2";

// ─────────────────────────────────────────────────────────────────────────
//  inspect.ts — download catalog.json + users.json from R2 and print their
//  ACTUAL structure (key sets, types, sample records) so the migration can be
//  designed against real data. Secrets (password hashes, salts, tokens) are
//  never printed — only their presence/length.
//
//  Run:  npx tsx migrate/inspect.ts
// ─────────────────────────────────────────────────────────────────────────

const SECRET_KEY_RE = /(password|hash|salt|secret|token|apikey|api_key)/i;

function redact(key: string, value: unknown): unknown {
  if (SECRET_KEY_RE.test(key) && typeof value === "string") {
    return `[redacted: ${value.length} chars]`;
  }
  return value;
}

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** Print the union of keys across all records, with type(s) + how many records have it. */
function analyzeKeys(records: Record<string, unknown>[]): void {
  const info = new Map<string, { count: number; types: Set<string> }>();
  for (const rec of records) {
    for (const [k, v] of Object.entries(rec)) {
      const entry = info.get(k) ?? { count: 0, types: new Set<string>() };
      entry.count++;
      entry.types.add(typeOf(v));
      info.set(k, entry);
    }
  }
  const total = records.length;
  const rows = [...info.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [key, { count, types }] of rows) {
    const presence = count === total ? "always" : `${count}/${total}`;
    console.log(`    ${key.padEnd(18)} ${[...types].join("|").padEnd(16)} (${presence})`);
  }
}

function sample(records: Record<string, unknown>[], n: number): void {
  for (const rec of records.slice(0, n)) {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) safe[k] = redact(k, v);
    console.log("    " + JSON.stringify(safe));
  }
}

function hostOf(url: unknown): string {
  if (typeof url !== "string" || !url) return "(no image)";
  try {
    return new URL(url).hostname;
  } catch {
    return "(invalid url)";
  }
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" INSPECT: catalog.json");
  console.log("══════════════════════════════════════════════════════════════");
  const catalog = await getJsonArray<Record<string, unknown>>("catalog.json");
  console.log(`  Records: ${catalog.length}`);
  if (catalog.length) {
    console.log("\n  Keys (union):");
    analyzeKeys(catalog);

    // Image host distribution — how many are already on R2 vs hot-linked.
    const hosts = new Map<string, number>();
    for (const d of catalog) hosts.set(hostOf(d.imageUrl), (hosts.get(hostOf(d.imageUrl)) ?? 0) + 1);
    console.log("\n  imageUrl hosts:");
    for (const [h, c] of [...hosts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(c).padStart(4)}  ${h}`);
    }
    const onR2 = catalog.filter((d) => hostOf(d.imageUrl).endsWith(".r2.dev")).length;
    console.log(`\n  → on R2: ${onR2} | needs re-host: ${catalog.length - onR2}`);

    console.log("\n  Sample records:");
    sample(catalog, 2);
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(" INSPECT: users.json");
  console.log("══════════════════════════════════════════════════════════════");
  const users = await getJsonArray<Record<string, unknown>>("users.json");
  console.log(`  Records: ${users.length}`);
  if (users.length) {
    console.log("\n  Keys (union):");
    analyzeKeys(users);
    console.log("\n  Sample records (secrets redacted):");
    sample(users, 3);

    // Surface anything that looks like embedded likes/favorites so we can plan
    // the `likes` table migration.
    const likeKeys = new Set<string>();
    for (const u of users) {
      for (const k of Object.keys(u)) if (/like|fav|saved/i.test(k)) likeKeys.add(k);
    }
    console.log(
      `\n  Like/favorite-looking fields: ${likeKeys.size ? [...likeKeys].join(", ") : "(none found)"}`,
    );
  } else {
    console.log("  (users.json is empty or missing)");
  }

  console.log("\nDone. No secret values were printed.");
}

main().catch((err) => {
  console.error("inspect failed:", err);
  process.exit(1);
});
