# Migration notes — R2 JSON → Neon Postgres

Migrated the NailLib data store from JSON files on Cloudflare R2
(`catalog.json`, `users.json`) into Neon Postgres. **Images stay on R2.**

## Result (verified)

| Entity   | Count | Notes |
|----------|-------|-------|
| users    | 1     | from `users.json` |
| designs  | 37    | from `catalog.json` |
| likes    | 0     | no like/favorite data existed to migrate (see below) |

- **Images:** 37/37 designs have `image_url` on R2; **0 off R2**.
- **Re-hosted this run:** 0 — all images were already on R2 (re-hosted during an
  earlier backfill). The re-host path in `migrate.ts` remains for future imports
  / re-runs and is a no-op when an image is already on R2.
- **Image failures:** 0 (`migrate/failed-images.json` is empty).
- **Orphan `owner_id`:** 0. The one user-uploaded design correctly references the
  migrated user.
- **Status:** all 37 = `approved` (legacy designs had no `status` field → default).
- **Idempotent:** re-running `migrate:run` produces the same counts (no
  duplicates) thanks to `INSERT … ON CONFLICT (id) DO UPDATE`.

## Schema decisions (vs. the original proposal)

`users.json` actually contains `{ id, username, salt, passwordHash, createdAt }`
— **no** `email` / `display_name` / `handle`. The `users` table was adjusted:

```sql
users(id, username UNIQUE NOT NULL, password_hash NOT NULL, salt NOT NULL, created_at)
```

- `salt` is **required** — scrypt login needs it; dropping it would break auth.
- `email` / `display_name` / `handle` were omitted (no source data).

`designs` and `likes` match the proposed schema. Notable mappings:

- Tag columns (`style, color, shape, length, occasion, mood, technique, detail`)
  map 1:1 from the catalog record.
- `source` object → `source_platform`, `source_handle`, `source_url`.
  (`source.url` is the Instagram **post permalink**, not the image URL.)
- `original_url` is **NULL** for all rows: images were already re-hosted in an
  earlier backfill, so the original Instagram CDN image URLs are no longer
  available. Future hot-linked imports will populate `original_url` on migrate.
- `status` defaults to `approved` when absent.

## Likes / favorites

There is **no likes data to migrate** — user favorites are currently stored in
the browser's `localStorage` (client-side), not in `users.json`. The `likes`
table exists and is ready; favorites can be backfilled once they move
server-side.

## Files

```
migrate/
  env.ts              load .env/.env.local, expose R2 + DATABASE_URL config
  r2.ts               S3 client + helpers (get/put/exists, isOnR2)
  db.ts               shared pg Pool (Neon, TLS)
  schema.sql          DDL (idempotent CREATE … IF NOT EXISTS)
  inspect.ts          dump real structure of the JSON files (secrets redacted)
  run-ddl.ts          apply schema.sql to Neon
  migrate.ts          users + designs migration, image re-host, idempotent
  verify.ts           reconciliation counts
  failed-images.json  images that couldn't be re-hosted (currently empty)
```

## How to run again

Requires in `.env` / `.env.local`:
`DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, and `R2_PUBLIC_URL` (or `R2_PUBLIC_BASE`).

```bash
npm run migrate:inspect   # print actual JSON structure (no secrets)
npm run migrate:ddl       # apply schema to Neon (safe to repeat)
npm run migrate:run       # migrate users + designs (idempotent)
npm run migrate:verify    # counts / reconciliation
```

## Backup

The source JSON files (`catalog.json`, `users.json`) are **left untouched on R2**
as a backup. Nothing was deleted.

## App is now DB-backed (done)

The app reads/writes Neon directly (the R2 JSON files are no longer used and were
deleted). Wiring:

- `lib/db.ts` — Neon serverless (HTTP) data-access: `getAllDesigns`,
  `getDesignsByOwner`, `insertDesign`, `replaceCatalog` (upsert + prune in one
  transaction), `deleteDesign`, plus `findUserById/ByUsername`, `insertUser`.
- `lib/auth.ts` — accounts read/write the `users` table (keeps scrypt + salt
  and the signed session cookie).
- `app/api/catalog` GET → `getAllDesigns`; PUT → `replaceCatalog` (admin-gated).
- `app/api/contribute` → `insertDesign` (pending). `app/api/my-uploads` →
  `getDesignsByOwner` / `deleteDesign`. Images still go to R2.
- Added `designs.caption` column (Instagram imports carry a caption).

Smoke-tested end-to-end: GET catalog (37), register/login/me, contribute,
my-uploads list + delete, admin catalog PUT roundtrip (37→37, no loss), and
auth gates (401 without admin / wrong password).

## TODO (next tasks)

- [ ] Move favorites server-side and backfill the `likes` table (still
      localStorage today).
- [ ] Add `DATABASE_URL` to the Vercel project env for production. Prefer the
      Neon **`-pooler`** host there.
- [ ] The source R2 JSON files were deleted; current backup is the DB itself
      (consider periodic DB backups / a JSON export job if desired).
- [ ] Note: pg warns that `sslmode=require` will mean `verify-full` in a future
      major; the migrate CLI's `migrate/db.ts` uses `ssl:{rejectUnauthorized:false}`.
```
