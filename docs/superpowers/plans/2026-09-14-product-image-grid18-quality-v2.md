# Product Image Grid18 Quality V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mixed grid/individual image automation with a Firebase-active-only, high-quality, 18-product-only pipeline that rejects crops/extras and researches better sources when needed.

**Architecture:** Keep the existing Supabase queue/batch/storage structure, but add a V2 policy/source-inspection layer and tighten generation/validation. Firebase is the activation source of truth; Supabase tracks durable image state/version. The dispatcher drains the initial backlog every minute and changes behavior to hourly 08:00–18:00 America/Cuiaba after the backlog is zero.

**Tech Stack:** Supabase Postgres/pg_cron/pg_net/Edge Functions, TypeScript/Deno, OpenAI Responses web search + vision, GPT Image 2.5 Sunburst, Supabase Storage.

**Spec:** `docs/superpowers/specs/2026-09-14-product-image-grid18-quality-v2-design.md`

## Global Constraints

- Only Firebase-active products may consume generation.
- Generation is exactly 18 products; no individual generation path.
- Background `#ECECEC`.
- Hard reject incomplete/cropped/bad-cutout/extra-element output.
- V2 pipeline version: `grid18-studio-v2-high-clean`.
- Initial drain every minute; steady-state check hourly 08:00–18:00 America/Cuiaba, every day.

---

### Task 1: Pure policy rules and tests

**Files:**
- Create: `supabase/functions/product-image-openai-grid18-v1/policy.mjs`
- Create: `tests/product-image-grid18-v2-policy.test.mjs`

**Interfaces:**
- Produces: `firebaseProductActive(record) -> boolean`, `sourceInspectionAccepted(v) -> boolean`, `finalValidationAccepted(v) -> boolean`.

- [ ] Write failing Node tests covering Firebase active/inactive/status variants, crop/extra-element hard rejects, and clean image acceptance.
- [ ] Run `node --test tests/product-image-grid18-v2-policy.test.mjs` and confirm failure because policy module does not exist.
- [ ] Implement the pure policy functions.
- [ ] Re-run the test and require all cases to pass.

### Task 2: Generation and validation quality

**Files:**
- Modify: `supabase/functions/product-image-openai-grid18-v1/image.mjs`

**Interfaces:**
- Consumes policy final validation rules.
- Produces `generateGrid`, `inspectSource`, `validateGenerated`.

- [ ] Extend source/final schemas with complete/crop/cutout/extra-element/professional-photo/contact-shadow checks.
- [ ] Replace the grid prompt with explicit professional studio photography requirements while preserving exact product identity.
- [ ] Change grid generation to `quality=high` and WebP output compression 86 while retaining 2400x1200/18 cells.
- [ ] Remove use/export dependency on single-product generation from the worker path.
- [ ] Verify policy tests remain green and source text contains no worker invocation of `generateSingle`.

### Task 3: Firebase truth and researched source recovery

**Files:**
- Modify: `supabase/functions/product-image-openai-grid18-v1/source.mjs`
- Create: `supabase/functions/product-image-openai-grid18-v1/research.mjs`

**Interfaces:**
- Produces `resolveFirebaseProduct(product)`, `findReplacementSource(openaiKey, product, rejectedSource)`, and trusted persisted source metadata.

- [ ] Implement Firebase lookup using `firebase_key`, with GTIN fallback, using existing active semantics (`ativo` first, then status/situacao).
- [ ] Implement source inspection before grid admission.
- [ ] On failed source inspection, web-search exact EAN/name/brand/packaging and require exact variant + clean-source vision validation.
- [ ] Download an accepted external candidate safely and return bytes for persistence to trusted Supabase Storage.
- [ ] Bound replacement-source attempts; never fall back to individual generation.

### Task 4: Worker behavior

**Files:**
- Modify: `supabase/functions/product-image-openai-grid18-v1/index.ts`

**Interfaces:**
- Consumes V2 source/policy/image modules.
- Produces grid-only `advance` processing.

- [ ] Re-check Firebase activity immediately before preparation; inactive/missing products release the batch without generation.
- [ ] Inspect each source and research/persist replacement when needed.
- [ ] Replace all technical/validation fallback behavior with grid requeue (`force_individual=false`).
- [ ] Delete/disable `fallbackOne` and reject `event='fallback'` without image generation.
- [ ] On success store `image_ai_pipeline_version='grid18-studio-v2-high-clean'`.
- [ ] On validation failure invalidate/research source and queue another grid attempt; after bounded retries mark rejected/manual review.

### Task 5: Database queue and scheduler

**Files:**
- Create: `supabase/migrations/20260914_product_image_grid18_quality_v2.sql`

**Interfaces:**
- Produces updated enqueue/claim/dispatch functions and V2 pipeline column.

- [ ] Add nullable `products.image_ai_pipeline_version text`.
- [ ] Replace enqueue logic so V2-completed products are skipped and non-V2 Firebase/Supabase candidates can be queued.
- [ ] Replace grid claim to re-check `products.is_active=true` and prohibit `force_individual=true` selection.
- [ ] Remove fallback dispatch path and normalize old fallback jobs to grid pending.
- [ ] Recover/cancel stale old active batches safely.
- [ ] Dispatcher runs fast while V2 backlog exists; when zero, it performs maintenance only once per local hour from 08:00 to 18:00 America/Cuiaba.
- [ ] Keep pg_cron firing every minute as a lightweight guard; dispatcher itself enforces steady-state hourly cadence.

### Task 6: Deploy, run, verify

**Files:**
- Deploy Edge Function: `product-image-openai-grid18-v1`
- Apply migration: `20260914_product_image_grid18_quality_v2`

- [ ] Deploy the V2 Edge Function files.
- [ ] Apply the database migration.
- [ ] Execute dispatcher repeatedly enough to complete one full 18-product V2 batch.
- [ ] Verify no generated job belongs to a Firebase-inactive product.
- [ ] Verify the batch has exactly 18 items and no job has `force_individual=true` due to V2 processing.
- [ ] Inspect V2 validation JSON for `product_complete`, `bad_crop`, `bad_cutout`, and `extra_elements` fields.
- [ ] Confirm accepted products are tagged with V2 pipeline version and URLs point to Supabase Storage.
- [ ] Confirm cron is enabled and initial backlog is draining.
