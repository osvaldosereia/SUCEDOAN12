# Meta Channel Configuration Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the two registered Meta WhatsApp channels and their persisted entry, sending, ANA, and homologation configuration in Settings without presenting it as a live health check.

**Architecture:** Keep the Settings page as a Server Component. Read the existing attendance-account projection and ANA channel projection in parallel, join only by exact account UUID, and render a minimal safe projection. Preserve Bling and Supabase cards.

**Tech Stack:** Next.js App Router, TypeScript, existing Supabase server adapters, Biome.

**Spec:** `docs/superpowers/specs/2026-10-27-meta-channel-configuration-design.md`.

## Global Constraints

- Canonical Supabase is `ssbesxgaijknwsjbsbcz`.
- Never expose credentials, raw configuration, full phone numbers, or private payloads.
- Configuration flags and historical homologation timestamps are not live Meta health.
- Do not call Graph API, send messages, mutate Supabase, publish Flows, or change Bling.
- Do not add or run automated tests.

## Review Focus

- Attendance list unavailable: show a concise source-specific unavailable state and no false zero.
- ANA projection unavailable: keep registered account visible but show channel configuration unavailable.
- Exact account UUID missing from ANA projection: show “Configuração não encontrada”; never join on display name or phone suffix.
- Historical homologation timestamp present: label it as a recorded event, never as currently healthy/connected.
- Full phone number or `rawConfiguration` accidentally serialized: reject the change in review.

---

### Task 1: Render persisted configuration for each account

**Files:**
- Modify: `src/app/(admin)/configuracoes/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consume `getAttendanceAccounts(): Promise<GatewayResult<AttendanceAccount[]>>`.
- Consume `loadAnaAdmin(): Promise<AnaAdminLoad>` and use only `view.channels`.
- Join a channel by exact, case-insensitive UUID equality between `AttendanceAccount.id` and `AnaAdminChannel.id`.

- [x] Query both sources in parallel with the existing Bling readiness query; catch a rejected source independently.
- [x] Render account name and a masked phone suffix; show entry, manual send, ANA, and recorded-homologation states from the matching channel projection, and flag a count other than two.
- [x] Render separate unavailable/missing-configuration copy and explicitly state that Meta Graph, webhook delivery, and Flow publication/rendering are not probed.
- [x] Change the ANA page label from “homologado” to “homologação registrada” for timestamp-only evidence.
- [x] Run `pnpm typecheck`, `pnpm exec biome check 'src/app/(admin)/configuracoes/page.tsx' 'src/app/(admin)/ana/page.tsx'`, and `git diff --check`.
