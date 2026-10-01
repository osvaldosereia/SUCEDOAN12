# Purchase Product Identification Redesign

Date: 2026-09-30
Status: approved design, implementation pending
Scope: Vitrine/Admin > Estoque > Produtos recebidos / importados de NF-e

## Objective

Transform the current imported-purchase-items list into a safe and fast receiving-review workflow that makes product identity explicit before any commercial update is authorized.

The operator must be able to understand, at a glance:
- whether the NF-e item is already linked to a canonical Dona Antonia product;
- why the system considers it matched, ambiguous, or new;
- whether the GTIN from the XML represents the sale unit or an outer package such as CX/FD/PCT/DP;
- what conversion is being applied from purchase packaging to base unit;
- which canonical product fields will change when authorization is confirmed.

## Current problem

The current importer can classify an item using `gtin_exact` or create an inactive product using `created_from_gtin`. This is unsafe as a complete identity strategy because an XML GTIN may represent the outer package while the canonical product is sold by individual unit.

A missing exact GTIN therefore must never be interpreted by itself as proof that the product is new.

The UI currently hides too much of the matching evidence. It shows labels such as `Produto novo`, but does not explain the matching method, candidate canonical product, GTIN role, or packaging relation.

## Product identity model

### Canonical product

`public.products` remains the canonical commercial product record.

The canonical `products.gtin` must represent the preferred sellable/base-unit barcode whenever one is known.

### Multiple identifiers

Add a product identifier model that supports multiple codes per canonical product. It must support at least:
- base-unit GTIN;
- package GTIN;
- supplier item code;
- Bling/SKU alias when useful.

Each identifier must preserve:
- `product_id`;
- normalized identifier value;
- identifier kind;
- packaging unit when relevant;
- conversion factor when the identifier represents an outer package;
- source/evidence;
- confidence/status;
- timestamps.

A package GTIN must be able to express a relation such as:

`GTIN_CAIXA -> product_id -> 48 UN`

This complements `product_supplier_packaging`; it does not replace it.

### Existing packaging knowledge

`public.product_supplier_packaging` remains the source for supplier-specific purchase packaging and conversion information.

Confirmed packaging relationships should be reused automatically in future imports from the same supplier.

## Matching strategy

Matching must be deterministic-first and conservative.

Order of precedence:

1. Exact confirmed base-unit GTIN match.
2. Exact confirmed package-GTIN match, resolving to canonical `product_id` and conversion factor.
3. Confirmed supplier item code + supplier identity match.
4. Existing Bling/SKU/product binding match.
5. Strong candidate generation using normalized description, brand, size/weight/volume and NCM.
6. If only candidates exist, require human review.
7. Only create a new inactive canonical product when there is no reliable existing match and the operator confirms creation.

Name similarity alone must never create or bind a product automatically.

## GTIN role inference

For every imported XML item, the system should derive a GTIN-role state:
- `base_unit`;
- `package`;
- `unknown`.

Evidence may include:
- `purchase_unit`;
- `tax_unit`;
- `purchase_quantity`;
- `tax_quantity`;
- XML conversion ratio;
- historical supplier packaging;
- known product identifiers;
- existing canonical product unit.

When `purchase_unit` is a packaging unit such as CX/FD/PCT/DP and a conversion factor greater than 1 is detected, the XML GTIN must not automatically become the canonical base-unit GTIN unless evidence proves it is the unit GTIN.

## UI redesign

Each purchase item becomes a receiving-review card with three explicit sections.

### 1. Identification

Show:
- NF-e description, editable for the proposed canonical product name;
- XML commercial GTIN and tax GTIN;
- inferred GTIN role;
- supplier item code;
- supplier;
- NCM;
- current matching state;
- matching method/evidence;
- canonical product candidate, if any, including image, name, GTIN, SKU and active/inactive state.

Primary identity statuses:
- `Produto existente`;
- `Possível correspondência`;
- `Produto novo`.

