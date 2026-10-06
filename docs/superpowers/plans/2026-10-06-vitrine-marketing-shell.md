# Vitrine Marketing Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Vitrine Admin → Marketing use one four-tab shell and open Templates by default.

**Architecture:** `marketing-polish.js` owns the sole Marketing navigation and delegates tab changes to existing feature modules. Existing pages stop injecting their own navigation; their data and backend contracts remain unchanged.

**Tech Stack:** Browser JavaScript ES modules, existing Vitrine Admin CSS, Node.js contract scripts.

**Spec:** `docs/superpowers/specs/2026-10-06-vitrine-marketing-unified-module-design.md`

## Global Constraints

- Marketing has exactly one bar: Templates | Campanhas | Públicos | Consentimentos.
- Templates is the default view.
- Do not show Visão geral, Estratégia, Mais, or duplicate navigation inside Marketing.
- Do not expose WABA, Graph API, UUIDs, WAMIDs, snapshots, dispatches, or outbox details in normal UI.
- Preserve existing Admin authentication and all backend campaign and Meta gates.
- Use current Vitrine Admin typography, colors, controls, and responsive patterns.

## Review Focus

- Marketing root mounts after its async script: the shell still opens Templates once; test in `scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`.
- Legacy modules inject navigation after shell mount: only one bar remains; test by mounting all module enhancers in the same contract.
- Marketing section is reopened after navigating elsewhere: current tab is reflected without stale active styling; test shell transitions.
- Keyboard users change tabs: focus and active state stay visible; test accessible button semantics.
- Narrow viewport clips the tab bar: all four actions remain reachable; test in `scripts/test-whatsapp-marketing-papoai-responsive-v1.mjs`.

---

### Task 1: Canonical navigation and default route

**Files:**
- Modify: `vitrine/admin/marketing/marketing-polish.js`
- Modify: `vitrine/admin/marketing/marketing-polish.css`
- Modify: `vitrine/admin/marketing/campaign-entry.js`
- Modify: `vitrine/admin/marketing/template-center.js`
- Modify: `vitrine/admin/marketing/campaign-center.js`
- Modify: `vitrine/admin/marketing/audience-center.js`
- Test: `scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`

**Interfaces:**
- Consumes: existing module entrypoints `mountTemplateView(root)`, `mountCampaignView(root)`, `mountAudienceView(root)`, and `mountConsentView(root)`.
- Produces: one delegated tab dispatcher for `templates | campaigns | audiences | consents`; initial selection is `templates`.

- [ ] **Step 1: Update shell contract assertions**

Change the shell test to require exactly four views in the specified order, no overview/strategy/more controls, one nav element, and Templates selected when Marketing opens.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`  
Expected: FAIL on the current extra tabs and module-injected subnavs.

- [ ] **Step 3: Route all tabs through the existing shell controller**

Set the four-view list/labels in `marketing-polish.js`, default to Templates, and bind each tab to its existing module entrypoint. Update the Admin entry hook to trigger the default only when the Marketing root first appears, without reopening it on every MutationObserver event.

- [ ] **Step 4: Remove module-owned navigation insertion**

Update the template, campaign, and audience modules to render only their content and report the active view to the shared controller. Remove the fixed campaign gate badge from the nav; campaign availability remains explained by campaign actions.

- [ ] **Step 5: Run shell and responsive checks**

Run:
- `node scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`
- `node scripts/test-whatsapp-marketing-papoai-responsive-v1.mjs`
- `node --check vitrine/admin/marketing/marketing-polish.js`
- `node --check vitrine/admin/marketing/campaign-entry.js`

Expected: PASS; one shell remains after all modules are opened and reopened.

- [ ] **Step 6: Commit**

Commit: `ui: unify Vitrine Marketing navigation`

---

### Task 2: Remove retired navigation text and styling

**Files:**
- Modify: `vitrine/admin/marketing/marketing-polish.js`
- Modify: `vitrine/admin/marketing/marketing-polish.css`
- Modify: `scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`

**Interfaces:**
- Consumes: Task 1 tab dispatcher.
- Produces: no visible legacy Marketing Overview, Strategy, More, or duplicate campaign status copy.

- [ ] **Step 1: Add forbidden-copy assertions**

Assert the visible shell no longer contains the retired nav labels, repeated Marketing headings, or duplicate disabled-campaign messages.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`  
Expected: FAIL on remaining legacy shell content.

- [ ] **Step 3: Remove retired UI hooks**

Remove the old overview/strategy tab wiring and duplicate heading/gate cleanup only after the canonical dispatcher owns those routes. Leave unrelated Admin modules untouched.

- [ ] **Step 4: Run GREEN and commit**

Run: `node scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`  
Expected: PASS.

Commit: `ui: remove duplicate Marketing navigation`
