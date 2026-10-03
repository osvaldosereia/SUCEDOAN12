# Order Separation V2 — Design Specification

Date: 2026-10-03
Repository: `osvaldosereia/SUCEDOAN12`
Canonical Supabase project: `ssbesxgaijknwsjbsbcz`
Status: design approved in chat; implementation pending written-spec review

## 1. Purpose

Replace the current partially implemented separation flow with a canonical, shared, auditable flow that supports:

- a customer-facing read-only order storefront;
- a distinct Admin separation storefront;
- per-item operational states persisted in Supabase;
- explicit handling of missing products;
- automatic reduction of the order total when missing items remain at completion;
- a shared separator assignment visible from any device;
- only four visible operational stages in the Admin: `TODOS`, `SEPARAR`, `ENTREGA`, `FINALIZADO`;
- the same canonical order number everywhere.

This design intentionally preserves internal technical safeguards around Bling, fiscal preflight and stock deduction even when the `ready` status is no longer visible to operators.

## 2. Current-state problems to correct

The current implementation has several inconsistencies:

1. The Admin still exposes a visible `PRONTO` stage and the regression test requires it.
2. The public order storefront currently contains the separation interaction and stores progress in browser `localStorage`.
3. Separation completion currently marks all check rows at once rather than persisting each item state as it changes.
4. Completion currently ends in `ready`, not in the visible `ENTREGA` stage requested by operations.
5. The public storefront displays `public_code` instead of the canonical `orders.order_number`.
6. There is no persistent shared assignment for who is separating each order.
7. The current stock-consume function operates at the whole-order reservation level and cannot directly support a mixture of delivered and missing items without a new partial-consume/release path.

## 3. Approved visible workflow

The Admin order menu must expose only:

- `TODOS`
- `SEPARAR`
- `ENTREGA`
- `FINALIZADO`

Visible operational flow:

`confirmed/processing` → `ENTREGA` → `FINALIZADO`

Internally, the backend may still pass through `ready` as a technical transition required by existing Bling/fiscal guards. This internal state must not appear as a separate operator stage.

Suggested visible mapping:

- `created` / `storefront_received`: visible in `TODOS` only until confirmed.
- `confirmed` / `processing`: visible in `SEPARAR`.
- `ready` / `out_for_delivery`: visible in `ENTREGA`.
- `delivered`: visible in `FINALIZADO`.

If an order is internally `ready` but blocked by a Bling/fiscal issue, it remains in `ENTREGA` with a visible warning; it must not reappear in `SEPARAR`.

## 4. Two storefronts

### 4.1 Customer storefront

The existing public order link remains the customer link.

Characteristics:

- read-only;
- no hidden tap gesture;
- no separation buttons;
- no completion button;
- no Admin login or PIN;
- shows the canonical `orders.order_number`;
- shows item state as one of:
  - `Aguardando separação`
  - `Separado`
  - `Em falta`
- after completion, shows the corrected final total when any item was missing;
- keeps missing products visible for transparency and future automated notification use;
- may continue to use a public token / short code for secure lookup, but that code is never presented as the order number.

### 4.2 Admin separation storefront

A separate operational page is opened only from the `SEPARAR` button in the Admin.

Each item displays:

- product image;
- product name;
- quantity;
- price information as needed for operational clarity;
- button `SEPARADO`;
- button `EM FALTA`.

No hidden tap gestures are used in the Admin storefront once this version is implemented.

State transitions before completion are freely reversible:

- `PENDENTE` → `SEPARADO`
- `PENDENTE` → `EM FALTA`
- `SEPARADO` → `EM FALTA`
- `EM FALTA` → `SEPARADO`

A product may therefore be marked `EM FALTA` and later changed to `SEPARADO` if it is replenished before completion.

Each change is persisted immediately to Supabase and becomes visible to other devices and to the customer storefront.

`CONCLUIR SEPARAÇÃO` appears only when every separation item is classified as either `SEPARADO` or `EM FALTA`.

## 5. Separation ownership in the Admin

Only in the `SEPARAR` tab, each order row/card remains closed and must not open the current order modal automatically.

It shows small shared assignment buttons:

- `José`
- `Claudenil`
- `Kelly`
- `Jovenil`

and a visually distinct action button:

- `SEPARAR`

Rules:

