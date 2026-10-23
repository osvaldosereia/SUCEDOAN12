import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const worker=read('supabase/functions/whatsapp-marketing-worker-v1/index.ts');
const strategy=read('vitrine/admin/marketing/strategy-center.js');
const bridge=read('supabase/functions/admin-marketing-strategy-campaign-v1/index.ts');
const repurchase=read('vitrine/admin/marketing/repurchase-center.js');
const basketImage=read('vitrine/admin/basket-lot-image.js');
const admin=read('vitrine/admin/index.html');

test('worker processes only an explicitly created manual batch',()=>{
  assert.match(worker,/if\(parsed\.body\.manual_batch_id\)return processManualBatch/);
  assert.match(worker,/mode:"manual_only"/);
  assert.doesNotMatch(worker,/marketing_claim_dispatch_batch_v1/);
});

test('Strategy can prepare a campaign draft but cannot approve, schedule, or start sends',()=>{
  assert.match(strategy,/materialize_campaign/);
  assert.doesNotMatch(strategy,/scheduleControls|approveThen|sendApproved|approve_send|schedule_send|start_send/);
  assert.match(bridge,/ACTIONS=new Set\(\["materialize_campaign"\]\)/);
  assert.doesNotMatch(bridge,/approve_send|schedule_send|start_send/);
});

test('repurchase handoff includes only distinct ready, consented customers and caps one page at 50',async()=>{
  const path='vitrine/admin/marketing/marketing-repurchase-campaign-audience-v1.mjs';
  assert.equal(existsSync(path),true,'isolated audience helper must exist');
  const {repurchaseCampaignCustomerIds}=await import('../vitrine/admin/marketing/marketing-repurchase-campaign-audience-v1.mjs');
  const rows=[
    {customer_id:'10000000-0000-4000-8000-000000000001',status:'ready',marketing_opt_in:true},
    {customer_id:'10000000-0000-4000-8000-000000000001',status:'ready',marketing_opt_in:true},
    {customer_id:'10000000-0000-4000-8000-000000000002',status:'blocked_opt_out',marketing_opt_in:false},
    {customer_id:'10000000-0000-4000-8000-000000000003',status:'ready',marketing_opt_in:false},
    ...Array.from({length:55},(_,i)=>({customer_id:`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`,status:'ready',marketing_opt_in:true})),
  ];
  const ids=repurchaseCampaignCustomerIds(rows);
  assert.equal(ids.length,50);
  assert.equal(ids[0],'10000000-0000-4000-8000-000000000001');
  assert.equal(new Set(ids).size,50);
  assert.ok(!ids.includes('10000000-0000-4000-8000-000000000002')&&!ids.includes('10000000-0000-4000-8000-000000000003'));
  assert.match(repurchase,/openCampaigns\(\{filters:\{customer_ids/);
});

test('Marketing bootstrap is explicit and independent from basket image generation',()=>{
  assert.match(admin,/marketing-bootstrap\.js\?v=marketing-bootstrap-v1/);
  assert.doesNotMatch(basketImage,/marketing\/(template-center|campaign-entry)\.js/);
  const path='vitrine/admin/marketing/marketing-bootstrap.js';
  assert.equal(existsSync(path),true,'Marketing must have a dedicated bootstrap module');
  const bootstrap=read(path);
  assert.match(bootstrap,/template-center\.js/);
  assert.match(bootstrap,/campaign-entry\.js/);
  assert.match(bootstrap,/template-center\.css/);
});