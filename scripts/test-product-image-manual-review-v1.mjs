import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const page=r('admin-v3/imagens-ia.html');
const js=r('admin-v3/image-automation.js');
const admin=r('supabase/functions/admin-product-images-v1/index.ts');
const grid=r('supabase/functions/product-image-openai-grid18-v1/index.ts');
const gridImage=r('supabase/functions/product-image-openai-grid18-v1/image.mjs');
const policy=r('supabase/functions/product-image-openai-grid18-v1/policy.mjs');
const manual=r('supabase/functions/product-image-manual-v1/index.ts');
const migration=r('supabase/migrations/20260914100500_product_image_manual_review_v1.sql');

// Automatic production remains exactly 18 products at medium quality.
assert.match(gridImage,/f\.append\('quality','medium'\)/);
assert.match(grid,/items\.length!==18/);
assert.match(policy,/sourceRecoverableForGrid/);
assert.match(policy,/return Boolean\(v\)/);
assert.doesNotMatch(grid,/generateSingle|quality','high'/);

// Source inspection can flag crop/cutout/extras without stopping production.
for(const key of ['bad_crop','bad_cutout','extra_elements','product_complete','same_product_confidence','source_quality_score']) assert.match(migration,new RegExp(key));
assert.match(migration,/product_image_source_review_flag_v1/);
assert.match(migration,/image_ai_manual_review_required:=true/);

// Manual review persistence and access controls.
for(const field of ['image_ai_manual_review_required','image_ai_manual_review_reason','image_ai_manual_prompt','image_ai_manual_requested_at','image_ai_manual_requested_by','image_ai_manual_attempts','image_ai_manual_resolved_at']) assert.match(migration,new RegExp(field));
assert.match(migration,/claim_product_image_fallback_v1/);
assert.match(migration,/p\.is_active=true/);
assert.match(migration,/image_ai_manual_requested_at is not null/);
assert.match(migration,/dispatch_product_image_manual_worker_v1/);
assert.match(migration,/product-image-manual-v1/);
assert.match(migration,/revoke all on function public\.dispatch_product_image_manual_worker_v1\(\) from public/i);
assert.match(migration,/grant execute on function public\.dispatch_product_image_manual_worker_v1\(\) to service_role, postgres/i);
assert.doesNotMatch(migration,/set\s+status='pending',\s*force_individual=true,\s*error_message=coalesce\(error_message,'automatic_retry'\)/i);

// Individual generation exists only as an explicit manual worker.
assert.match(manual,/drain_manual/);
assert.match(manual,/claim_product_image_fallback_v1/);
assert.match(manual,/image_ai_manual_prompt/);
assert.match(manual,/f\.append\('quality','medium'\)/);
assert.match(manual,/manual_only:true/);
for(const key of ['product_complete','bad_crop','bad_cutout','extra_elements','professional_photo','natural_contact_shadow']) assert.match(manual,new RegExp(key));
assert.match(manual,/image_ai_manual_review_required:false/);
assert.match(manual,/image_url:url/);

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
assert.match(admin,/bad_images:badRows\.data/);
assert.match(admin,/manual_action_required/);

// Manual review comparison: source x generated, zoom, approve-as-is or regenerate with written guidance.
for(const id of ['repairSourceImage','repairGeneratedImage','approveGeneratedManual','imageZoomDialog','imageZoomImage']) assert.match(page,new RegExp(`id=["']${id}["']`));
assert.match(page,/Original \/ Referência/);
assert.match(page,/Gerada \/ Candidata/);
assert.match(js,/approve_manual/);
assert.match(js,/data-zoom-image/);
assert.match(js,/repairSourceImage/);
assert.match(js,/repairGeneratedImage/);
assert.match(admin,/action==="approve_manual"/);
assert.match(admin,/image_ai_manual_review_required:false/);
assert.match(admin,/image_ai_manual_resolved_at:now/);
assert.match(admin,/image_ai_status:"completed"/);
assert.match(admin,/image_url:candidate/);
assert.match(admin,/image_original_url/);

console.log('product image manual review contract ok');
