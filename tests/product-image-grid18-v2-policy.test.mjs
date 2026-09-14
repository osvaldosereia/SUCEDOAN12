import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firebaseProductActive,
  sourceInspectionAccepted,
  sourceRecoverableForGrid,
  finalValidationAccepted,
} from '../supabase/functions/product-image-openai-grid18-v1/policy.mjs';
import {parseResearchJson} from '../supabase/functions/product-image-openai-grid18-v1/research.mjs';

test('Firebase boolean ativo is authoritative', () => {
  assert.equal(firebaseProductActive({ ativo: true, situacao: 'I' }), true);
  assert.equal(firebaseProductActive({ ativo: false, situacao: 'A' }), false);
});

test('Firebase status fallback recognizes active and inactive variants', () => {
  assert.equal(firebaseProductActive({ situacao: 'A' }), true);
  assert.equal(firebaseProductActive({ status: 'ATIVO' }), true);
  assert.equal(firebaseProductActive({ situacao: 'I' }), false);
  assert.equal(firebaseProductActive({ status: 'INATIVO' }), false);
  assert.equal(firebaseProductActive({ status: 'INACTIVE' }), false);
  assert.equal(firebaseProductActive(null), false);
});

test('source inspection hard-rejects crop, bad cutout, extras and incomplete product', () => {
  const clean = {same_product_confidence:0.98,product_complete:true,bad_crop:false,bad_cutout:false,extra_elements:false,front_or_usable_view:true,source_quality_score:0.94};
  assert.equal(sourceInspectionAccepted(clean), true);
  assert.equal(sourceInspectionAccepted({ ...clean, bad_crop: true }), false);
  assert.equal(sourceInspectionAccepted({ ...clean, bad_cutout: true }), false);
  assert.equal(sourceInspectionAccepted({ ...clean, extra_elements: true }), false);
  assert.equal(sourceInspectionAccepted({ ...clean, product_complete: false }), false);
});

test('a complete identifiable source with removable clutter can still feed the grid after web research fails', () => {
  const messy={same_product_confidence:0.97,product_complete:true,bad_crop:true,bad_cutout:false,extra_elements:true,front_or_usable_view:true,source_quality_score:0.72};
  assert.equal(sourceInspectionAccepted(messy),false);
  assert.equal(sourceRecoverableForGrid(messy),true);
  assert.equal(sourceRecoverableForGrid({...messy,product_complete:false}),false);
  assert.equal(sourceRecoverableForGrid({...messy,bad_cutout:true}),false);
  assert.equal(sourceRecoverableForGrid({...messy,same_product_confidence:0.70}),false);
});

test('final validation only accepts a clean professional whole product', () => {
  const clean = {same_product:true,packaging_color_match:true,shape_match:true,product_complete:true,bad_crop:false,bad_cutout:false,extra_elements:false,professional_photo:true,natural_contact_shadow:true,fidelity_score:0.95,composition_score:0.94,cutout_score:0.95,background_score:0.96};
  assert.equal(finalValidationAccepted(clean), true);
  assert.equal(finalValidationAccepted({ ...clean, extra_elements: true }), false);
  assert.equal(finalValidationAccepted({ ...clean, bad_crop: true }), false);
  assert.equal(finalValidationAccepted({ ...clean, product_complete: false }), false);
  assert.equal(finalValidationAccepted({ ...clean, fidelity_score: 0.89 }), false);
  assert.equal(finalValidationAccepted({ ...clean, cutout_score: 0.89 }), false);
});

test('research parser accepts strict JSON and fenced JSON but rejects prose-only content', () => {
  assert.equal(parseResearchJson('{"found":true,"confidence":0.9}').found,true);
  assert.equal(parseResearchJson('```json\n{"found":false,"confidence":0.2}\n```').found,false);
  assert.throws(()=>parseResearchJson('não encontrei imagem confiável'),/research_invalid_json/);
});
