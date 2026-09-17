import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('Estúdio remove mosaico e vídeo local',()=>{
  const h=read('admin/creative-studio.html');
  const j=read('admin/creative-studio.js');
  const d=read('supabase/functions/creative-storyboard-director/index.ts');
  const i=read('supabase/functions/creative-storyboard-image/index.ts');
  assert.doesNotMatch(h,/mosaic_6x6|creative-studio-mosaic\.js/i);
  assert.doesNotMatch(j,/mosaic_6x6|MediaRecorder|captureStream/i);
  assert.doesNotMatch(d,/mosaic_6x6|mosaic_plan|FRAMES_PER_10_SECONDS/i);
  assert.doesNotMatch(i,/mosaic_6x6|previous_mosaic_url|MOSAIC_SIZES/i);
});

test('modo completo usa 2 a 7 imagens conforme duração',()=>{
  const d=read('supabase/functions/creative-storyboard-director/index.ts');
  const j=read('admin/creative-studio.js');
  assert.match(d,/imageCount\s*=\s*\(d:number\)=>d\/10\+1/);
  assert.match(j,/imageCountForDuration/);
  for(const pair of [[10,2],[20,3],[30,4],[40,5],[50,6],[60,7]]){
    assert.match(d,new RegExp(`${pair[0]}`));
  }
});

test('imagens-chave usam papel narrativo e prompt robusto',()=>{
  const d=read('supabase/functions/creative-storyboard-director/index.ts');
  const i=read('supabase/functions/creative-storyboard-image/index.ts');
  for(const token of ['hook','progression','turn','climax','payoff']) assert.match(d,new RegExp(token,'i'));
  for(const token of ['STYLE LOCK','PRODUCT LOCK','CONTINUITY','IMAGE ROLE','NEGATIVE CONSTRAINTS']) assert.match(i,new RegExp(token));
});

test('timeline mostra uma única imagem efetiva por posição',()=>{
  const j=read('admin/creative-studio.js');
  assert.match(j,/approved_image_url\|\|f\.candidate_image_url/);
  assert.doesNotMatch(j,/approved_image_url.*candidate_image_url.*<img/i);
});

test('interface oferece somente modos completo rápido e institucional',()=>{
  const h=read('admin/creative-studio.html');
  for(const v of ['full','product_only','institutional']) assert.match(h,new RegExp(`value="${v}"`));
  assert.doesNotMatch(h,/value="mosaic_6x6"/);
});
