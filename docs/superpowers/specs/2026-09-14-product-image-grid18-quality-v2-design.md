# Product Image Grid18 Quality V2 Design

## Goal

Produce professional product images at low cost using only 18-product image-generation grids, while ensuring only Firebase-active products are processed and no generated image contains a cropped product, bad cutout, or extra objects.

## Non-negotiable rules

- Source of truth for activation is Firebase Realtime Database `/produtos`.
- A product that is inactive or missing in Firebase must not consume image generation.
- Generation is always exactly 18 products in a 3x6 grid; individual image generation is disabled.
- A V2-completed product is not regenerated unless its Firebase/source image changes or it is explicitly marked `needs_reprocess`.
- Final background is `#ECECEC`.
- Final image must contain the whole product, centered with margin, with a clean silhouette and only a subtle realistic contact shadow.
- Any extra object, accidental crop, missing package part, bad cutout, wrong variant, or visible deformation is a hard rejection.
- Rejected/source-bad items search for a better web source and return to the 18-grid queue; after bounded retries they stop for manual review rather than using individual generation.

## Pipeline

1. Synchronize Firebase activity and source fingerprint into Supabase.
2. Select only Firebase-active products whose V2 image is not current.
3. Inspect the source image with low-cost vision before batching.
4. If the source is incomplete, badly cropped, polluted by extra objects, or not safely identifiable, search the web by GTIN/EAN plus name/brand/packaging. Prefer manufacturer or trustworthy retail/distributor pages. The candidate must be the exact variant and pass the same source inspection.
5. Persist an accepted external source into trusted Supabase Storage; never hotlink it as the catalog image.
6. Assemble exactly 18 accepted sources and generate one 2400x1200 grid with GPT Image 2.5 Sunburst at `high` quality.
7. Crop the mathematical 400x400 cells and validate each against its source.
8. Publish only cells passing hard cleanliness/fidelity gates. Rejected cells remain unpublished and are requeued for a new-source attempt in another 18-grid batch.

## Source inspection

The vision schema must explicitly evaluate:

- `same_product_confidence`
- `product_complete`
- `bad_crop`
- `bad_cutout`
- `extra_elements`
- `front_or_usable_view`
- `source_quality_score`
- `critical_issue`

Hard fail when product is incomplete, bad-cropped, bad-cutout, contains extra elements, or identity confidence is insufficient.

## Final validation

The final validator must explicitly evaluate:

- same product, color, shape and label identity;
- `product_complete = true`;
- `bad_crop = false`;
- `bad_cutout = false`;
- `extra_elements = false`;
- clean uniform `#ECECEC` background;
- realistic studio lighting and natural contact shadow;
- professional photographic appearance (not an artificial 3D render);
- fidelity >= 0.90, composition >= 0.90, cutout cleanliness >= 0.90, background >= 0.90.

Any hard failure prevents publication.

## Scheduling

During the initial backlog drain, dispatch every minute so the existing catalog can be completed within the requested 24-hour target, subject to upstream API/runtime availability. After the V2 backlog reaches zero, maintenance runs hourly from 08:00 through 18:00 America/Cuiaba, Monday through Sunday. Maintenance resynchronizes Firebase, detects newly active products/source changes, inspects/searches sources when needed, and queues only new work.

## Cost controls

- Keep one generation for 18 products.
- No individual-generation fallback.
- Use low-cost vision only for source/final inspection.
- Web search runs only for sources that fail inspection or need replacement.
- Persist accepted source decisions and V2 pipeline version so completed products are skipped.

## Data tracking

Add `products.image_ai_pipeline_version` and use `grid18-studio-v2-high-clean` as the completion version. Preserve source URL/hash/verification fields and validation JSON. V2 completion requires both `image_ai_status='completed'` and matching pipeline version.

## Failure behavior

- Firebase inactive/missing: remove from pending processing, never generate.
- Source invalid: research replacement, otherwise mark source rejected/manual review after retry limit.
- Grid technical failure: return eligible jobs to grid queue, never switch to individual.
- Cell validation failure: do not publish candidate; invalidate source for research/retry in a later 18-grid batch.
