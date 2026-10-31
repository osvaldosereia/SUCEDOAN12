# SUPERSEDED — 28/10/2026

O plano de rota Cloudflare foi rejeitado. Não alterar nameservers ou DNS. Consulte `docs/superpowers/plans/2026-10-28-github-pages-static-admin.md`.


# Admin Dona Antônia em `/site2` — Implementation Plan

> **For agentic workers:** Execute this plan task by task in the current branch. Do not add or run automated tests; use static and build verification only.

**Goal:** Prepare the new Admin to run at `https://donaantonia.com.br/site2` while preserving the current GitHub Pages site and `/site/admin/`.

**Architecture:** Build the existing Next.js application with `basePath` set from `NEXT_PUBLIC_BASE_PATH=/site2`. A Cloudflare Worker serves only the `/site2*` route; the GitHub Pages origin continues to serve the rest of the domain.

**Tech Stack:** Next.js 16, OpenNext Cloudflare adapter, Wrangler, Cloudflare Workers Routes, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-27-admin-domain-subpath-design.md`

## Global Constraints

- Keep the current website and `site/admin/` intact.
- Do not change DNS or nameservers; the owner must migrate DNS only after preserving current records.
- Use the free Cloudflare Workers plan; no paid resources.
- Keep Supabase ref `ssbesxgaijknwsjbsbcz`; do not read or expose secrets.
- Do not modify Meta, Bling, production orders, or fiscal issuance.
- Do not create or run automated tests.

## Review Focus

- Missing path variable: local development keeps the root path.
- `/site2` without a trailing slash and nested routes: Cloudflare route pattern covers both.
- Login redirects, navigation, and Next assets: basePath remains `/site2` after client navigation.
- Existing `/` and `/site/admin/`: remain on GitHub Pages and outside the Worker route.
- DNS is not proxied through Cloudflare yet: do not add a zone route or claim the custom URL is live.

### Task 1: Build with the `/site2` base path

**Files:**
- Modify: `next.config.ts`
- Modify: `README.md`
- Create: this plan and the linked design
- Modify: `docs/planning/implementation-ledger.md`

- [x] Set `basePath` from `NEXT_PUBLIC_BASE_PATH`, defaulting to the current local root.
- [x] Document `/site2` as the Cloudflare build variable and the separate DNS/route gate.
- [x] Run `pnpm typecheck` and Linux OpenNext build/preview with the path variable and a dummy publishable Supabase key; `/site2/login` and its first CSS asset both returned HTTP 200.
- [x] Run `git diff --check`; do not run automated tests.
- [ ] Commit and push the changes to `codex/whatsapp-admin-greenfield-20261026`.

### Task 2: Attach the existing domain after owner DNS migration

- [ ] Owner adds the domain to Cloudflare and verifies all existing GitHub Pages, mail, and TXT records before changing nameservers at Registro.br.
- [ ] Once Cloudflare reports the zone active and DNS is proxied, add Worker route `donaantonia.com.br/site2*`.
- [ ] Verify `/site2/login` and authenticated Admin actions; verify `/` and `/site/admin/` still reach GitHub Pages.

This second task is blocked until the owner completes the DNS migration; do not substitute an unapproved change to live DNS.
