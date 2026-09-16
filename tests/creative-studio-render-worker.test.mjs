import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const workerUrl = new URL('../scripts/creative-studio-render-worker.mjs', import.meta.url);
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const sampleJob = {
  id: '11111111-1111-4111-8111-111111111111', width:1080,height:1920,fps:30,duration_seconds:20,
  product_snapshot:{name:'Di Pomodoro Passata Tomate Nor Foods 680ml',image_url:'https://example.com/product.webp'},
  resolved_assets:{packshot:{kind:'packshot',url:'https://example.com/product.webp'},items:[{kind:'external',url:'https://example.com/tomato.png',need:'tomates maduros'},{kind:'procedural',need:'brilho vermelho'}]},
  creative_plan:{concept:'O vermelho transforma o prato.',hook:'Um fio de macarrão segue um brilho vermelho.',payoff:'O prato ganha cor e celebra o molho.',scenes:[{summary:'Abertura',beat:'hook',sound_intent:'pop'},{summary:'Transformação',beat:'transform',sound_intent:'whoosh'},{summary:'Fechamento',beat:'payoff',sound_intent:'chime'}]}
};

test('worker exporta helpers e preserva parâmetros oficiais do vídeo', async()=>{
  const mod=await import(pathToFileURL(workerUrl.pathname).href);
  assert.equal(mod.pickPackshotUrl(sampleJob),'https://example.com/product.webp');
  assert.equal(mod.buildOutputPath(sampleJob),`${sampleJob.id}/final.mp4`);
  const joined=mod.buildFfmpegArgs(sampleJob,'/tmp/product.webp','/tmp/output.mp4').join(' ');
  assert.match(joined,/1080x1920|1080:1920|1080.*1920/);assert.match(joined,/30/);assert.match(joined,/20/);assert.doesNotMatch(joined,/voice|narrat/i);
});

test('worker usa exatamente as RPCs transacionais existentes',async()=>{
  const mod=await import(pathToFileURL(workerUrl.pathname).href);
  assert.deepEqual(mod.claimPayload('worker-1',1200),{p_worker_id:'worker-1',p_lease_seconds:1200});
  assert.deepEqual(mod.completePayload(sampleJob,'worker-1','x/final.mp4',{codec:'h264'}),{p_job_id:sampleJob.id,p_worker_id:'worker-1',p_output_path:'x/final.mp4',p_output_metadata:{codec:'h264'},p_actual_cost_brl:0});
  assert.deepEqual(mod.failPayload(sampleJob,'worker-1','boom'),{p_job_id:sampleJob.id,p_worker_id:'worker-1',p_error:'boom'});
});

test('compositor usa roteiro, assets complementares e SFX sem substituir o packshot',async()=>{
  const mod=await import(pathToFileURL(workerUrl.pathname).href);
  assert.equal(typeof mod.buildCompositionPlan,'function');
  const composition=mod.buildCompositionPlan(sampleJob);
  assert.equal(composition.duration,20);
  assert.equal(composition.scenes.length,3);
  assert.equal(composition.packshot.url,'https://example.com/product.webp');
  assert.ok(composition.assets.some(a=>a.url==='https://example.com/tomato.png'));
  assert.ok(composition.assets.some(a=>a.kind==='procedural'));
  assert.ok(composition.scenes.every(s=>s.start>=0&&s.end>s.start));
  assert.ok(composition.scenes.some(s=>s.sfx==='whoosh'));
});

test('workflow do worker é manual e agendado, sem expor secrets',()=>{
  const yaml=read('.github/workflows/creative-studio-render-worker.yml');
  assert.match(yaml,/workflow_dispatch:/);assert.match(yaml,/schedule:/);assert.match(yaml,/node-version:\s*22/);assert.match(yaml,/ffmpeg\s+-version/);assert.match(yaml,/SUPABASE_URL:\s*\$\{\{\s*secrets\.SUPABASE_URL\s*\}\}/);assert.match(yaml,/SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{\s*secrets\.SUPABASE_SERVICE_ROLE_KEY\s*\}\}/);assert.match(yaml,/node scripts\/creative-studio-render-worker\.mjs/);
});
