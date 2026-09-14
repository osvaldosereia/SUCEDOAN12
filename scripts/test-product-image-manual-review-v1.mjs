import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const page=r('admin-v3/imagens-ia.html');
const js=r('admin-v3/image-automation.js');
const admin=r('supabase/functions/admin-product-images-v1/index.ts');
const grid=r('supabase/functions/product-image-openai-grid18-v1/index.ts');
const gridImage=r('supabase/functions/product-image-openai-grid18-v1/image.mjs');
const individual=r('supabase/functions/product-image-openai-v2/index.ts');
const migration=r('supabase/migrations/20260914100500_product_image_manual_review_v1.sql');

// Automatic grid remains the cheap production path.
assert.match(gridImage,/quality['"],['"]medium['"]/);
assert.match(grid,/items\.length!==18/);
assert.match(grid,/image_ai_manual_review_required/);
assert.match(grid,/manualReviewReason/);
assert.doesNotMatch(grid,/releaseBatchForMember\(sb,batch,items,failed\.item/);

// Manual review persistence and access controls.
for(const field of ['image_ai_manual_review_required','image_ai_manual_review_reason','image_ai_manual_prompt','image_ai_manual_requested_at','image_ai_manual_requested_by','image_ai_manual_attempts','image_ai_manual_resolved_at']) assert.match(migration,new RegExp(field));
assert.match(migration,/claim_product_image_fallback_v1/);
assert.match(migration,/p\.is_active=true/);
assert.match(migration,/image_ai_manual_requested_at is not null/);
assert.match(migration,/dispatch_product_image_manual_worker_v1/);
assert.match(migration,/product-image-openai-v2/);
assert.match(migration,/revoke all on function public\.dispatch_product_image_manual_worker_v1\(\) from public/i);
assert.match(migration,/grant execute on function public\.dispatch_product_image_manual_worker_v1\(\) to service_role, postgres/i);
assert.doesNotMatch(migration,/force_individual=true[^;]*automatic_retry/i);

// Individual generation is explicit, medium-quality, and consumes admin guidance.
assert.match(individual,/drain_manual/);
assert.match(individual,/claim_product_image_fallback_v1/);
assert.match(individual,/image_ai_manual_prompt/);
assert.match(individual,/quality['"], ['"]medium['"]/);
for(const key of ['product_complete','bad_crop','bad_cutout','extra_elements','professional_photo','natural_contact_shadow']) assert.match(individual,new RegExp(key));

// Admin exposes a dedicated bad-images queue and explicit manual action.
assert.match(page,/value="bad_images"/);
for(const id of ['statBadImages','repairManualPrompt','generateIndividualManual']) assert.match(page,new RegExp(`id=["']${id}["']`));
assert.doesNotMatch(page,/id="bulkProblems"/);
assert.match(js,/bad_images/);
assert.match(js,/generate_manual/);
assert.match(js,/repairManualPrompt/);
assert.doesNotMatch(js,/\$\('bulkProblems'\)/);
assert.match(admin,/generate_manual/);
assert.match(admin,/dispatch_product_image_manual_worker_v1/);
assert.match(admin,/dispatch_product_image_grid18_worker_v2/);
assert.match(admin,/image_ai_manual_review_required/);
assert.match(admin,/triage:\{[^}]*bad_images/s);

console.log('product image manual review contract ok');
