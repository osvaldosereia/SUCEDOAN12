# WhatsApp Flow Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Manage Dona Antônia WhatsApp Flows from Vitrine Admin using its existing authenticated Meta connection.

**Architecture:** Add Flow-specific Graph API helpers and authenticated actions to the existing admin-whatsapp-templates-v1 endpoint. Add a lazy Marketing subview beside Templates; browser code uses the existing Admin bearer session and never sees the Meta token. The backend resolves the WABA and phone-number ID from the fixed active account dona-antonia-1018.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), shared JavaScript modules, Vitrine Admin ES modules, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-10-24-whatsapp-flow-admin-design.md

## Global Constraints

- Flow management is pinned to channel 1018; the number ending 0975 is never used.
- Canary messaging, when available, is 1018 to 8360 through the existing Lab.
- Reuse META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_GRAPH_VERSION, Admin session authorization, and admin-whatsapp-templates-v1.
- Keep private keys, Meta app secrets, session secrets, and Flow state server-side.
- No production messages, automatic orders, or edits to the commercial Attendance UI.
- Do not deploy or use an alternate credential path while the prior security block remains.

## Review Focus

- Wrong channel or user-supplied WABA/phone ID — server pins and tests reject it.
- Invalid or oversized Flow JSON — server rejects it before Graph API.
- Meta validation errors or missing endpoint — publish action remains blocked.
- Missing key/session configuration — sanitized readiness state, no secret values returned.
- Token/Meta errors — returned as bounded error codes without tokens or request bodies.

---

### Task 1: Flow Graph API helpers and backend authorization

**Files:**
- Create: supabase/functions/_shared/whatsapp-meta-flows-v1.mjs
- Modify: supabase/functions/admin-whatsapp-templates-v1/index.ts
- Test: scripts/test-whatsapp-meta-flows-v1.mjs
- Test: scripts/test-whatsapp-flow-admin-api-v1.mjs

**Interfaces:**
- Helpers accept access token, Graph version, server-resolved WABA/phone IDs, and an injected fetch implementation for tests.
- Admin actions accept a Flow ID and Flow JSON only; WABA and phone IDs remain server-resolved.

- [ ] Add failing unit tests for list, create, asset upload, endpoint update, encryption key registration, validation, publish gating, and token-redaction behavior.
- [ ] Run the focused tests and confirm they fail before implementation.
- [ ] Implement fixed-1018 authenticated actions and Graph helpers.
- [ ] Run the focused tests and existing template API tests.

### Task 2: Marketing Flows view

**Files:**
- Create: vitrine/admin/marketing/flow-center.js
- Create: vitrine/admin/marketing/flow-center.css
- Modify: vitrine/admin/marketing/template-center.js
- Modify: vitrine/admin/marketing/marketing-polish.js
- Test: scripts/test-whatsapp-flow-center-ui-v1.mjs

- [ ] Add a Flows navigation item beside Templates.
- [ ] Implement list, draft creation, JSON upload, endpoint/key setup, Meta validation report, and guarded publish/delete actions.
- [ ] Keep the existing test-send path in the Lab and show the 1018 to 8360 restriction.
- [ ] Run UI syntax, security, and routing tests.

### Task 3: CI and operational handoff

**Files:**
- Modify: .github/workflows/whatsapp-meta-central-ci.yml
- Modify: vitrine/admin/whatsapp-lab/meta-flow/DYNAMIC-IMPLEMENTATION.md

- [ ] Add focused manager tests to CI.
- [ ] Document the Admin path and the exact secret readiness booleans without exposing secret values.
- [ ] Open a PR, verify focused CI, and merge only through the normal GitHub path.
- [ ] Recheck deployed functions; leave deployment and live Meta actions untouched if security controls deny them.
