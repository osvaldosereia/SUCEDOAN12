# Product Image Manual Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep 18-product medium grid generation moving when sources are visually poor, while surfacing risky products in Admin V3 for deliberate manual individual regeneration with an admin instruction.

**Architecture:** Extend `products` with manual-review state, make the grid worker degrade gracefully by using the best available source and flagging risk instead of aborting the batch, and make failed final cells terminal for the automatic pipeline but visible for review. Add a manual-only dispatcher/claim path into the existing individual generator and expose it through the existing authenticated Admin image endpoint/UI.

**Tech Stack:** Supabase Postgres, pg_cron/pg_net/Vault, Supabase Edge Functions (Deno/TypeScript), OpenAI Images/Responses APIs, Admin V3 vanilla HTML/JS, GitHub.

**Spec:** `docs/superpowers/specs/2026-09-14-product-image-manual-review-design.md`

## Global Constraints

- Automatic image generation stays 18 products per grid, `quality=medium`.
- Automatic flow must never generate individual images.
- Individual generation is allowed only from an authenticated Admin V3 owner/admin action.
- Automatic and manual generation must require `products.is_active=true`.
- A bad source or bad generated cell must not cancel the other products in the automatic drain.
- Failed/manual-review candidates must never overwrite the current published `products.image_url`.
- Fixed visual rules remain: exact product identity, complete product, no extra objects, `#ECECEC` background, realistic contact shadow.

---

### Task 1: Add manual-review state and manual-only dispatcher

**Files:**
- Create: `supabase/migrations/20260914100500_product_image_manual_review_v1.sql`
- Test: database SQL verification queries executed through Supabase.

**Interfaces:**
- Produces product fields `image_ai_manual_review_required`, `image_ai_manual_review_reason`, `image_ai_manual_prompt`, `image_ai_manual_requested_at`, `image_ai_manual_requested_by`, `image_ai_manual_attempts`, `image_ai_manual_resolved_at`.
- Produces RPC `dispatch_product_image_manual_worker_v1()`.
- Replaces `claim_product_image_fallback_v1()` so it only claims active, explicitly manually requested jobs.
- Replaces `product_image_auto_retry_v1()` so rejected automatic results are never converted into automatic individual jobs.

- [ ] **Step 1: Create migration with columns/index and restricted RPCs**

Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, an index on `(image_ai_manual_review_required, is_active)`, active/manual filters in `claim_product_image_fallback_v1`, and a dispatcher that posts `{event:'drain_manual',limit:1}` to `product-image-openai-v2` using the existing Vault webhook key.

- [ ] **Step 2: Disable legacy automatic individual fallback**

Replace `product_image_auto_retry_v1()` with a no-auto-requeue implementation. Rejected/source-rejected updates should only preserve/mark manual review state; they must never set `force_individual=true` automatically.

- [ ] **Step 3: Apply migration and verify**

Run SQL checking the seven columns, function definitions, `proacl`, and that no active trigger path can set `force_individual=true` except explicit admin queueing.

### Task 2: Make grid worker tolerate poor sources and terminalize bad cells for manual review

**Files:**
- Modify: `supabase/functions/product-image-openai-grid18-v1/index.ts`
- Modify: `supabase/functions/product-image-openai-grid18-v1/source.mjs` only if last-resort current-image fetch is needed.
- Test: `scripts/test-product-image-grid18-v2.mjs` or a focused static test script.

**Interfaces:**
- `bestSource(...)` returns source plus `manualReviewReason` when source inspection/research fails but a usable image still exists.
- `persistSource(...)` records review state without stopping batch preparation.
- `failGeneratedItem(...)` finalizes the automatic job and flags review instead of requeueing/forcing individual fallback.

- [ ] **Step 1: Write failing static assertions for graceful source degradation and manual-review marking**

Assertions must require `image_ai_manual_review_required`, `manualReviewReason`, and forbid the old batch-release path for visual source inspection failures.

- [ ] **Step 2: Implement best-available-source fallback**

Keep the existing web recovery attempt. If research fails but the original/current source can still be fetched, return it with a compact review reason derived from `bad_crop`, `bad_cutout`, `extra_elements`, identity/quality thresholds, or `critical_issue`.

- [ ] **Step 3: Change failed final-cell handling**

Upload the rejected crop, store it in `image_ai_url`, keep `image_url` unchanged, set `image_ai_status='rejected'`, set `image_ai_pipeline_version='grid18-studio-v2-medium-clean'`, set manual-review fields, and mark the automatic job terminal so the drain moves on.

- [ ] **Step 4: Verify grid medium invariants**

Static checks must still find `quality='medium'`, exact 18-cell grid, active Firebase check, and no call to individual generation in the grid Edge Function.

### Task 3: Add manual instruction support to individual generator

**Files:**
- Modify: `supabase/functions/product-image-openai-v2/index.ts`
- Test: static test script covering prompt and claim path.

