# Dona Antônia WhatsApp Commerce Lab

**STATUS: LAB ONLY — NOT DEPLOYED OR CONNECTED TO LIVE META.**

This branch is isolated from main. Do not merge without explicit user release
authorization. Production orders, messaging, stock and Bling remain untouched.

## Source of truth for basket price

For current mold_only baskets the public storefront gets hidden adjustments
from basket_molds, NOT the legacy basket_templates.hidden_adjustment column.
Hidden values are confidential internal business rules.

- Use actual default product IDs from basket_mold_public_compositions_v2,
  never assume that the first alternative is the selected item.
- Use the current effective product price (promotional offer_price if applicable).
- Calculate sum of selected unit prices times quantities.
- ALWAYS preserve the mold's fixed hidden adjustment regardless of brand swaps
  or ordinary removals.
- Apply the conditional hidden adjustment only if its configured product remains.
- Multiply the complete unit basket total by the basket quantity.
- Add loose upsell products separately and validate inventory.
- Requote all items on the trusted server before accepting any real order.

The formula is:

  basket_unit_total = max(0, product_subtotal
                           + fixed_hidden_adjustment
                           + conditional_hidden_if_applicable)

  order_total = basket_unit_total * basket_quantity + upsell_subtotal

NEVER expose hidden adjustment values in WhatsApp Flows, templates, customer
messages, browser data, client logs, analytics, or storefront line items.
A public quote contains only products, quantities, final totals and status.
Customer-supplied adjustment fields have no effect on server pricing.

## Safety barriers

1. No production service-role keys, Meta send-message calls, Bling connections,
   live order-creation, fiscal issuance or inventory mutation.
2. Never commit raw confidential Supabase snapshots into the public repo.
3. The lab engine is a pure simulator. Its only order routine creates an
   in-memory SIMULATED_ONLY record (no network or persistence).
4. No merge to main, production deployment or connection to 0975/1018 before
   explicit authorization for final rollout.
5. All customer-facing responses pass through quoteForCustomer.

