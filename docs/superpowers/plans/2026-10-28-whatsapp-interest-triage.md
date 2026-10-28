# WhatsApp Interest Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an **Interessados · 48h** queue that automatically moves conversations to **Pedidos · 28h** when they meet the approved direct-order or website-order criteria.

**Architecture:** Keep classification in the existing `site-admin-v1` Edge Function. Derive interest and direct-order conversation sets from recent inbound messages, combine them with linked site orders and existing per-admin overrides, and return display labels to the current Admin. Refresh the CRM queues every 60 seconds only while the page is visible and one of those queues is selected.

**Tech Stack:** Existing Deno Edge Function, Supabase Postgres, static Admin JavaScript and CSS.

**Spec:** [`docs/superpowers/specs/2026-10-28-pedidos-diretos-whatsapp-design.md`](../specs/2026-10-28-pedidos-diretos-whatsapp-design.md)

## Global Constraints

- Keep **Pedidos** at 28 hours and **Interessados** at 48 hours.
- Classify interests with broad, deterministic Portuguese text signals; some false positives are acceptable.
- Require an explicit buying commitment plus a transaction detail for direct chat orders.
- A site or direct chat order takes precedence over interest.
- Preserve manual include/exclude controls.
- Do not create order rows, send messages, create Bling notes, add a schema, or call an external model.
- Do not add or run tests unless asked; verify by reviewing committed source and deployment status.

## Review Focus

- Generic greetings or unrelated messages must not qualify as interest solely due to common words.
- A site order matched by conversation, phone, or customer must appear in Pedidos and be excluded from Interessados.
- A direct chat order must appear in Pedidos and no longer appear in Interessados.
- Manual inclusion/exclusion must continue to override automatic order classification.
- Background refresh must run only for visible CRM tabs and must not change the selected conversation.

---

### Task 1: Derive CRM classifications in the Edge Function

**Files:**
- Modify: `supabase/functions/site-admin-v1/index.ts`

**Interfaces:**
- Add `recentInterestConversationIds(conversationIds?: string[]): Promise<Set<string>>` for inbound messages in the last 48 hours.
- Refactor recent order detection to expose site-order, direct-chat-order, and effective order membership separately.
- Extend `whatsappConversationList(input)` to accept `quick_filter: "interested"`, return `is_interested`, and return an order-origin label for site, WhatsApp, or manual inclusion.

- [ ] Recognize interest signals in recent inbound messages for product, price, availability, variant, delivery/collection, or explicit buying intent; avoid greeting-only matches.
- [ ] Recognize a direct order only when a customer commitment signal and a transaction-detail signal both occur in the recent conversation.
- [ ] Apply order precedence and manual overrides before filtering the 48-hour interest set.
- [ ] Keep list totals, pagination, and existing order-button state consistent for both CRM queues.
- [ ] Review the final helper and filter code for the five Review Focus cases without running tests.

### Task 2: Add the interest queue and automatic movement in Admin

**Files:**
- Modify: `site/admin/whatsapp-conversations.js`
- Modify: `site/admin/index.html`
- Modify: `site/admin/admin.css`

**Interfaces:**
- Add a `data-conversation-view="interested"` tab and send the corresponding `quick_filter`.
- Render concise origin/interest labels from the fields returned by Task 1.
- Use the existing manual order override action to keep include/exclude behavior.

- [ ] Add the **Interessados · 48h** tab and cache-bust the changed files.
- [ ] Show whether a queued order came from the site, WhatsApp, or manual inclusion.
- [ ] Remove a manually included conversation from the interest list immediately.
- [ ] Recalculate the selected CRM queue every 60 seconds when `document.visibilityState === "visible"`; pause polling on other tabs/hidden pages and preserve the selected conversation.
- [ ] Review the UI event flow and CSS selectors after the update without running tests.

### Task 3: Deploy and verify the published source

**Files:**
- No additional files.

- [ ] Deploy the updated `site-admin-v1` Edge Function with its existing shared dependencies and JWT setting.
- [ ] Read back the changed GitHub files, confirm the function is active, and confirm the GitHub Pages build for the final Admin commit succeeded.
- [ ] Report the exact queue behavior, refresh interval, and any verification limits.