The status must always include a plain-language reason.

Examples:
- `Encontrado pelo EAN da unidade`;
- `Encontrado pelo EAN da caixa: 48 UN`;
- `Encontrado pelo código deste fornecedor`;
- `Possível correspondência por nome, tamanho e NCM — revisar`;
- `Nenhuma correspondência confiável encontrada`.

### 2. Compra e conversão

Show:
- quantity in purchase unit;
- purchase unit;
- conversion factor;
- final base-unit quantity;
- purchase unit cost;
- base-unit cost;
- conversion source/confidence.

Example:

`3 CX x 48 = 144 UN`

The operator may correct the conversion before authorization. Confirmed corrections become reusable supplier-packaging knowledge.

### 3. Proposed canonical changes

Show side-by-side current vs proposed values for:
- name;
- GTIN/base-unit identifier;
- brand;
- category/subcategory when available;
- cost;
- sale price;
- unit;
- packaging metadata;
- supplier relationship.

Only fields explicitly marked for update are changed.

Stock is not changed by this product-identity authorization flow.

## Inline edit workflow

The operator must be able to resolve an item without leaving the receiving screen.

Actions:
- edit canonical product name;
- search an existing product by name, EAN or SKU;
- select an existing canonical product;
- reject a suggested match;
- mark the XML GTIN as package or base-unit GTIN;
- correct conversion factor;
- create a new inactive canonical product;
- open an inline compact editor for commercial fields required to make the product usable.

When an existing product is selected, the card must immediately display its current canonical data.

## Candidate search

When identity is unresolved, search should return ranked candidates using:
- exact alternate identifier;
- supplier product code history;
- same NCM;
- normalized description similarity;
- brand;
- weight/volume/size tokens.

Ranking is only assistive. It does not authorize a link automatically unless one of the deterministic rules matches.

## Authorization rules

`Autorizar seguros` may include only items that satisfy all required conditions:
- canonical product identity is deterministic or explicitly confirmed;
- conversion factor is known/confirmed;
- no conflicting identifier mapping exists;
- commercial changes are internally consistent.

Ambiguous items remain outside batch authorization.

Per-item authorization applies only the changes visible in the card.

## Data preservation and auditability

For every resolution, preserve enough evidence to answer later:
- which NF-e item originated the decision;
- which identifier caused the match;
- whether the product was linked or created;
- who/what confirmed the packaging conversion;
- prior and new canonical values.

Existing purchase history must remain intact.

## Compatibility

Existing tables to preserve:
- `products`;
- `purchase_xml_items`;
- `purchase_xml_documents`;
- `product_supplier_packaging`;
- `product_purchase_history`.

The importer should be evolved in place rather than creating a second competing purchase-import flow.

## Implementation boundaries

This change must not:
- post or change inventory balances;
- change the financial eligibility rules for purchase XMLs;
- change payable generation behavior;
- change fiscal classification automatically beyond current evidence capture;
- activate newly created products automatically.

## Acceptance criteria

1. Every purchase item clearly states whether the canonical product is existing, ambiguous or new.
2. The UI shows the reason/matching method for every decision.
3. Package GTINs can be linked to a canonical unit product without replacing the canonical unit GTIN.
4. The operator can search and link an existing product directly from the card.
5. The operator can edit the proposed canonical product name before authorization.
6. Conversion CX/FD/PCT/DP -> UN can be corrected inline and reused later.
7. `Autorizar seguros` never includes unresolved identity cases.
8. No stock quantity is modified by product identity authorization.
9. Existing purchase history remains preserved.
10. A repeated purchase using a confirmed supplier/package identifier resolves automatically on the next import.

## Verification

Implementation must include:
- migration/schema verification;
- deterministic matching tests;
- exact unit-GTIN test;
- package-GTIN test;
- supplier-code repeat-purchase test;
- ambiguous-name candidate test;
- new-product confirmation test;
- regression test proving stock is unchanged;
- UI smoke test on desktop and mobile.