**Interfaces:**
- Event `drain_manual` claims via `claim_product_image_fallback_v1(1)`.
- `promptFor(product)` includes `image_ai_manual_prompt` as a subordinate admin instruction.
- Successful manual run clears review requirement; failed/rejected run keeps it and updates reason.

- [ ] **Step 1: Write failing assertions for `drain_manual`, manual prompt and medium quality**

- [ ] **Step 2: Update product selection and prompt**

Select manual fields, append a clearly delimited admin instruction while stating it cannot override product identity, and set individual manual `quality='medium'`.

- [ ] **Step 3: Harden individual validation**

Add hard-fail fields for `product_complete`, `bad_crop`, `bad_cutout`, `extra_elements`, `professional_photo`, and `natural_contact_shadow` and require them for acceptance.

- [ ] **Step 4: Update persistence**

On success: publish new image, increment manual attempts, clear review requirement/reason and set resolved timestamp. On rejection/error: leave `image_url` untouched, preserve candidate/reason, increment manual attempts and keep review required.

### Task 4: Expose bad-image review and explicit manual generation through Admin Edge Function

**Files:**
- Modify: `supabase/functions/admin-product-images-v1/index.ts`
- Test: `scripts/test-admin-v3-image-automation-v1.mjs`.

**Interfaces:**
- `status` returns `stats.bad_images` and `triage.bad_images`.
- New action `generate_manual` accepts `product_id` and `manual_prompt`, validates active product, stores admin/user request fields, queues `force_individual=true`, and calls `dispatch_product_image_manual_worker_v1()`.

- [ ] **Step 1: Extend product field list and status queries**

- [ ] **Step 2: Add `generate_manual` authenticated action**

Require a non-empty prompt (max 1200 chars), reject inactive/processing products, save user ID/request time, queue only that product as force-individual, and dispatch the manual worker.

- [ ] **Step 3: Point `run_now` at the current V2 grid dispatcher**

Replace legacy `dispatch_product_image_grid18_worker_v1` with `dispatch_product_image_grid18_worker_v2` where the action is intended to advance the new automatic drain.

### Task 5: Add `Imagens ruins` UI and manual prompt button

**Files:**
- Modify: `admin-v3/imagens-ia.html`
- Modify: `admin-v3/image-automation.js`
- Modify: `admin-v3/image-automation.css` only if existing field/button styles are insufficient.
- Test: `scripts/test-admin-v3-image-automation-v1.mjs`.

**Interfaces:**
- `state.triage.bad_images` renders with the existing issue cards.
- Repair dialog field `repairManualPrompt` sends `generate_manual`.
- Button `generateIndividualManual` is the only bulk-independent manual-generation action.

- [ ] **Step 1: Add failing UI assertions**

Require filter option `bad_images`, stat `statBadImages`, textarea `repairManualPrompt`, and button `generateIndividualManual`; assert the old bulk individual problems button is absent.

- [ ] **Step 2: Update HTML copy/UI**

Add the dedicated stat/filter and manual instruction field. Explain that individual generation costs more and only runs after the explicit click.

- [ ] **Step 3: Update JS state/render/actions**

Include `bad_images` in `allTriage`, counts and filter totals. Preload the saved manual prompt in the dialog. On manual button click, require instruction, call `generate_manual`, close dialog, refresh.

### Task 6: Deploy, verify production, and integrate branch

**Files:**
- Deploy Edge Functions from the verified feature commit.
- Merge `feat/product-image-grid18-v2` to `main` after verification.

**Interfaces:**
- Production grid worker remains `product-image-openai-grid18-v1` with `verify_jwt=false` and custom webhook auth.
- Admin function remains `admin-product-images-v1` with existing authenticated-user validation.
- Manual worker is `product-image-openai-v2` with custom webhook auth.

- [ ] **Step 1: Run all static tests**

Run the image automation/grid test scripts and require zero failures.

- [ ] **Step 2: Apply migration and deploy Edge Functions**

Deploy the verified files, preserving existing `verify_jwt` behavior because these worker functions use custom webhook auth and the Admin function validates the user JWT in-handler.

- [ ] **Step 3: Run security advisors**

Confirm the new dispatcher is not executable by `anon`/`authenticated`. Record unrelated pre-existing advisor findings separately.

- [ ] **Step 4: Runtime verify automatic drain**

Confirm cron remains active, next automatic batch is 18 items and `quality='medium'`, and a poor-source classification results in a manual-review flag rather than automatic force-individual fallback.

- [ ] **Step 5: Runtime verify manual path without spending unnecessarily**

Verify `generate_manual` wiring structurally and DB-side queue/dispatcher filters. Do not trigger a paid manual image unless a real Admin request is intentionally made through the UI.

- [ ] **Step 6: Merge verified feature branch to main**

Create/merge PR or fast-forward only after verification confirms the production behavior and tests.