## Tests

  node --test labs/whatsapp-commerce/tests/*.test.mjs

Current checks include fixed and conditional hidden adjustments, brand swaps,
removal, extra products, multiple baskets, tampering, availability,
stale compositions and idempotency.

## Parity gaps to resolve

- The real storefront-v2 basket_mold_quote accepts complete mold selections
  and fixed quantities, and does not fully implement removal of a position.
  Lab removals are simulations only until verified against an isolated
  production-equivalent pricing service.
- Source product pricing can use offer_price; snapshots based on price alone
  are insufficient.
- Default selected items vary by generated composition and stock.
- Hidden values are taken from basket_molds and must match the exact live
  mold-specific rule. Do not substitute legacy template adjustments.
- Validate all 5 baskets and each public composition against the official
  quoting behavior before connecting customers to the lab.


## R34 progress: offline WhatsApp-like purchase journey

- Pure engine and flow-independent session state machine.
- Five basket sizes, three synthetic compositions each (15 journeys).
- Ready-to-buy and customized paths; sequential selection, brand changes,
  quantities, removals, extras, registration, delivery, payment and confirmation.
- A client-safe public quote strips private commercial adjustments.
- All orders produced by the test harness have status SIMULATED_ONLY.
- The preview uses a fake catalog and Content Security Policy connect-src 'none'.
- Meta Flow JSON 7.3 candidate in flows/pilot.draft.flow.json. **DRAFT ONLY**:
  one product screen for pilot validation, not the full 23–27 position traversal.
  This candidate has NOT been validated by Meta nor submitted for approval.
- No real photos are loaded in the offline preview. The brand/product thumbnails
  are placeholders until the safe, read-only image normalization stage.

### Run locally

At the repository root:

    python3 -m http.server 4173

Then open http://localhost:4173/labs/whatsapp-commerce/preview/index.html
in a modern mobile or desktop browser. This only serves local files.

Run tests with:

    node --test labs/whatsapp-commerce/tests/*.test.mjs

### Read-only production schema verification (2026-10-13)

Inspected the public basket mold composition RPC for all five commercial
basket models, with three compositions per model (15 combinations).
Each selected option was present in its mold options, active, and with
positive configured quantity when checked. The configured conditional
adjustment's target was selected in composition 2 for each of the five
models, but not selected in compositions 1 and 3 at inspection time.
No raw catalog, customer, stock or private adjustment data was committed.

This is **structural validation, not real quote parity or stock homologation**.
The official basket_mold_quote behavior must still be compared with a
server-side adapter. A read-only snapshot does not prove availability at
the moment a user confirms an order.

### Pending before sending any Flow for Meta review

1. Meta-compatible two-screen/toggled-product pagination proof for all
   public positions. No assumption that looping the same screen is allowed.
2. Per-session encrypted data exchange endpoint, correct signing, auth,
   idempotency, and native WhatsApp flow reply handling.
3. Image compression to Meta component constraints. Photos must be sourced
   from current catalog dynamically and must not disclose internal pricing.
4. Verify eligibility and price reconciliation for substitutions/removals.
5. Dedicated Meta TEST WABA/number connection; never publish or send
   using the existing 0975/1018 production numbers during lab work.


## R35: Meta integration preparation — still not deployed

- Prepared a DRAFT Flow JSON 7.3 pilot with six screen definitions. This is
  deliberately one product-screen for API validation; no unsupported
  assumption that 27 sequential product steps can loop through a single Flow
  screen. Full paging design is blocked until Meta's validator confirms it.
- Prepared four da_lab_* template review payloads in templates/drafts.json.
  Three Utility drafts relate strictly to order status; one separate Marketing
  draft is for optional offers. None was submitted, sent or approved by Meta.
  The Meta account may reclassify template categories on review.
- Implemented src/meta-crypto.mjs as an isolated Node crypto reference for
  encrypted Flow requests: RSA-OAEP SHA-256, AES-128-GCM, flipped IV for
  encrypted responses. All test keys are ephemeral and generated in memory.
  The file is NOT a production endpoint and must not be exposed to the web.
- Added a server-only adapter in src/mold-adapter.mjs to map real commercial
  basket molds, currently selected composition IDs, effective offer prices,
  and hidden fixed/conditional adjustments into the isolated price engine.
  All adapter tests use fabricated model data; no confidential snapshots
  are stored in this repository.
- A test WABA and dedicated test sender are needed before Graph API creation
  or Meta submission. They are not configured by this branch. Do NOT reuse
  Meta credentials or sender IDs associated with currently operating 0975
  or 1018 messaging.


## R36: Native Flow contract, location and delivery tests (2026-10-13)

Code added in this branch, STILL NOT DEPLOYED:

- Server-side same-screen validation errors now include `screen`, the required
  `data` dictionary (brand choices, current product and visible total), plus
  a Portuguese error message. The client never receives price-adjustment internals.
- Contract tests compare the response fields of each step against those declared
  in the candidate Flow JSON. Avoid undeclared dynamic fields, which Meta may drop.
- `src/location.mjs` builds but DOES NOT SEND a native WhatsApp
  `location_request_message` using `action.name=send_location`; parsing binds a
  received coordinate to a preselected customer phone, and home location remains
  unconfirmed until the customer validates the delivery address.
- `src/delivery-policy.mjs` simulates 12:00 cutoff in America/Cuiaba,
  Cuiabá/Várzea Grande service-area guard, Sunday closure and injected holiday
  / non-operating dates. Holiday calendars MUST come from verified Admin data
  before enabling any actual delivery promise.
- `src/lab-release-gate.mjs` fails closed unless the test WABA, test phone
  and allowed test recipients are configured separately from production.
  Customer messaging and writes to production must remain disabled.

### Open blockers (not yet production-ready)

1. **Meta validator/device test:** Repeating `PRODUCT_PILOT` 23–27 times via
   same-screen `data_exchange` works in the isolated protocol simulator.
   This behavior has NOT been validated on Meta Android/iOS clients.
   A fallback screen-layout plan is mandatory if rejected.
2. **Official pricing parity:** Current public mold-only quote requires a
   selected product for every position and fixed configured quantities.
   The laboratory's custom removal/quantity behavior must be implemented in an
   isolated backend and reconciled with the production quote algorithm. Do not
   silently call a production order endpoint.
3. **Meta test resources:** No dedicated test WABA/phone integration is connected
   to this code. No template or Flow was sent for Meta approval.
4. **Persistent sandbox:** Sessions/orders are in-memory only, not durable
   across hosts or serverless restarts. Use an isolated database only after
   approving the associated resource/cost.
5. **Photo conversion:** Flow options accept bounded Base64 prepared bytes.
   The standalone lab DOES NOT download or convert live product images yet.
6. **Security history:** An old branch commit contained a snapshot with raw
   commercial data, then its branch ref was reset. That commit remains
   retrievable in the public repo's object history. Removal from the branch
   is not enough. Obtain GitHub-supported object removal before considering
   the repository sanitized.
7. **No billing claim:** Messages, subscriptions and templates must be priced
   using the current provider/Meta account policies before commercialization.

Reference: AWS End User Messaging documentation for encrypted WhatsApp
Dynamic Flows, Meta-compatible endpoint pings and status codes. This is
not an attestation that the candidate JSON has passed Meta validation.
