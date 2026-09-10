import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {completePersistedRender,isCarouselJob} from './marketing-render-completion-adapter-v1.mjs';

assert.equal(isCarouselJob({output_spec:{carousel_slide_id:'s',asset_version:1,slide_no:1}}),true);
assert.equal(isCarouselJob({output_spec:{}}),false);

const calls=[];
const fetchImpl=async(url,init)=>{calls.push({url,init});return {ok:true,status:200,json:async()=>({ok:true,job_id:'11111111-1111-4111-8111-111111111111',media_id:'22222222-2222-4222-8222-222222222222',idempotent:false,external_side_effect:false})}};
const job={id:'11111111-1111-4111-8111-111111111111',output_spec:{carousel_slide_id:'33333333-3333-4333-8333-333333333333',asset_version:2,slide_no:3}};
const done=await completePersistedRender({supabaseUrl:'https://abc.supabase.co',serviceRoleKey:'x'.repeat(32),job,mediaId:'22222222-2222-4222-8222-222222222222',worker:'worker-a',fetchImpl});
assert.equal(done.external_side_effect,false);
assert.equal(calls.length,1);
assert.match(calls[0].url,/\/rest\/v1\/rpc\/complete_marketing_carousel_render_v1$/);
assert.doesNotMatch(calls[0].url,/complete_marketing_render_v3/);
assert.equal(calls[0].init.redirect,'error');
const payload=JSON.parse(calls[0].init.body);
assert.equal(payload.p_job_id,job.id);
assert.equal(payload.p_worker,'worker-a');
assert.equal(payload.p_media_id,'22222222-2222-4222-8222-222222222222');

await assert.rejects(()=>completePersistedRender({supabaseUrl:'https://evil.example',serviceRoleKey:'x'.repeat(32),job,mediaId:'22222222-2222-4222-8222-222222222222',worker:'w',fetchImpl}),/invalid_supabase_url/);
await assert.rejects(()=>completePersistedRender({supabaseUrl:'https://abc.supabase.co',serviceRoleKey:'x'.repeat(32),job:{id:job.id,output_spec:{}},mediaId:'22222222-2222-4222-8222-222222222222',worker:'w',fetchImpl}),/carousel_completion_only/);

const here=path.dirname(fileURLToPath(import.meta.url));
const worker=await fs.readFile(path.join(here,'marketing-render-worker-v1.mjs'),'utf8');
assert.match(worker,/carousel_completion_required/);
assert.match(worker,/carousel_worker_identity_required/);
assert.match(worker,/completePersistedRender/);
assert.doesNotMatch(worker,/complete_marketing_render_v3/);
console.log('marketing render completion v1: ok');
