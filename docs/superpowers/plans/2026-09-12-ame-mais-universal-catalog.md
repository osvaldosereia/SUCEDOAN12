# Ame Mais Universal Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o Ame Mais para analisar qualquer tipo de artigo católico, gerar três imagens comerciais ultrarrealistas específicas por categoria, persistir toda a criação no Supabase e exibir um card de e-commerce funcional e reutilizável.

**Architecture:** Manter uma única Edge Function pública como orquestradora e separar a lógica pura em módulos testáveis: análise, roteamento de perfil visual, prompts, persistência e card model. O frontend continua estático/mobile-first, mas passa a renderizar uma galeria/card reutilizável a partir de `card_json`. O Supabase armazena dados estruturados nas tabelas e os arquivos no bucket `ame-mais`.

**Tech Stack:** HTML/CSS/ES modules, Node test runner, Supabase Edge Functions (Deno), Supabase Postgres/Storage, OpenAI Responses + Images Edits API, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-12-ame-mais-universal-catalog-design.md`

## Global Constraints

- Sem login, senha ou PIN.
- A chave OpenAI e o `service_role` nunca aparecem no navegador.
- Toda criação tem exatamente 3 slots: `hero`, `lifestyle`, `detail`.
- Não usar mais imagem principal com fundo cinza.
- Imagens quadradas 1024×1024, geração `low`, aparência ultrarrealista e validação visual.
- Logo exclusiva: Ame+ Store fornecida pelo usuário.
- Devoção abaixo de 90% de confiança não entra como certeza.
- Persistir foto original, análise, conflitos, prompts, validações, três imagens e `card_json`.
- Tabelas públicas permanecem com RLS e sem escrita direta por `anon`/`authenticated`; Edge Function usa service role.

---

### Task 1: Testes do roteamento universal e modelo de card

**Files:**
- Modify: `tests/ame-mais-core.test.mjs`
- Modify: `supabase/functions/ame-mais-analyze-v1/core.mjs`
- Modify: `ame-mais/app-core.mjs`

**Interfaces:**
- Produces: `normalizeProductType(type) -> string`
- Produces: `getSceneProfile(analysis) -> {profile_key:string, scenes:Array<{kind,title,prompt}>}`
- Produces: `buildRunCardModel(run, logoUrl) -> CardModel`

- [ ] **Step 1: Write failing tests for type normalization and scene profiles**

Add tests asserting:
```js
assert.equal(normalizeProductType('Terço'), 'terco_rosario');
assert.equal(normalizeProductType('rosário'), 'terco_rosario');
assert.equal(normalizeProductType('camiseta católica'), 'camiseta');
assert.equal(normalizeProductType('estátua de santo'), 'estatua_imagem');
assert.equal(normalizeProductType('quadro religioso'), 'quadro');
assert.equal(normalizeProductType('chaveiro'), 'chaveiro');
assert.equal(normalizeProductType('vela'), 'generico');
```

Add tests asserting every profile yields exactly `hero`, `lifestyle`, `detail`, and that terço prompts contain hand/use/close-up intent while camiseta/statue/quadro/chaveiro have their own scene wording.

- [ ] **Step 2: Run tests and verify RED**

Run:
```bash
node --test tests/ame-mais-core.test.mjs
```
Expected: FAIL because routing/card functions do not exist yet.

- [ ] **Step 3: Implement minimal routing and card model**

In `core.mjs`, implement a deterministic keyword router with normalized accents/lowercase and a scene registry. In `app-core.mjs`, implement `buildRunCardModel` returning logo, gallery, active image, names, descriptions, attributes, terms, conflicts and confidence.

- [ ] **Step 4: Run tests and verify GREEN**

Run:
```bash
node --test tests/ame-mais-core.test.mjs
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/ame-mais-core.test.mjs supabase/functions/ame-mais-analyze-v1/core.mjs ame-mais/app-core.mjs
git commit -m "feat(ame-mais): add universal scene profiles"
```

---

### Task 2: Persistência completa no Supabase

**Files:**
- Create: `supabase/migrations/20260912_ame_mais_universal_catalog_v2.sql`
- Modify: `supabase/functions/ame-mais-analyze-v1/index.ts`

**Interfaces:**
- Table: `public.ame_mais_images`
- Expanded columns on `public.ame_mais_runs`: `scene_profile`, `conflicts`, `observations`, `prompts`, `card_json`

- [ ] **Step 1: Write schema verification SQL before migration**

Run a query against `information_schema.columns` and `to_regclass('public.ame_mais_images')` proving the new schema does not yet exist.

- [ ] **Step 2: Apply schema migration**

Migration must:
```sql
alter table public.ame_mais_runs
  add column if not exists scene_profile text,
  add column if not exists conflicts jsonb not null default '[]'::jsonb,
  add column if not exists observations jsonb not null default '[]'::jsonb,
  add column if not exists prompts jsonb not null default '{}'::jsonb,
  add column if not exists card_json jsonb not null default '{}'::jsonb;

