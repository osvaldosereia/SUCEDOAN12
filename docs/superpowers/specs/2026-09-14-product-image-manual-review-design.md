# Product Image Manual Review Design

## Goal
Keep the automatic Dona Antônia product-image drain cheap and uninterrupted in 18-product medium-quality grids while separating visually risky products into a manual-review queue in Admin V3. Individual generation is allowed only when an admin explicitly requests it and supplies an instruction.

## Approved behavior

1. Automatic production remains `grid18-studio-v2-medium-clean`, 18 cells per generation, `quality=medium`.
2. A bad source must not cancel the other 17 products in a batch.
3. If the source is cropped, badly cut out, contains extra elements, has low identity/quality confidence, or otherwise fails source inspection, the worker first tries web source recovery. If recovery fails but an image is still available, it uses the best available source for the grid and flags the product for manual review.
4. If the generated grid cell fails final validation, it is not published over `products.image_url`. The rejected candidate is preserved for Admin preview, the product is flagged for manual review, and the automatic drain moves on instead of converting the job to automatic individual fallback.
5. Products with no usable source at all must also be flagged for manual review and must not keep the automatic drain in an infinite retry loop.
6. Admin V3 > Imagens IA gets a dedicated `Imagens ruins` filter/list with thumbnail, name, EAN/SKU, review reason and the existing diagnostic information.
7. The repair dialog gets a dedicated `Orientação para gerar novamente` field and a `Gerar individualmente` button.
8. Manual individual generation is only triggered by an authenticated Admin V3 owner/admin action. Bulk automatic individual generation is removed from the UI.
9. The manual instruction is stored on the product, included in the individual image prompt, but cannot override exact product identity. The fixed rules still require the same product, full package, no extra objects, light gray `#ECECEC` background and realistic contact shadow.
10. Individual manual generation uses `gpt-image-2.5-sunburst` at `quality=medium`. Automatic grid generation remains the only background generator.
11. On successful manual generation, the result is published, manual-review requirement is cleared and the review is marked resolved. On rejection/error, the previous published catalog image remains unchanged and the product stays in `Imagens ruins` with the new reason.
12. Only active products are eligible for automatic or manual generation.

## Data model
Add fields to `public.products`:

- `image_ai_manual_review_required boolean not null default false`
- `image_ai_manual_review_reason text`
- `image_ai_manual_prompt text`
- `image_ai_manual_requested_at timestamptz`
- `image_ai_manual_requested_by uuid`
- `image_ai_manual_attempts integer not null default 0`
- `image_ai_manual_resolved_at timestamptz`

The list is derived directly from products where `is_active=true` and `image_ai_manual_review_required=true`; no new public table is required.

## Worker behavior

### Grid source handling
Source inspection still runs. A source that fails inspection triggers web recovery. If recovery also fails but there is still a fetchable source/current catalog image, the worker uses it and records a review reason such as `source_bad_crop`, `source_bad_cutout`, `source_extra_elements`, `source_identity_low`, `source_quality_low`, or a compact critical issue. This prevents one risky product from releasing the entire batch.

### Grid final validation
A failed candidate is uploaded to the rejected storage path for review. The job is finalized for the automatic pipeline and the product receives the current grid pipeline version plus `image_ai_manual_review_required=true`. The rejected candidate may be stored in `image_ai_url` for preview, but `image_url` is not overwritten.

### Automatic individual fallback
The legacy automatic retry trigger must no longer convert rejected products into `force_individual=true`. Individual claims must require an explicit manual request timestamp.

## Manual generation
Admin action `generate_manual` saves the admin instruction and user ID, resets the selected product job to pending with `force_individual=true`, and dispatches the manual individual worker. The individual worker claims only explicit manual jobs, reads `image_ai_manual_prompt`, uses it as an additional instruction, validates the result, and clears or preserves manual review according to the outcome.

## Security
`admin-product-images-v1` continues validating the Supabase user token and `admin_users.role in ('owner','admin')`. The manual dispatcher is a `SECURITY DEFINER` RPC but is revoked from `PUBLIC`, `anon`, and `authenticated`, and granted only to `service_role` and `postgres`. Worker-to-worker calls continue using the existing hashed webhook secret/Vault secret; no service-role key is exposed to the browser.

## Verification
- Static tests must assert the Admin contains the `bad_images` triage group, manual prompt field/action, and no bulk individual retry control.
- Database verification must confirm the new columns, restricted dispatcher grants, active-only manual claim and disabled automatic individual retry behavior.
- Runtime verification must confirm the grid cron remains active, an 18-cell medium batch can continue when a source is flagged bad, and manual dispatch targets `product-image-openai-v2` only after an explicit admin request.