- only one separator can be active per order;
- clicking another name replaces the active separator;
- clicking the currently active name clears the assignment;
- assignment is persisted server-side and visible on any device after refresh/reload;
- `SEPARAR` opens the Admin separation storefront directly;
- other order tabs preserve their normal row/modal behavior unless changed by another explicit requirement.

## 6. Canonical data model

### 6.1 `order_separation_assignments_v1`

One row per order.

Proposed columns:

- `order_id uuid primary key references orders(id)`
- `separator_key text null`
- `separator_label text null`
- `assigned_at timestamptz null`
- `updated_at timestamptz not null default now()`

Allowed separator keys are constrained to the currently approved four people. The UI label remains human-readable.

### 6.2 `order_separation_items_v1`

One row per canonical `order_items.id`.

Proposed columns:

- `id uuid primary key default gen_random_uuid()`
- `order_id uuid not null references orders(id)`
- `order_item_id uuid not null references order_items(id)`
- `product_id uuid null`
- `state text not null default 'pending'`
- `quantity numeric not null`
- `unit_price numeric not null`
- `line_total numeric not null`
- `changed_at timestamptz null`
- `changed_by_separator_key text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- unique `(order_id, order_item_id)`

Allowed states:

- `pending`
- `separated`
- `missing`

The snapshot of `quantity`, `unit_price` and `line_total` is captured from the canonical order line for deterministic audit and future notifications. `order_items` remains the source of truth for the purchased line itself.

### 6.3 Completion audit

Completion must retain an immutable record of the financial adjustment. This can be implemented either as a dedicated completion table or an event payload in the canonical Ops event stream, but it must preserve at minimum:

- order id and order number;
- original total before missing-item adjustment;
- missing subtotal;
- final total;
- ids and quantities of missing items;
- separator assignment at completion;
- completion timestamp;
- Bling/fiscal/stock result identifiers.

Recommended dedicated table: `order_separation_completions_v1`, one successful completion row per order, with idempotency enforced by `order_id` unique.

## 7. Initialization and synchronization

When an order first enters the separation queue (`confirmed`), the backend creates any missing `order_separation_items_v1` rows from `order_items`.

Initialization is idempotent.

If an order line changes before separation is completed, synchronization must:

- add newly created order items as `pending`;
- update quantity/price snapshots only for still-pending rows when the canonical line legitimately changes;
- never silently overwrite a completed separation result;
- cause the Admin storefront to show a clear refresh/conflict state if the order changed while someone was separating it.

A version/fingerprint should continue to be used so stale clients cannot complete an outdated order.

## 8. Missing-item financial rule

A missing product is not deleted from history.

At separation completion:

`missing_subtotal = SUM(order_separation_items.line_total WHERE state='missing')`

The business rule is:

`final_order_total = original_order_total - missing_subtotal`

For a line with quantity 2 and unit price R$ 8,49, the deduction is R$ 16,98.

This applies equally to ordinary products and basket/kit components because each canonical `order_item` already carries quantity, unit price and line total.

### 8.1 Fiscal recomposition

The implementation must not repurpose or overwrite an existing commercial discount incorrectly.

For completion:

- missing order lines remain in historical `order_items`;
- the canonical fiscal payload used after completion must include only deliverable (`separated`) quantities/items;
- `fiscal_subtotal` is recomputed from deliverable lines;
- existing `other_expenses`, including any legitimate basket hidden adjustment, remains governed by its existing business rule;
- existing commercial discounts remain preserved;
- canonical `orders.total` is recomposed so the existing fiscal preflight equation remains balanced;
- the missing-item adjustment is stored separately in the separation completion audit and exposed to the storefront as `missing_adjustment`.

The exact mutation of `subtotal`, `fiscal_subtotal`, `discount`, `other_expenses`, `basket_hidden_adjustment` and `total` must be covered by regression tests using both a normal product order and a fixed-price basket order.

## 9. Stock reservation and physical stock rules

Item classification does not physically deduct stock.

Before completion:

- `pending`, `separated` and `missing` are operational states only;
- changing `missing` back to `separated` must not require a compensating physical-stock transaction because no definitive stock movement has happened yet.

At completion:

- reservations/allocation corresponding to `missing` lines are released/excluded;
- only `separated` lines become eligible for delivery stock consumption;
- with Bling as the current stock authority, local reservation rows may transition to consumed/released without directly changing `products.stock`;
- the existing whole-order `consume_vitrine_order_stock_v1` must not be used unchanged if it cannot safely represent a mixture of separated and released lines;
- a new idempotent partial consume/release RPC or equivalent canonical operation is required.

Definitive physical stock deduction happens exactly once during the protected dispatch transition that makes the order operationally `ENTREGA`.

The dispatch path must pass only deliverable/separated items to the Bling physical stock launch.

## 10. Bling and fiscal flow

Completion is a resumable, idempotent server workflow, because external Bling operations cannot be made transactionally atomic with PostgreSQL.

Recommended sequence:

1. lock/order-level idempotency check;
2. verify every separation item is classified;
3. verify client/order fingerprint/version;
4. calculate missing subtotal and deliverable lines;
5. persist completion intent/audit state;
6. release missing reservations/allocations and consume operational reservations for separated lines only;
7. recompose canonical fiscal totals;
8. refresh the public order snapshot;
9. synchronize the adjusted order to Bling / target `verified` state as required;
10. set internal `ready` only as a technical guard state;
11. run existing fiscal dispatch preflight;
12. launch physical stock in Bling for separated items only, idempotently;
13. move to `out_for_delivery`;
14. refresh delivery/public snapshots and finish the completion audit.

If an external step fails after financial adjustment is persisted, the order must remain recoverable and idempotently retryable. It must not duplicate stock movement or duplicate financial deduction.

## 11. Visible status mapping and removal of PRONTO

`PRONTO` is removed from the Admin menu and all visible operating copy.

The underlying `ready` status may remain for backward compatibility and technical gates.

Admin filter rules become:

- `all`: all orders;
- `separate`: `confirmed` and `processing`;
- `delivery`: `ready` and `out_for_delivery`;
- `finalized`: `delivered`.

When separation completion succeeds financially but is still finalizing Bling/fiscal dispatch, the order is already displayed under `ENTREGA` with an explicit operational warning if necessary.

## 12. Order number unification

The canonical displayed order identifier is always `orders.order_number`.

The public snapshot endpoint must stop replacing it with `public_code`.

Rules:

- Admin displays `orders.order_number`;
- customer storefront displays the same `orders.order_number`;
- Admin separation storefront displays the same `orders.order_number`;
- WhatsApp/order messages should continue to use the same canonical order number;
- `public_code` and `public_token` may remain lookup/routing values but must not be presented as the order number.

## 13. API boundaries

### 13.1 Customer public endpoint

`order-public-view-v1` becomes read-only for the customer experience.

It returns:

- canonical order number;
- customer-safe order data;
- per-item separation state;
- original total, missing adjustment and current/final total as applicable;
- current visible order status.

It must not expose mutation actions for separation.

### 13.2 Admin separation API

A dedicated authenticated Admin API/action handles:

- read separation state;
- assign/clear separator;
- mark one item `separated`;
- mark one item `missing`;
- complete separation;
- return completion/recovery state.

It should use the existing Admin authentication/session mechanism already present in the Vitrine/Admin; no new login system is introduced.

## 14. Customer storefront presentation

Before classification:

- subtle `Aguardando separação` state.

Separated:

- positive visual state, e.g. checkmark and `Separado`.

Missing:

- clear `Em falta` state;
- item remains visible;
- after completion the customer can see that its value was removed from the order.

The public page must never show operational controls, separator names, internal warnings, Bling identifiers or admin-only actions.

## 15. Admin separation presentation

For each item:

- current state is obvious;
- `SEPARADO` and `EM FALTA` buttons are both visible;
- selecting one immediately persists and highlights that state;
- changing selection updates the persisted state;
- pending count and classified count may be shown compactly;
- `CONCLUIR SEPARAÇÃO` appears only when pending count is zero.

Completion confirmation should summarize:

- number of separated items;
- number of missing items;
- value that will be deducted;
- resulting order total.

This confirmation is an Admin-only safety check, not a customer prompt.

## 16. Concurrency and idempotency

Required safeguards:

- per-order version or updated-at conflict check;
- item-state writes are idempotent (`set state`, not `toggle`);
- only the latest explicit state is authoritative before completion;
- completion uses a unique idempotency key / unique completion row;
- a second completion request returns the existing result and never re-deducts value or stock;
- stale Admin storefronts receive a conflict response and reload current state;
- assignment changes are last-write-wins with `updated_at` returned to clients.

## 17. Backward compatibility

Existing orders already in `ready` or `out_for_delivery` are not migrated back into separation.

Existing orders in `confirmed` or `processing` get separation rows initialized from current canonical `order_items` when first opened/loaded.

The old public triple-tap mutation path is retired after the new Admin separation page is live and verified.

The public customer link remains valid.

## 18. Future automated notification readiness

No automatic customer notification is sent in this implementation.

The design intentionally preserves enough structured data to later trigger notifications when:

- an item changes to `missing`;
- a previously missing item changes back to `separated`;
- separation is completed with a reduced order total.

Future notification events should be emitted from server-side state transitions, not inferred from UI clicks.

## 19. Tests required before production

### Data/model tests

- initialize separation rows once;
- persist state across sessions/devices;
- `missing → separated` works before completion;
- `separated → missing` works before completion;
- completion blocked while any item is pending;
- completion idempotent.

### Financial tests

- normal product missing: quantity × unit price deduction;
- quantity > 1;
- multiple missing products;
- basket component missing;
- fixed-price basket hidden adjustment preserved correctly;
- existing commercial discount preserved;
- canonical fiscal preflight remains balanced after deduction.

### Stock tests

- marking an item does not change physical stock;
- missing reservations are released/excluded;
- separated reservations are consumed operationally;
- definitive Bling stock movement contains separated items only;
- duplicate completion cannot duplicate stock movement.

### UI tests

- Admin visible filters are only `Todos`, `Separar`, `Entrega`, `Finalizado`;
- no `Pronto` button;
- `SEPARAR` tab row does not open the order modal;
- separator assignment is shared and persistent;
- Admin separation page has exactly the two item-state actions plus the conditional completion action;
- customer page has no mutation controls;
- customer sees current item states;
- customer and Admin show exactly the same canonical `order_number`.

### Cross-device test

Open the same separation order on two independent browser sessions:

1. session A changes one item to missing;
2. session B refreshes and sees missing;
3. session B changes it to separated;
4. session A refreshes and sees separated;
5. customer link reflects the same state.

## 20. Rollout sequence

1. Add database tables/RPCs and tests without changing UI behavior.
2. Add Admin separation API and server-side state handling.
3. Build Admin separation storefront behind an internal feature gate if needed.
4. Make customer storefront read-only and expose item states.
5. Fix canonical order-number display.
6. Change Admin `SEPARAR` tab to assignment buttons + `SEPARAR` action.
7. Remove visible `PRONTO`; map internal `ready` to `ENTREGA`.
8. Enable completion financial/stock flow with canary order validation.
9. Run end-to-end tests with a normal order and a basket order.
10. Retire old triple-tap public mutation path and remove obsolete regression expectations.

## 21. Explicit non-goals for this version

- automatic WhatsApp notification of missing products;
- customer choice of substitutions;
- partial quantity missing within one line (the entire canonical line quantity is classified together in this version);
- reopening a completed separation;
- changing the four approved separator names through a settings screen;
- removing the internal `ready` status from the database schema.

## 22. Acceptance criteria

The implementation is accepted only when all of the following are true:

1. Admin shows only `TODOS`, `SEPARAR`, `ENTREGA`, `FINALIZADO`.
2. In `SEPARAR`, the order row stays closed and shows `José | Claudenil | Kelly | Jovenil | SEPARAR`.
3. Separator choice persists across devices.
4. Admin separation storefront uses visible `SEPARADO` / `EM FALTA` buttons per item.
5. State changes persist immediately server-side and are reversible before completion.
6. Customer storefront is read-only and reflects item state.
7. Completion is impossible with pending items.
8. Missing lines reduce the order total by their full line value and remain visible historically.
9. Missing lines are excluded from definitive stock deduction and delivery payload.
10. Physical stock is deducted once only, through the protected dispatch path.
11. The operator sees the completed order in `ENTREGA`, never in a visible `PRONTO` stage.
12. Customer/Admin/WhatsApp use the same canonical `orders.order_number`.
13. Existing fiscal preflight remains balanced after missing-item adjustment.
14. Repeated completion requests cannot duplicate money or stock effects.
