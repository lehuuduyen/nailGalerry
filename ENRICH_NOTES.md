# Enrichment notes — schema expansion + Gemini enrich

Expanded the `designs` schema with filter-tag splits, skin-matching attributes,
and SEO fields, then filled the new fields with Gemini Vision (gemini-2.5-flash).
Images stay on R2; nothing was dropped.

## Schema changes (additive, idempotent)

New columns on `designs` (all `ALTER TABLE … ADD COLUMN IF NOT EXISTS`):

- SEO: `slug` (unique index), `description`, `alt_text`
- filter tags: `accent_colors TEXT[]`, `season`, `style_origin`, `skin_tone`, `undertone`
- new indexes: `slug` (unique), `season`, `skin_tone`, `style_origin`, GIN on `accent_colors`

## Taxonomy decisions (`migrate/taxonomy.ts`)

Closed enums, based on the real data + supplements. Key splits/decisions:

- **`occasion` was overloaded** (events + seasons). Split: `Summer`/`Winter`
  (and `Spring`/`Fall`) → **`season`**; real events stay in `occasion`
  (`Everyday, Office, Bridal, Party, Lunar New Year`).
- **`mood` was overloaded** (emotion + culture). `Korean` → **`style_origin`**;
  `mood` = `Minimalist, Luxurious, Cute, Edgy, Vintage, Romantic, Elegant, Glam`.
- **`accent_colors`** uses an expanded palette (8 primary colours + `Gold,
  Silver, Green, Purple, Orange, Yellow, Brown`).
- **`season`** = `Spring, Summer, Fall, Winter, Holiday`;
  **`skin_tone`** = `Fair, Light, Medium, Tan, Deep`;
  **`undertone`** = `Warm, Cool, Neutral`.
- `Lunar New Year` rows: `season` left for Gemini to infer (not forced).

### Deterministic normalisation (`migrate/normalize.ts`, not Gemini)

- 13 rows: `occasion` Summer/Winter → `season`, `occasion` cleared.
- 7 rows: `mood` Korean → `style_origin`, `mood` cleared (Gemini refilled mood).

## Enrich run (`migrate/enrich.ts`)

- 37/37 designs processed, **0 failures** (`migrate/enrich-failed.json` empty).
- Gemini key: `GEMINI_API_KEY` (falls back to `GEMINI_TAG_API_KEY`), vision input
  = the R2 image + known tags. Enum-constrained; unsure → null (never fabricated).
- Idempotent: only `NULL`/empty columns are written (COALESCE); re-running never
  overwrites existing values.

### Coverage (verify.ts)

| field | coverage | note |
|---|---|---|
| description | 37/37 (100%) | unique, 0 duplicates |
| alt_text | 37/37 (100%) | |
| slug | 37/37 (100%) | unique, 0 duplicates |
| skin_tone | 37/37 (100%) | |
| mood | 37/37 (100%) | |
| occasion | 36/37 (97%) | |
| accent_colors | 36/37 (97%) | |
| season | 30/37 (81%) | null when no seasonal cue |
| undertone | 22/37 (59%) | null when hand/skin not clearly visible |
| style_origin | 11/37 (30%) | only set when the look clearly follows an origin |

- **Out-of-enum values: none** — every stored tag is within the taxonomy.
- The high-NULL fields (`style_origin`, `undertone`, `season`) are expected: the
  prompt returns null rather than guessing. Re-running enrich won't change them
  unless a better signal exists.

## How to run again

```bash
npm run migrate:ddl        # apply schema (additive, safe to repeat)
npm run migrate:normalize  # split occasion→season, mood→style_origin
npm run migrate:enrich     # Gemini fill of NULL fields (idempotent, batched)
npm run migrate:verify     # coverage + out-of-enum scan
```

## TODO / follow-ups

- [ ] **Legacy primary tags may not match the photo.** `color`/`shape`/etc. came
      from an earlier auto-tag pass and were NOT overwritten (idempotent). Some
      descriptions describe a look that differs from the old tag (e.g. a row
      tagged `color=Black` whose image is a milky-nude French). Consider a
      separate, explicit **re-tag pass** (overwriting primary tags from the
      image) if catalogue accuracy matters — kept out of scope here.
- [ ] Optionally re-run enrich later to fill remaining `style_origin` /
      `undertone` / `season` nulls if image crops improve.
- [ ] Wire the app to read the new fields (advisor filters, SEO meta/slug pages)
      — separate task; this one only touched the DB.
- [ ] Ensure `DATABASE_URL` + `GEMINI_API_KEY` are set in the Vercel env if any
      of this runs in production.
