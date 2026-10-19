# Marketing workspace design

## Goal

Make the Marketing area behave like a focused CRM workspace: every primary tab opens its own content, templates expose Meta lifecycle state, and follow-up actions remain human initiated.

## Approved structure

- Primary navigation: **Visão geral**, **Pós-venda**, **Reposição mensal**, **Templates Meta**, **Campanhas**. Secondary tools remain in **Mais**: **Públicos**, **Consentimentos**, **Estratégia**.
- Overview: channel/runtime state, counts by template and campaign status where the existing APIs provide them, monthly automation state, and working shortcuts for campaign and template creation.
- Pós-venda: delivered orders only; filter by period, WhatsApp channel, and order follow-up state when the data supports that state; show order/customer/delivery details and links to the order and conversation. The user must explicitly confirm a manual follow-up. The confirmation names the actual delivery-feedback message and the additional consent request. A UI must never mark a message sent without a server receipt.
- Reposição mensal: use existing purchase-cadence records; allow recalculation and open the manual campaign composer. The cadence page must say when its cohort is not carried into the campaign draft. Do not expose a monthly automation activation control.
- Templates Meta: channel, search, status, category, and language filters; display Meta status, quality, last sync, and rejection reason. Meta remains the source of approval state.
- Campanhas: draft, snapshot, recipient review, review, and execution status. Enforce consent, valid phone, opt-out, deduplication, and the approved manual limit of 10 recipients per cycle. Do not permit scheduled or automated sends.
- Mais: public segments, consent records, and strategy tools remain available without crowding the primary workflow.

## Constraints

- Support WhatsApp channels **0975** and **1018**.
- Preserve the explicit opt-in and opt-out records; purchases and conversations do not imply consent.
- Do not send messages or enable an automation as part of implementation or testing.
- Use authenticated admin APIs for customer/order data. Do not report unknown delivery-message history as a sent or unsent state.

## Reference patterns

- Klaviyo separates flows by lifecycle status and supports filtering/search.
- HubSpot separates campaign management from segment criteria and supports saved campaign views.
- Meta's WABA API is the source of WhatsApp template states and approval webhooks.

## Scope note

This implementation is limited to safe, evidence-backed UI wiring and existing authenticated read APIs. If the current backend does not expose the history needed to show a follow-up status, the UI presents that status as unavailable and does not invent one.