create table if not exists public.ame_mais_images (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ame_mais_runs(id) on delete cascade,
  kind text not null check (kind in ('hero','lifestyle','detail')),
  title text not null,
  prompt text not null,
  image_url text,
  storage_path text,
  status text not null default 'pending',
  validation jsonb not null default '{}'::jsonb,
  model text,
  quality text,
  size text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, kind)
);

alter table public.ame_mais_images enable row level security;
revoke all on public.ame_mais_images from anon, authenticated;
```

Keep `ame_mais_runs` RLS and direct browser access closed.

- [ ] **Step 3: Verify schema**

Query columns, constraints, RLS state, and grants. Expected: table exists; exactly 3 allowed kinds; anon/authenticated have no table privileges.

- [ ] **Step 4: Update backend persistence**

`analyze` must save scene profile, conflicts, observations and all three prompts, then pre-create/upsert the three `ame_mais_images` rows as `pending`.

`generate_image` must update the matching row through `generating` → `validating` → `completed` or `rejected`, storing URL/path/validation/attempt count.

When all three rows are completed, construct and save `card_json` and set the run `completed`.

- [ ] **Step 5: Commit migration and backend changes**

```bash
git add supabase/migrations/20260912_ame_mais_universal_catalog_v2.sql supabase/functions/ame-mais-analyze-v1/index.ts
git commit -m "feat(ame-mais): persist universal catalog runs"
```

---

### Task 3: Logo Ame+ Store como ativo oficial

**Files:**
- Create: `ame-mais/assets/logo-ame-store.jpg`
- Modify: `ame-mais/index.html`
- Modify: `ame-mais/styles.css`

**Interfaces:**
- Produces browser path: `./assets/logo-ame-store.jpg`

- [ ] **Step 1: Add the exact user-supplied logo asset**

Create a Git blob from the supplied JPEG bytes and attach it at `ame-mais/assets/logo-ame-store.jpg` without redraw or reinterpretation.

- [ ] **Step 2: Replace textual/placeholder branding**

Update header/card markup so the only brand visual is the supplied Ame+ Store logo at the upper left.

- [ ] **Step 3: Verify asset and responsive layout**

Check repository path exists and CSS constrains width/height without cropping or distortion.

- [ ] **Step 4: Commit**

```bash
git add ame-mais/assets/logo-ame-store.jpg ame-mais/index.html ame-mais/styles.css
git commit -m "feat(ame-mais): use official Ame Store logo"
```

---

### Task 4: Backend scene generation for all product types

**Files:**
- Modify: `supabase/functions/ame-mais-analyze-v1/core.mjs`
- Modify: `supabase/functions/ame-mais-analyze-v1/index.ts`
- Modify: `tests/ame-mais-core.test.mjs`

**Interfaces:**
- `generate_image` accepts only `hero`, `lifestyle`, `detail`.
- Uses `getSceneProfile(analysis)` for prompt selection.

- [ ] **Step 1: Add failing regression tests for exactly three scenes and no gray-background prompt**

Tests must ensure no current scene prompt contains `#ECECEC` or asks for plain gray background, and every supported category yields exactly three prompts.

- [ ] **Step 2: Run tests and verify RED**

Run `node --test tests/ame-mais-core.test.mjs` and confirm old principal/ambientada/detalhe assumptions fail.

- [ ] **Step 3: Replace old image kinds and prompt selection**

Map old `principal/ambientada/detalhe` to new `hero/lifestyle/detail` only for new runs; new generation uses category profiles. Keep validation thresholds: hero highest, lifestyle/detail slightly lower.

Image edit request remains:
```text
size=1024x1024
quality=low
output_format=webp
```

Prompts explicitly demand ultra-realistic lighting, physically plausible materials, sharp natural textures and product fidelity.

- [ ] **Step 4: Run tests and verify GREEN**

