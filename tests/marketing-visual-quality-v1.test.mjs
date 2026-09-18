import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Marketing Brain penaliza imagem rejeitada e montagem antiga',()=>{
  const s=read('supabase/functions/admin-marketing-brain-v1/index.ts');
  assert.match(s,/function creativeImageScore/);
  assert.match(s,/status==="rejected"/);
  assert.match(s,/info-lado-a-lado\|lado-a-lado\|comparativo\|montagem\|banner/);
  assert.match(s,/professional_photo/);
  assert.match(s,/fidelity_score/);
  assert.match(s,/visualReady\.length>=2\?visualReady:creativeRanked/);
});
test('hero visual usa imagem AI somente quando status completed',()=>{
  const s=read('supabase/functions/admin-marketing-brain-v1/index.ts');
  assert.match(s,/image_ai_status/);
  assert.match(s,/image_ai_validation/);
  assert.match(s,/image_ai_manual_review_required/);
  assert.match(s,/image_source_origin/);
  assert.match(s,/completed.*image_ai_url/s);
});
test('Edge e homologação compartilham o mesmo motor visual',()=>{
  const edge=read('supabase/functions/admin-marketing-media-v1/index.ts');
  const h=read('scripts/marketing-preview-homologation.mjs');
  assert.match(edge,/\.\/marketing-art-v1\.mjs/);
  assert.match(h,/admin-marketing-media-v1\/marketing-art-v1\.mjs/);
  const art=read('supabase/functions/admin-marketing-media-v1/marketing-art-v1.mjs');
  assert.match(art,/export function artSvg/);
  assert.match(art,/export function textSlideSvg/);
});
