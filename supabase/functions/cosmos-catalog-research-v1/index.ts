import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

// COSMOS_WORKER_SECRET: autorização adicional servidor-servidor.
// COSMOS_API_TOKEN e COSMOS_USER_AGENT: fornecidos na conta Cosmos.
// Disabled no banco até homologar credenciais, termo de uso e coleta.
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default
      || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  }
})();
const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const json = (body, status=200) => new Response(JSON.stringify(body), {
  status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
});
const digits = v => String(v ?? "").replace(/\D/g,"");
const clean = (v,n=250) => String(v ?? "").replace(/[\x00-\x1f\x7f]/g," ").trim().slice(0,n);
const num = v => Number.isFinite(Number(v)) && Number(v)>0 ? Number(v):null;
const allowedKeys = ["description","gtin","brand","gpc","ncm","net_weight","gross_weight","height","width","length","thumbnail"];
function proposal(item, requestedGtin) {
  const exact=digits(item?.gtin)===requestedGtin;
  const dims=["height","width","length"].map(k=>num(item?.[k]));
  // Sem unidade física comprovada, apenas valores brutos em modo revisão.
  const normalized = {
    description:clean(item?.description,250)||null,
    brand:clean(item?.brand?.name,100)||null,
    gpc:clean(item?.gpc?.code,30)||null,
    ncm_candidate:clean(item?.ncm?.code,12)||null,
    net_weight_raw:num(item?.net_weight),
    gross_weight_raw:num(item?.gross_weight),
    dimensions_raw:dims.every(Boolean) ? {height:dims[0],width:dims[1],length:dims[2]}:null,
    thumbnail_source:typeof item?.thumbnail==="string" && item.thumbnail.startsWith("https://")
      ? clean(item.thumbnail,500):null
  };
  return {exact, normalized};
}
async function record(request, state, status, patch, error) {
  const completed = await db.from("cosmos_research_requests").update({
    state, http_status:status||null, completed_at:new Date().toISOString(),
    error_code:error||null
  }).eq("id",request.request_id);
  if(completed.error) throw completed.error;
  const research = await db.from("cosmos_product_research").update({
    status:patch?.status||"blocked",
    response_summary:patch?.summary||{},
    proposed_attributes:patch?.proposal||{},
    identity_verified:patch?.identityVerified===true,
    source_license_confirmed:false,
    last_http_status:status||null,
    last_error:error||null,
    retry_after:patch?.retryAfter||null,
    researched_at:patch?.status==="review"?new Date().toISOString():null,
    updated_at:new Date().toISOString()
  }).eq("product_id",request.selected_product_id)
    .eq("gtin",request.selected_gtin);
  if(research.error) throw research.error;
}
Deno.serve(async (req) => {
  if(req.method!=="POST") return json({error:"method_not_allowed"},405);
  const workerSecret=Deno.env.get("COSMOS_WORKER_SECRET")||"";
  if(!workerSecret) return json({error:"worker_secret_not_configured"},503);
  if(req.headers.get("x-cosmos-worker-secret")!==workerSecret)
    return json({error:"unauthorized"},401);

  let body={};
  try {body=await req.json()} catch {return json({error:"invalid_json"},400)}
  const maxItems=Math.max(1,Math.min(5,Number(body?.max_items)||1));
  if(body?.mode!=="execute") {
    const conf=await db.from("cosmos_research_config").select("enabled,daily_limit,max_batch").eq("id",true).maybeSingle();
    if(conf.error) return json({error:"configuration_unavailable"},500);
    return json({mode:"preview",config:conf.data,updates_products:false,updates_bling:false,requires_cosmos_credentials:true});
  }
  const token=Deno.env.get("COSMOS_API_TOKEN")||"";
  const ua=Deno.env.get("COSMOS_USER_AGENT")||"";
  if(!token||!ua) return json({error:"cosmos_credentials_not_configured"},503);

  const processed=[];
  for(let i=0;i<maxItems;i++){
    const reservation=await db.rpc("cosmos_research_reserve_next");
    if(reservation.error) return json({error:"queue_reservation_failed",processed},500);
    const item=reservation.data?.[0];
    if(!item) break;
    let httpStatus=0;
    try{
      const response=await fetch("https://cosmos.bluesoft.com.br/api/gtins/"
        +encodeURIComponent(item.selected_gtin)+".json",{
        method:"GET",headers:{"X-Cosmos-Token":token,"User-Agent":ua,"Accept":"application/json"},
        signal:AbortSignal.timeout(10000)
      });
      httpStatus=response.status;
      if(httpStatus===404){
        await record(item,"not_found",404,{status:"not_found"},null);
        processed.push({gtin:item.selected_gtin,state:"not_found"});
        continue;
      }
      if(httpStatus===429){
        const tomorrow=new Date(Date.now()+26*60*60*1000).toISOString();
        await record(item,"rate_limited",429,{status:"retry",retryAfter:tomorrow},"quota_or_throttle");
        processed.push({gtin:item.selected_gtin,state:"rate_limited"});
        break;
      }
      if(!response.ok){
        await record(item,"http_error",httpStatus,{
          status:"retry",retryAfter:new Date(Date.now()+48*60*60*1000).toISOString()
        },"http_"+httpStatus);
        processed.push({gtin:item.selected_gtin,state:"http_error"});
        if(httpStatus===401||httpStatus===403)break;
        continue;
      }
      const payload=await response.json();
      const candidate=proposal(payload,item.selected_gtin);
      if(!candidate.exact){
        await record(item,"invalid_identity",200,{status:"blocked"},"gtin_mismatch");
        processed.push({gtin:item.selected_gtin,state:"gtin_mismatch"});
        continue;
      }
      // Dados exclusivamente em fila de revisão; sem atualizar products/fiscal ou publicar imagens.
      await record(item,"found",200,{
        status:"review",identityVerified:true,
        summary:{source:"cosmos",gtin:item.selected_gtin,observed_at:new Date().toISOString(),
          observed_fields:allowedKeys.filter(k=>payload?.[k]!=null),
          review_required:true},
        proposal:candidate.normalized
      },null);
      processed.push({gtin:item.selected_gtin,state:"review"});
    }catch(e){
      await record(item,"network_error",httpStatus,{
        status:"retry",retryAfter:new Date(Date.now()+48*60*60*1000).toISOString()
      },clean(e?.name||"network_error",50));
      processed.push({gtin:item.selected_gtin,state:"network_error"});
    }
  }
  return json({mode:"execute",processed_count:processed.length,processed,
    updates_products:false,updates_bling:false,auto_family_inheritance:false});
});