Run all Ame Mais tests; expected zero failures.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ame-mais-analyze-v1/core.mjs supabase/functions/ame-mais-analyze-v1/index.ts tests/ame-mais-core.test.mjs
git commit -m "feat(ame-mais): generate three category-aware product scenes"
```

---

### Task 5: Functional e-commerce simulation card

**Files:**
- Modify: `ame-mais/index.html`
- Modify: `ame-mais/app.js`
- Modify: `ame-mais/app-core.mjs`
- Modify: `ame-mais/styles.css`
- Test: `tests/ame-mais-core.test.mjs`

**Interfaces:**
- Consumes: `buildRunCardModel` and backend `card_json`.

- [ ] **Step 1: Add failing tests for card gallery**

Test model contains exactly three ordered image slots and identifies `hero` as initial active image.

- [ ] **Step 2: Run tests and verify RED**

Run Node tests; expect failure until model/render contract is implemented.

- [ ] **Step 3: Implement card UI**

Card must include:
- Ame+ Store logo top-left;
- large square active image;
- three clickable thumbnails;
- product name;
- commercial description;
- compact attributes;
- expandable technical/catalog section;
- download active image;
- download each image;
- copy name;
- copy commercial description;
- WhatsApp share;
- `run_id` reference.

All controls must be finger-friendly on narrow mobile screens.

- [ ] **Step 4: Wire processing timeline to new step names**

Show real steps including `choosing_scene_profile`, `generating_hero`, `validating_hero`, `saving_hero`, then lifestyle/detail and `building_card`.

- [ ] **Step 5: Verify tests**

Run Node test suite and `node --check` on frontend JS modules.

- [ ] **Step 6: Commit**

```bash
git add ame-mais/index.html ame-mais/app.js ame-mais/app-core.mjs ame-mais/styles.css tests/ame-mais-core.test.mjs
git commit -m "feat(ame-mais): add functional storefront simulation card"
```

---

### Task 6: Reopen saved creations

**Files:**
- Modify: `supabase/functions/ame-mais-analyze-v1/index.ts`
- Modify: `ame-mais/app.js`

**Interfaces:**
- Backend action `get_run(session_id)` returns run + image rows + card_json.
- Frontend supports URL query `?run=<uuid>`.

- [ ] **Step 1: Implement backend `get_run`**

Return 404 `run_not_found` for missing ids; never expose service credentials or raw secret values.

- [ ] **Step 2: Add frontend load-by-run behavior**

On page load, if `run` is present, request saved creation and render the complete card/history without requiring a new photo.

- [ ] **Step 3: Verify with an inserted non-secret fixture row**

Create a temporary run + 3 fixture image rows with safe placeholder URLs, call `get_run`, verify response shape, then delete fixture.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ame-mais-analyze-v1/index.ts ame-mais/app.js
git commit -m "feat(ame-mais): reopen saved product creations"
```

---

### Task 7: Deploy and end-to-end verification

**Files:**
- Modify if needed: immutable Edge Function wrapper/deploy ref

- [ ] **Step 1: Deploy Edge Function**

Deploy `ame-mais-analyze-v1` with `verify_jwt=false` because the user explicitly requires no login and the body enforces origin/rate-limiting while using service role server-side only.

- [ ] **Step 2: Verify health path without OpenAI spend**

Send an invalid-form or status request and confirm the response is no longer `server_config` and CORS works from allowed origins.

- [ ] **Step 3: Run full local test suite**

```bash
node --test tests/ame-mais-core.test.mjs
node --check ame-mais/app.js
node --check ame-mais/app-core.mjs
```
Expected: exit code 0 for all.

- [ ] **Step 4: Verify Supabase security advisors**

Run security advisors and confirm no new WARN/ERROR is attributable to the Ame Mais changes. Existing unrelated project warnings are reported separately rather than falsely claimed fixed.

- [ ] **Step 5: Verify GitHub Pages deploy**

Confirm latest Pages workflow completes successfully for the final commit.

- [ ] **Step 6: Run one real end-to-end product creation**

Use a known test photo, confirm:
- original saved;
- analysis saved;
- scene profile selected;
- 3 image rows created;
- all 3 generated or failures are explicitly visible/retryable;
- card_json saved;
- `?run=<id>` reopens the creation;
- downloads work.

- [ ] **Step 7: Final evidence report**

Report exact function version, migration, final commit, test counts, run id used for verification and any remaining known limitations.
