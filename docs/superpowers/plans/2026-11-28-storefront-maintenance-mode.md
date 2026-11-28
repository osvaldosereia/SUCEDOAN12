# Storefront Maintenance Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let an authenticated admin pause and reopen the public Dona Antônia storefront without blocking the Admin.

**Architecture:** Store one private maintenance flag in Supabase. A dedicated Edge Function exposes a read-only public status and requires the existing admin code for all writes. The storefront checks that status before revealing its page; the admin control is placed first on Visão geral.

**Tech Stack:** Supabase Postgres and Edge Functions, static HTML/CSS/JavaScript, GitHub Pages.

**Spec:** User request in the conversation: add a top-level control to the Admin homepage to enable and disable storefront maintenance.

## Global Constraints

- Initial state is off.
- Keep the Admin route available in maintenance mode.
- Expose only the enabled boolean publicly.
- Require the existing admin code to change the setting.
- Enable RLS and revoke table access from public browser roles.
- On public status lookup errors, keep the storefront available.

## Review Focus

- Public status lookup or database failure: fail open and show the storefront.
- Maintenance enabled: hide the customer storefront and show a clear notice.
- Maintenance disabled: restore the storefront after a no-cache lookup.
- Admin code missing or invalid: reject writes.
- Mobile admin layout: keep status and toggle usable.

## Tasks

### Task 1: Store state and expose a safe control API

**Files:** Create `supabase/migrations/20261128121421_storefront_maintenance_mode_v1.sql`; create `supabase/functions/site-maintenance-v1/index.ts`; modify `supabase/config.toml`.

**Verification:** Confirm the seeded state is disabled, RLS is enabled, browser roles have no table grants, and the function deployment is active.

### Task 2: Add the Admin control

**Files:** Modify `site/admin/index.html`, `site/admin/admin.css`, and `site/admin/admin.js`.

**Verification:** Confirm the control is at the top of Visão geral, reports the current state, confirms activation, and supports retry when status cannot be loaded.

### Task 3: Gate the public storefront

**Files:** Modify `site/index.html`; create `site/maintenance.js`.

**Verification:** Confirm the maintenance notice is shown only when enabled; lookup failure restores the storefront; the Admin remains outside the gate.

## Implementation Notes

No test suite is added or run for this request. Verify database state, deployed function status, and the final GitHub diff.
