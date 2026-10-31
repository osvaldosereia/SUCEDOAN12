# WhatsApp Flow product-and-quantity screen — implementation plan

> **For agentic workers:** use `superpowers:executing-plans` inline. Produce only local, unpublished artifacts. This candidate has not passed the current Meta Flow Validator.

**Goal:** Show every available product photo, collect its quantity `0–6` on the same position screen, and move forward only after the customer taps **Próximo**.

**Architecture:** Reuse `BASKET_PRODUCT` for each ordered basket position. One `Form` combines a photo-backed `RadioButtonsGroup`, required quantity `Dropdown` (`0–6`) and **Próximo** footer. The radio selection uses `on-select-action`/`data_exchange` to clear a stale quantity immediately if the product changes; the footer repeats the comparison before advancing. Meta's official components reference confirms images in radio data sources for Flow JSON 5.0+; the candidate uses JSON 7.3. The Flow JSON reference shows `data_api_version="3.0"` as current, and the endpoint protocol uses the session's matching request version; optional `flow_token_signature` requires API 4.0 and remains a separately gated upgrade.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), WhatsApp Flow JSON 7.3/Data API 3.0 candidate; official Meta Flow Validator still required before binding.

**Spec:** `docs/superpowers/specs/2026-10-27-whatsapp-basket-flow-design.md`

## Global Constraints

- Every active alternative must have a photo that is visibly associated with that product before selection; do not downgrade to text-only choices.
- Quantity is a single value from `0` through `6`; zero means that basket position contributes no units.
- The whole basket cannot advance to payment when every quantity is zero.
- Historical JSON is a design clue only. Current official Meta docs and Validator per WABA govern component and version compatibility.
- Do not copy old implementation code or Flow JSON. Do not publish, deploy, send messages, modify remote schema, or write to Bling.
- Do not add or run automated tests in this slice; review static artifacts and document the lack of runtime/Validator proof.

## Review Focus

- Every product option in the RadioButtonsGroup carries its own Base64 image and matching `alt-text`, name and price.
- **Próximo** submits product ID and quantity together. The server checks the product belongs to the current position and records only the selection in the session snapshot.
- Back navigation must preserve prior position choices and allow editing without changing server-authoritative product or price data. On the edited screen, switching to a different product clears the quantity and requires a new choice before **Próximo** can advance.
- Quantity `0` must not appear in the final order summary; an all-zero basket stays on `BASKET_PRODUCT` before payment.
- A customer-session lookup in review must never expose a new-customer registration path.

---

### Task 1: Align Data Exchange screen state with photo-backed product and quantity selection

**Files:**
- Modify: `supabase/functions/whatsapp-flow-data-exchange-v1/index.ts`
- Modify: `supabase/functions/_shared/flow-encryption.ts`
- Modify: `docs/superpowers/specs/2026-10-27-whatsapp-basket-flow-design.md`

**Interfaces:**
- `INIT` → `BASKET_PRODUCT` with `product_options` (radio data source), `quantity_options` (dropdown data source), prior `selected_items`, position progress label and an empty validation message.
- `RadioButtonsGroup.on-select-action` sends `component_action="product_changed"`, current product, baseline product, quantity and prior `selected_items`; the server immediately clears the quantity if the product changed. The footer retains a server-side comparison fallback and sends `component_action="next"` before advancing.
- An explicit previous-position action sends `component_action="back"` and `selected_items`; payment back → last `BASKET_PRODUCT`.
- If Meta sends `flow_token_signature`, validate its HS256 JWT and exact flow-token claim against the App Secret for the WABA.

- [x] Return image-backed `RadioButtonsGroup` options (`id`, `title`, `description`, `enabled`, `image`, `alt-text`) and quantity `0–6` options from one `BASKET_PRODUCT` screen response.
- [x] Validate selected product/quantity and advance to the next position from the same screen; keep server snapshot authoritative.
- [x] Preserve the all-zero basket guard, existing customer-review gate and previous-position data exchange.
- [x] Compare the product initially shown with the selected product; when they differ, return the same screen with the new product selected and quantity blank, requiring an explicit new quantity choice.
- [x] Clear the quantity as soon as a different product is selected through Flow `on-select-action`; keep the footer fallback if an action is skipped or malformed.
- [x] Remove `version` from Data Endpoint response objects; official response shape uses `screen` and `data`.
- [x] Verify optional `flow_token_signature` HS256 JWT when Meta includes it, using the account-specific App Secret.

### Task 2: Add a candidate Flow JSON

**Files:**
- Create: `supabase/flows/basket-order-v1.json`
- Modify: `docs/superpowers/specs/2026-10-27-whatsapp-basket-flow-design.md`

**Interfaces:**
- Screens: `BASKET_PRODUCT`, `PAYMENT`, `CUSTOMER_ADDRESS`, `CUSTOMER_NEW_ADDRESS`, `CUSTOMER_REVIEW`, `ORDER_REVIEW`.
- Candidate JSON/API versions `7.3`/`3.0`, matching the current Flow JSON reference and explicit Data Endpoint request contract. Data API 4.0 is required only for the optional `flow_token_signature` improvement; confirm an upgrade with official Validator before binding either WABA.

- [x] Declare all screen data returned by the Edge Function, with Flow-compatible scalar/object/array types and examples.
- [x] Add routing for current position → next position/payment, payment → saved-address/new-address/review, saved address → new address/order review, new address → order review, and both terminal screens.
- [x] Keep `CUSTOMER_REVIEW` terminal and non-commercial; intake stores a correlated `needs_review` intent without quote/customer/address/order writes or confirmation dispatch, and Atendimento labels it as human review.
- [x] Ensure the order-review complete payload matches the existing `normalizeFlowSubmission` contract: `flow_session_id`, `selected_items`, payment, customer/address, `total_cents`, and `delivery_address_text`.
- [x] Keep nullable intake fields schema-safe: use empty ID strings and an empty address object for saved-address orders; the new-address screen uses typed strings and the intake normalizes optional empty values.

### Task 3: Record the evidence and release gate

**Files:**
- Modify: `docs/planning/implementation-ledger.md`
- Modify: `docs/superpowers/specs/2026-10-27-whatsapp-basket-flow-design.md`

- [x] Record that historical V2 is a design clue, not authority; link the official Meta component, version, endpoint-security and example references.
- [x] Record that no automated tests, remote migration, Edge deploy, Flow publication, Meta message, or Bling write occurred in this slice.

**Validation:** Biome check passed on the Edge Function and Flow JSON; Node parsed the JSON and confirmed JSON/API `7.3`/`3.0` with six screens; `git diff --check` had no whitespace errors (Git reports existing LF/CRLF normalization notices). No automated tests were added or run, and no Deno runtime compiler or Meta Validator was available in this slice. Do not describe the candidate as valid or publishable until the exact JSON/data API version passes Meta's current Validator and visual checks on both WABAs.

**Selection-action evidence:** the official [WhatsApp Flows Tools repository issue](https://github.com/WhatsApp/WhatsApp-Flows-Tools/issues/1) contains a `CheckboxGroup.on-select-action` example using `data_exchange`. The official components page returned HTTP 429 during this review, so exact `RadioButtonsGroup` acceptance in the current 7.3 Validator remains a release gate.
