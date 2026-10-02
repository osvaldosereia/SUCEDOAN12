# Admin Order WhatsApp Main Integration Design

## Goal

Bring the already-built order WhatsApp and linked-registration controls into the current `main` Admin without reverting newer checkout/WhatsApp backend work.

## Required behavior

- In the order editor, show a compact `WhatsApp e cadastro` section.
- Allow the operator to send the order through the existing `order_whatsapp_send` backend action.
- Allow the operator to issue a customer registration link through `order_registration_link_issue`.
- The registration link must remain token-based (`order_token`) and must not expose `order_id` publicly.
- A currently active registration link must not be silently replaced.
- The UI must explain when the PapoAI provider is not configured instead of pretending the send succeeded.
- Preserve all newer `main` checkout and WhatsApp transport behavior; no backend rollback.

## Scope boundaries

- Reuse the current `admin-orders-v1`, `admin-products-live-v1`, `storefront-v2`, and database RPCs already present in `main`/production.
- Do not deploy or alter Supabase in this integration unless verification proves the current backend is missing a required contract.
- Do not send any WhatsApp message to a real customer while verifying this change.
- Do not change PapoAI configuration.

## Acceptance

The Admin source contains the order WhatsApp/registration controls and bindings, the regression test passes, inline browser JavaScript parses, the PR diff contains no unrelated backend rollback, and repository checks for the PR complete successfully before merge.