import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('homologação usa o mesmo motor visual do Edge renderer',()=>{
  const h=read('scripts/marketing-preview-homologation.mjs');
  assert.match(h,/admin-marketing-media-v1\/marketing-art-v1\.mjs/);
  assert.match(h,/artSvg/);
  assert.match(h,/textSlideSvg/);
});
test('homologação é sem IA, sem publicação e gera vídeo real',()=>{
  const h=read('scripts/marketing-preview-homologation.mjs');
  assert.match(h,/ai_used:false/);
  assert.match(h,/external_publish:false/);
  assert.match(h,/queue_marketing_light_video_preview_v1/);
  assert.match(h,/renderOneVideo/);
});
test('workflow one shot não possui cron',()=>{
  const w=read('.github/workflows/marketing-preview-homologation.yml');
  assert.match(w,/marketing-preview-homologation-run-once/);
  assert.match(w,/workflow_dispatch/);
  assert.doesNotMatch(w,/schedule:/);
  assert.match(w,/sharp@0\.33\.5/);
});
