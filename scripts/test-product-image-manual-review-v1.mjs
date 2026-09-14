import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const r=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const page=r('admin-v3/imagens-ia.html');
const js=r('admin-v3/image-automation.js');
const css=r('admin-v3/image-automation.css');
const admin=r('supabase/functions/admin-product-images-v1/index.ts');
const grid=r('supabase/functions/product-image-openai-grid18-v1/index.ts');
const gridImage=r('supabase/functions/product-image-openai-grid18-v1/image.mjs');
const policy=r('supabase/functions/product-image-openai-grid18-v1/policy.mjs');
const manual=r('supabase/functions/product-image-manual-v1/index.ts');
const migration=r('supabase/migrations/20260914100500_product_image_manual_review_v1.sql');
const candidateFallback=r('supabase/migrations/20260914185000_product_image_manual_candidate_fallback_v1.sql');
const sourceSafetyUrl=new URL('../supabase/migrations/20260914193500_product_image_manual_source_safety_v2.sql',import.meta.url);
assert.ok(existsSync(sourceSafetyUrl),'manual source safety v2 migration must exist');
const sourceSafety=readFileSync(sourceSafetyUrl,'utf8');

assert.match(gridImage,/f\.append\('quality','medium'\)/);
assert.match(grid,/items\.length!==18/);
assert.match(policy,/sourceRecoverableForGrid/);
assert.match(policy,/return Boolean\(v\)/);
assert.doesNotMatch(grid,/generateSingle|quality','high'/);
for(const key of ['bad_crop','bad_cutout','extra_elements','product_complete','same_product_confidence','source_quality_score']) assert.match(migration,new RegExp(key));
assert.match(migration,/product_image_source_review_flag_v1/);
assert.match(migration,/image_ai_manual_review_required:=true/);
for(const field of ['image_ai_manual_review_required','image_ai_manual_review_reason','image_ai_manual_prompt','image_ai_manual_requested_at','image_ai_manual_requested_by','image_ai_manual_attempts','image_ai_manual_resolved_at']) assert.match(migration,new RegExp(field));
assert.match(manual,/drain_manual/);
assert.match(manual,/claim_product_image_fallback_v1/);
assert.match(manual,/image_ai_manual_prompt/);
assert.match(manual,/f\.append\('quality','medium'\)/);
assert.match(manual,/manual_only:true/);
assert.match(page,/value="bad_images"/);
for(const id of ['statBadImages','repairManualPrompt','generateIndividualManual']) assert.match(page,new RegExp(`id=["']${id}["']`));
assert.match(js,/generate_manual/);
assert.match(admin,/generate_manual/);
assert.match(admin,/dispatch_product_image_manual_worker_v1/);
assert.match(admin,/dispatch_product_image_grid18_worker_v2/);
assert.match(admin,/bad_images:badRows\.data/);
for(const id of ['repairSourceImage','repairGeneratedImage','approveGeneratedManual','imageZoomDialog','imageZoomImage']) assert.match(page,new RegExp(`id=["']${id}["']`));
assert.match(page,/Original \/ Referência/);
assert.match(page,/Gerada \/ Candidata/);
assert.match(js,/approve_manual/);
assert.match(admin,/action==="approve_manual"/);
assert.match(admin,/image_ai_manual_review_required:false/);
assert.match(admin,/image_ai_manual_resolved_at:now/);
assert.match(admin,/image_ai_status:"completed"/);
assert.match(admin,/image_url:candidate/);
assert.match(admin,/image_original_url/);
assert.match(js,/['"]&quot;['"]/);

// Product cards are vertical, photo-forward and four columns on desktop.
assert.match(css,/\.issue-list[^\{]*\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/s);
assert.match(css,/\.image-results[^\{]*\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/s);
assert.match(css,/\.issue-row[^\{]*\{[^}]*display:flex[^}]*flex-direction:column/s);
assert.match(css,/\.issue-thumb[^\{]*\{[^}]*width:100%[^}]*aspect-ratio:1/s);

// Bad images support explicit selection and immediate bulk approval.
for(const id of ['badImageBulkActions','selectAllBadImages','selectedBadImagesCount','bulkApproveSelected']) assert.match(page,new RegExp(`id=["']${id}["']`));
assert.match(js,/selectedBadImages:new Set\(\)/);
assert.match(js,/data-bulk-select/);
assert.match(js,/bulk_approve_manual/);
assert.match(js,/product_ids:/);
assert.doesNotMatch(js,/confirm\([^)]*Aprovar selecionadas/s);
assert.match(admin,/action==="bulk_approve_manual"/);
assert.match(admin,/product_ids/);
assert.match(admin,/approved/);
assert.match(admin,/skipped/);

// Manual review must always expose a selectable trusted candidate when a visible
// source/current image exists, even when generation did not produce image_ai_url.
assert.match(candidateFallback,/product_image_manual_candidate_fallback_v1/);
assert.match(candidateFallback,/image_ai_manual_review_required/);
assert.match(candidateFallback,/image_ai_url/);
assert.match(candidateFallback,/image_source_url/);
assert.match(candidateFallback,/image_url/);
assert.match(candidateFallback,/githubusercontent/);
assert.match(candidateFallback,/supabase/);
assert.match(candidateFallback,/create trigger/i);
assert.match(candidateFallback,/update public\.products/i);
assert.match(candidateFallback,/image_ai_status[^\n]*processing/i);

// Generation prompts must explicitly discard the source environment and force a
// solid #ECECEC background across the whole canvas. Validation must hard-fail
// white backgrounds, source-background remnants and white borders.
for(const source of [gridImage,manual]){
  assert.match(source,/não preserve o fundo da imagem original/i);
  assert.match(source,/fundo branco/i);
  assert.match(source,/moldura branca/i);
  assert.match(source,/ocupar toda a imagem/i);
  assert.match(source,/#ECECEC/);
  assert.match(source,/original_background_visible/);
  assert.match(source,/white_background/);
  assert.match(source,/white_border/);
}

// Manual regeneration must accept clean originals stored under /sources/grid18/
// while still rejecting generated /openai/grid18/ outputs as references. The
// claim must also consider image_original_url, which the worker already fetches.
assert.match(sourceSafety,/sources\\\/grid18/i);
assert.match(sourceSafety,/openai\\\/grid18/i);
assert.match(sourceSafety,/image_original_url/);
assert.match(sourceSafety,/claim_product_image_fallback_v1/);

console.log('product image manual review contract ok');
