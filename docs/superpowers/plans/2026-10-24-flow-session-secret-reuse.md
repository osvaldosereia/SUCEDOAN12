# Flow Session Secret Reuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** Remove the extra `DA_FLOW_1018_SESSION_SECRET` requirement while preserving signed canary state.

**Architecture:** Derive a dedicated HMAC session key from the existing server-side `META_WHATSAPP_APP_SECRET` using a fixed Flow-specific context string. Keep the RSA private key as the only new secret; retain all 1018→8360 canary checks.

**Tech Stack:** Supabase Edge Functions (Deno), JavaScript modules, Node assertion scripts.

**Spec:** `docs/superpowers/specs/2026-10-24-whatsapp-flow-admin-design.md`

## Global Constraints

- Keep all Meta credentials server-side.
- Keep the commercial number fixed to 1018 and canary recipient fixed to 8360.
- Do not use 0975, send to customers, create orders, or change inventory.
- Keep the Flow unpublished until cryptographic readiness and official validation gates pass.
- Never expose secrets in source, logs, or responses.

## Review Focus

- A missing or short Meta app secret must keep signing and Flow exchange unavailable.
- The Admin and endpoint must derive the same session key from the same app secret.
- Publish readiness must still require the RSA private key, matching registered public key, endpoint, validation, and Meta app secret.
- No runtime code, readiness UI, or documentation should require a separate session secret.

---

### Task 1: Reuse the existing Meta app secret for Flow state signing

**Files:**
- Modify: `supabase/functions/_shared/whatsapp-flow-session-v1.mjs`
- Modify: `supabase/functions/_shared/whatsapp-meta-flows-v1.mjs`
- Modify: `supabase/functions/admin-whatsapp-templates-v1/index.ts`
- Modify: `supabase/functions/whatsapp-1018-basket-flow-v1/index.ts`
- Modify: `vitrine/admin/marketing/flow-center.js`
- Modify: `vitrine/admin/whatsapp-lab/meta-flow/DYNAMIC-IMPLEMENTATION.md`
- Modify: `scripts/test-whatsapp-meta-flows-v1.mjs`
- Modify: `scripts/test-whatsapp-meta-flow-manager-admin-v1.mjs`

**Interfaces:**
- Produce `deriveFlowSessionKey(appSecret: string): Promise<string>`.
- Continue to sign and verify state with the derived key in both Admin and Flow endpoint.

- [x] Write a test proving deterministic, context-separated derivation from the existing app secret.
- [x] Run it and confirm it fails because the derivation function is absent.
- [ ] Implement derivation, remove the extra environment variable from all Flow paths and publish gates.
- [ ] Run the Flow crypto/API and Admin manager tests.
- [ ] Update implementation documentation and commit.
