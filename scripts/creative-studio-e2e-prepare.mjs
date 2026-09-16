import {writeFileSync} from 'node:fs';
import {buildCreativeSignals} from '../marketing/creative-studio/creative-mining.js';
import {validateCreativePlan} from '../marketing/creative-studio/validate-plan.js';
import {proceduralKind} from '../marketing/creative-studio/asset-request.js';
import {assessRenderAssets} from '../marketing/creative-studio/render-assets.js';
import {compileTimeline} from '../marketing/creative-studio/timeline.js';
import {buildRenderJob} from '../marketing/creative-studio/job-contract.js';
import {buildStudioCostSnapshot} from '../marketing/creative-studio/cost-policy.js';

const SUPABASE_URL=process.env.SUPABASE_URL?.replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY;
const PREFERRED_PRODUCT=process.env.CREATIVE_STUDIO_E2E_PRODUCT_ID||'97b235af-8468-401a-8672-e95f23545e78';
if(!SUPABASE_URL||!SERVICE)throw new Error('missing_supabase_e2e_config');
const serverHeaders={apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'};

async function jsonFetch(url,options={}){
  const r=await fetch(url,{...options,headers:{...serverHeaders,...(options.headers||{})},cache:'no-store'});
  const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok)throw new Error(`http_${r.status}:${String(text).slice(0,700)}`);
  return data;
}
async function edge(name,payload){
  const data=await jsonFetch(`${SUPABASE_URL}/functions/v1/${name}`,{method:'POST',body:JSON.stringify(payload)});
  if(data?.ok===false)throw new Error(`${name}:${data.error||'request_failed'}:${data.detail||''}`);
  return data;
}
async function productById(id){
  const fields='id,name,brand,price,offer_price,is_offer,image_url,category,subcategory,description_short,tags,is_active';
  const rows=await jsonFetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(id)}&is_active=eq.true&select=${encodeURIComponent(fields)}&limit=1`);
  return Array.isArray(rows)?rows[0]||null:null;
}
async function fallbackProduct(){
  const fields='id,name,brand,price,offer_price,is_offer,image_url,category,subcategory,description_short,tags,is_active';
  const rows=await jsonFetch(`${SUPABASE_URL}/rest/v1/products?is_active=eq.true&image_url=not.is.null&price=gt.0&select=${encodeURIComponent(fields)}&order=updated_at.desc&limit=1`);
  return Array.isArray(rows)?rows[0]||null:null;
}

const product=(await productById(PREFERRED_PRODUCT))||await fallbackProduct();
if(!product)throw new Error('no_active_product_for_e2e');
const creativeProduct={
  ...product,
  description:product.description_short||'',
  requested_duration:18,
  creative_instruction:'Teste E2E real. Priorize a imagem real do produto e elementos procedurais reutilizáveis; não use narração; não invente preço, oferta ou propriedades do produto.'
};
const signals=buildCreativeSignals(creativeProduct);
const director=await edge('creative-studio-director',{
  product:creativeProduct,
  creativeSignals:signals.candidates,
  recentMemory:[],
  avoidanceProfile:{avoidTerritories:[],avoidConcepts:[],avoidHooks:[],recentSignatures:[]},
  alternate:false
});
const checked=validateCreativePlan(director.plan);
if(!checked.ok)throw new Error(`director_plan_invalid:${checked.errors.join(',')}`);
const plan=checked.plan;

const items=[];let external=0;
const jobKey=`e2e-${process.env.GITHUB_RUN_ID||Date.now()}`;
for(const request of (plan.asset_requests||[])){
  const kind=proceduralKind(request);
  if(kind){items.push({status:'procedural',request,procedural:{kind}});continue}
  const resolved=await edge('creative-studio-assets-v1',{
    action:'resolve',need:request.need,keywords:request.keywords||[],job_key:jobKey,
    external_acquisitions:external,allow_external:true
  });
  if(resolved.external_acquisition)external=Number(resolved.external_acquisitions||external+1);
  items.push({...resolved,request});
}
const assets={...assessRenderAssets(items),externalAcquisitions:external};
if(assets.summary.missing||assets.summary.blocked||assets.summary.ready!==assets.summary.total){
  throw new Error(`e2e_assets_not_ready:${JSON.stringify(assets.summary)}`);
}
const timeline=compileTimeline(plan);
const settings=(await edge('creative-studio-jobs-v1',{action:'settings'})).settings||{};
const cost=buildStudioCostSnapshot({usage:director.usage||{},settings});
if(cost.requiresApproval)throw new Error(`e2e_unexpected_paid_approval:${cost.estimated}`);
const job=buildRenderJob({product,plan,assets,timeline,providerUsage:director.usage||{},cost});
const created=await edge('creative-studio-jobs-v1',{action:'create',job});
const jobId=created?.job?.id;if(!jobId)throw new Error('e2e_job_create_missing_id');
const queued=await edge('creative-studio-jobs-v1',{action:'queue',id:jobId,paid_approved:false});
if(!['queued','rendering','completed'].includes(queued?.job?.status))throw new Error(`e2e_job_not_queued:${queued?.job?.status||'unknown'}`);

const state={job_id:jobId,product_id:product.id,product_name:product.name,concept:plan.concept,territory:plan.territory,duration:plan.duration,estimated_cost_brl:cost.estimated,asset_summary:assets.summary,external_assets:external,director_usage:director.usage||null};
writeFileSync('.creative-studio-e2e-job.json',JSON.stringify(state,null,2));
console.log(JSON.stringify({ok:true,...state}));
