# Cloudflare Workers Free Deployment Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in the current branch.

**Goal:** Prepare the Admin in `site2` for a free Cloudflare Workers deployment sourced from GitHub.

**Architecture:** Keep Next.js 16 and its existing Node development path. Build the production Worker with `@opennextjs/cloudflare`, deploy with Wrangler, and let Cloudflare Workers Builds watch the selected GitHub branch.

**Tech Stack:** Next.js 16, OpenNext Cloudflare adapter, Wrangler, Cloudflare Workers Builds.

**Spec:** `docs/superpowers/specs/2026-10-27-cloudflare-workers-free-design.md`

## Global Constraints

- Use only the Cloudflare Workers Free plan; do not create or activate paid resources.
- Use repository `osvaldosereia/SUCEDOAN12`, branch `codex/whatsapp-admin-greenfield-20261026`, root directory `site2`.
- Keep Supabase ref `ssbesxgaijknwsjbsbcz`; do not change backend data or deploy backend functions.
- Keep all secret values out of Git and tool output.
- Keep `ADMIN_FISCAL_ISSUANCE_ENABLED` and `ADMIN_BLING_ORDER_RECOVERY_ENABLED` false by default.
- Do not send WhatsApp messages, write to Bling, or issue invoices.
- Do not add or run automated tests; use focused static/build verification only.

## Review Focus

- Cloudflare Worker config points at `.open-next/worker.js` and `.open-next/assets`.
- Cloudflare build and deploy commands are distinct, so the build is not repeated on deployment.
- Existing local `next dev` and normal `next build` scripts remain available.
- The admin Supabase browser key is provided at build time through Cloudflare, never through a committed file.
- The initial branch is not mistaken for `main` when setting up automatic deployment.

### Task 1: Add OpenNext and Wrangler deployment configuration

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Rename: `src/proxy.ts` to `src/middleware.ts` and rename the exported handler to `middleware`
- Create: `open-next.config.ts`
- Create: `wrangler.jsonc`
- Create: `cloudflare-env.d.ts` only if type generation requires it

- [x] Add `@opennextjs/cloudflare` and `wrangler` as development dependencies.
- [x] Add `build:cloudflare`, `deploy:cloudflare`, and `preview:cloudflare` scripts; keep current scripts unchanged.
- [x] Configure Worker `sucedoan12-admin`, OpenNext worker/assets paths, Node compatibility, and `workers.dev`.
- [x] Move the Supabase cookie-refresh handler to the deprecated but retained Edge Middleware convention; it only uses Web APIs, while Cloudflare OpenNext does not yet support Next.js 16 Node Proxy.
- [x] Run `pnpm typecheck` and an OpenNext production build; typecheck/build passed in Linux. The Windows packaging attempt failed only because the host blocks symlink creation.

### Task 2: Record the free hosting gate and setup values

**Files:**
- Modify: `docs/planning/implementation-ledger.md`
- Modify: `README.md` only if its deployment instructions need the Cloudflare setup path
- Spec and plan: the two files above

- [x] Correct the previous hosting note that treated Cloudflare as a rewrite; the verified OpenNext adapter supports the existing Next.js server features after the Edge Middleware adjustment.
- [x] Document Cloudflare Workers Builds settings: root `site2`, branch `codex/whatsapp-admin-greenfield-20261026`, build command `pnpm run build:cloudflare`, deploy command `pnpm run deploy:cloudflare`.
- [x] Document that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must be configured as Cloudflare build variables; Next.js embeds these public values in the server and client bundles.
- [x] Record the external gate: owner must connect Cloudflare and GitHub in Cloudflare dashboard; no account/API secrets are available to this checkout.

### Task 3: Verify repository state

**Files:** all changed deployment files.

- [x] Run `pnpm typecheck` and `git diff --check`.
- [x] Run the adapter preview locally in WSL; `GET /login` returned HTTP 200 with a fake public key and no production secrets.
- [x] Do not claim public availability until a Cloudflare deployment returns a working `workers.dev` URL and the login route responds; that deployment has not happened yet.
- [ ] After the owner connects Cloudflare, validate `/pedidos`, authenticated Server Actions, and representative admin reads/writes against the actual Free Worker. The local preview does not prove compliance with the Free 10 ms CPU ceiling.
