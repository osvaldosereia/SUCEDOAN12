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
