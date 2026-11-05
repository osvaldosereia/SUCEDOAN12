# WhatsApp Flow state guards — implementation plan

> **For agentic workers:** use `superpowers:executing-plans` to implement this plan inline. This is the original state-guard plan; its single-screen Flow JSON now exists as a local candidate and still requires the official Meta Validator.

**Status:** the original single-screen implementation plan is superseded by `2026-10-27-whatsapp-flow-photo-product-step.md`. The safety guards described here remain required and are implemented in the local Data Exchange candidate.

**Architecture:** use the single `BASKET_PRODUCT` screen from `2026-10-27-whatsapp-flow-photo-product-step.md` for each position. Validate the completed selection on the server after the final position; when no quantity is positive, return the same screen with `selection_error` and preserve the last selected product/quantity. If the customer lookup for an already-associated customer returns `review`, return terminal `CUSTOMER_REVIEW` with a human-help message and no new-customer form. Changing the selected product clears its quantity immediately through `on-select-action`; the footer also applies a server-side fallback. No client-side total or selection state becomes authoritative.

**Tech Stack:** Supabase Edge Function (Deno/TypeScript), WhatsApp Flows Data Exchange v3 contract, existing immutable session snapshot.

**Spec:** `docs/superpowers/specs/2026-10-27-whatsapp-basket-flow-design.md`

## Global Constraints

- Quantities stay in the range `0–6`; zero removes a position.
- At least one selected quantity must be positive before the `PAYMENT` screen.
- Do not add automated tests or run test suites for this slice; keep changes local and document their validation limits.
- Do not apply migrations, deploy functions, publish Flows, send WhatsApp messages, or write to Bling/Supabase.

## Review Focus

- A basket with every quantity zero must remain on the final product position with an actionable Portuguese message.
- A partially zero basket must still advance and preserve each zero/non-zero quantity.
- The warning must not include product identifiers, price/cost, image bytes, token, or session secret.
- Selecting a different product must clear the previous product's quantity immediately and require a new quantity choice; selecting the same product preserves its quantity.
- Failed lookup of a session-associated customer must stop before address capture and must never silently branch to new-customer registration.

---

### Task 1: Guard empty basket in the Flow Data Exchange

**Files:**
- Modify: `supabase/functions/whatsapp-flow-data-exchange-v1/index.ts`
- Modify: `docs/superpowers/specs/2026-10-27-whatsapp-basket-flow-design.md`
- Modify: `docs/planning/implementation-ledger.md`

**Interfaces:**
- `basketProductResponse(...)` projects each dynamic product/quantity screen.
- `selection_error: string` is returned by `BASKET_PRODUCT.data`; it remains empty unless a product change or all-zero selection needs an explanation.
- On the last position, before returning `PAYMENT`, require `nextItems.some(item => item.quantity > 0)`.
- `CUSTOMER_REVIEW.data` contains only `flow_session_id`, prior `selected_items`, `payment_method`, and an allowlisted `review_message`; it never includes credentials or phone data.

- [x] Return an allowlisted display message and `selection_error` in the product/quantity screen.
- [x] After the last position, return the same product/quantity screen with current product/quantity when the basket is empty; do not return `PAYMENT`.
- [x] Clear quantity on a product change and re-check the same condition on **Próximo**.
- [x] After resolving customer context in `PAYMENT`, route `customer_mode="review"` to `CUSTOMER_REVIEW`; do not continue into `CUSTOMER_ADDRESS`.
- [x] Record behavior; Flow JSON must bind/render `selection_error`, and remains pending official component reference and Meta Validator.

**Validation:** No automated tests are added or run by project instruction. Review the branch diff and keep the candidate local; runtime, Flow Validator and visual behavior remain unverified.
