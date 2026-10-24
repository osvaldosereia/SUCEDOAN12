import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const base = Deno.env.get("SUPABASE_URL") || "";
const key = (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; } catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; } })();
const db = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (x: unknown, status=200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type":"application/json", "Cache-Control":"no-store" } });
const clean = (v: unknown, n=250) => String(v ?? "").replace(/[\\x00-\\x1f\\x7f]/g, " ").replace(/\\s+/g, " ").trim().slice(0,n);
const digits = (v: unknown) => String(v ?? "").replace(/\\D/g,"");
const wait = (ms:number) => new Promise(r=>setTimeout(r,ms));

function candidate(item:any, gtin:string) {
  const ncm=digits(item?.ncm?.code ?? item?.ncm?.codigo ?? item?.ncm);
  const cest=digits(item?.cest?.code ?? item?.cest?.codigo ?? item?.cest);
  const positive=(v:any)=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
  return {
    exact: digits(item?.ean ?? item?.gtin)===gtin,
    proposal: {
      description:clean(item?.nome ?? item?.description ?? item?.descricao,250)||null,
      brand:clean(item?.marca ?? item?.brand,100)||null,
      category:clean(item?.categoria ?? item?.category,160)||null,
      ncm_candidate:/^\\d{8}$/.test(ncm)?ncm:null,
      cest_candidate:/^\\d{7}$/.test(cest)?cest:null,
      unit:clean(item?.unid_abr ?? item?.unit,24)||null,
      unit_description:clean(item?.unid_desc ?? item?.unit_description,80)||null,
      packaging:clean(item?.embalagem ?? item?.packaging,100)||null,
      manufacturer:clean(item?.fabricante ?? item?.manufacturer,120)||null,
      net_weight_raw:positive(item?.peso_liquido ?? item?.net_weight),
      gross_weight_raw:positive(item?.peso_bruto ?? item?.gross_weight),
      thumbnail_source:null
    }
  };
}

async function persistResearch(capture:any, gtin:string, status:string, proposal:any, httpStatus:number|null, error:string|null, summary:any, attemptId?:string|null) {
  const now=new Date().toISOString();
  const researchedAt=(status==="review"||status==="not_found")?now:null;
  const global=await db.from("oscb_gtin_research_cache_v1").upsert({
    gtin,status,proposal:proposal||{},response_summary:summary||{},
    last_http_status:httpStatus,last_error:error,attempted_at:now,researched_at:researchedAt,updated_at:now
  },{onConflict:"gtin"});
  if(global.error) throw global.error;
  if(capture) {
    const local=await db.from("cosmos_ean_capture_research_v1").upsert({
      capture_id:capture.id,gtin,status,proposal:proposal||{},response_summary:summary||{},
      last_http_status:httpStatus,last_error:error,attempted_at:now,researched_at:researchedAt,updated_at:now
    },{onConflict:"capture_id"});
    if(local.error) throw local.error;
  }
  if(attemptId) {
    const a=await db.from("oscb_gtin_research_attempts_v1").update({outcome:status,http_status:httpStatus}).eq("id",attemptId);
    if(a.error) throw a.error;
  }
  return {gtin,status,proposal:proposal||{},summary:summary||{},http_status:httpStatus,researched_at:researchedAt};
}

async function createFromProposal(capture:any, proposal:any, summary:any) {
  const name=clean(proposal?.description,180);
  if(!name) return {created:false,reason:"nome_ausente"};
  const ncm=digits(proposal?.ncm_candidate);
  const attrs={
    brand:clean(proposal?.brand,100)||null,
    category:clean(proposal?.category,160)||null,
    description:clean(proposal?.description,1000)||null,
    cest:/^\\d{7}$/.test(digits(proposal?.cest_candidate))?digits(proposal?.cest_candidate):null,
    gpc:"",
    net_weight_raw:proposal?.net_weight_raw??null,
    gross_weight_raw:proposal?.gross_weight_raw??null,
    researched_at:new Date().toISOString(),
    image_url:null
  };
  const localResearch=await db.from("cosmos_ean_capture_research_v1").upsert({
    capture_id:capture.id,gtin:capture.ean,status:"review",proposal:proposal||{},
    response_summary:summary||{},attempted_at:new Date().toISOString(),researched_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  },{onConflict:"capture_id"});
  if(localResearch.error) throw localResearch.error;
  const resolved=await db.rpc("ean_capture_resolve_v2",{
    p_capture_id:capture.id,p_mode:"create",p_product_id:null,p_name:name,
    p_ncm:/^\\d{8}$/.test(ncm)?ncm:null,p_attributes:attrs
  });
  if(resolved.error) throw resolved.error;
  if(resolved.data?.ok!==true) return {created:false,reason:String(resolved.data?.error||"resolucao_falhou")};
  const id=resolved.data?.product?.id ?? resolved.data?.product_id;
  if(id) {
    const current=await db.from("products").select("metadata").eq("id",id).maybeSingle();
    if(!current.error) {
      const metadata={...(current.data?.metadata||{}),oscb_catalog:{
        source:"oscb",gtin:capture.ean,researched_at:new Date().toISOString(),
        category:attrs.category,unit:proposal?.unit||null,unit_description:proposal?.unit_description||null,
        packaging:proposal?.packaging||null,manufacturer:proposal?.manufacturer||null,
        response_summary:summary||{}
      }};
      await db.from("products").update({metadata}).eq("id",id);
    }
  }
  const marked=await db.from("cosmos_ean_capture_research_v1").update({
    response_summary:{...(summary||{}),worker_action:"created_inactive",worker_processed_at:new Date().toISOString()}
  }).eq("capture_id",capture.id);
  if(marked.error) throw marked.error;
  return {created:true,product_id:id||null,active:false,stock:0};
}

async function providerLookup(gtin:string, credentials:{username:string,password:string}) {
  const bytes=new TextEncoder().encode(credentials.username+":"+credentials.password);
  let binary=""; for(const b of bytes) binary+=String.fromCharCode(b);
  const auth=await fetch("https://gtin.rscsistemas.com.br/api/v3/oauth/token",{
    method:"POST",headers:{Authorization:"Basic "+btoa(binary),Accept:"application/json","User-Agent":"DonaAntoniaVitrine/1.0"},
    signal:AbortSignal.timeout(12000)
  });
  if(!auth.ok) return {status:"error",http:auth.status,error:auth.status===401||auth.status===403?"invalid_credentials":"oauth_http_"+auth.status};
  const tokenPayload=await auth.json();
  const token=String(tokenPayload?.access_token||tokenPayload?.token||"");
  if(!token) return {status:"error",http:200,error:"access_token_missing"};
  const res=await fetch("https://gtin.rscsistemas.com.br/api/v3/gtin/"+encodeURIComponent(gtin),{
    method:"GET",headers:{Authorization:"Bearer "+token,Accept:"application/json","User-Agent":"DonaAntoniaVitrine/1.0"},
    signal:AbortSignal.timeout(12000)
  });
  if(res.status===404) return {status:"not_found",http:404,error:null};
  if(res.status===429) return {status:"error",http:429,error:"provider_throttle"};
  if(!res.ok) return {status:"error",http:res.status,error:"gtin_http_"+res.status};
  const data=await res.json();
  const c=candidate(data,gtin);
  if(!c.exact) return {status:"error",http:200,error:"gtin_mismatch"};
  return {status:"review",http:200,error:null,proposal:c.proposal};
}

Deno.serve(async (req:Request) => {
  if(req.method!=="POST") return json({ok:false,error:"method_not_allowed"},405);
  const secret=req.headers.get("x-oscb-worker-secret")||"";
  const checked=await db.rpc("oscb_catalog_worker_authorized_v1",{p_secret:secret});
  if(checked.error||checked.data!==true) return json({ok:false,error:"unauthorized"},401);

  const dryRun=(await req.clone().json().catch(()=>({})))?.dry_run===true;
  const username=Deno.env.get("OSCBR_USERNAME")||"";
  const password=Deno.env.get("OSCBR_PASSWORD")||"";
  if(!username||!password) return json({ok:false,state:"credentials_missing",message:"OSCBR secrets are not configured"},503);

  const captures=await db.from("ean_capture_records_v1")
    .select("id,ean,sync_status,created_at,created_by")
    .eq("sync_status","not_found").order("created_at",{ascending:true}).limit(200);
  if(captures.error) return json({ok:false,error:"capture_queue_unavailable"},500);

  let lookupCapture:any=null;
  let cachedCreates=0;
  for(const cap of captures.data||[]) {
    const cacheRes=await db.from("oscb_gtin_research_cache_v1")
      .select("status,proposal,response_summary,last_http_status,last_error,researched_at")
      .eq("gtin",cap.ean).maybeSingle();
    if(cacheRes.error) return json({ok:false,error:"research_cache_unavailable"},500);
    const cache=cacheRes.data;
    if(cache&&cache.status==="review"&&cache.researched_at) {
      const local=await db.from("cosmos_ean_capture_research_v1").select("response_summary")
        .eq("capture_id",cap.id).maybeSingle();
      if(local.data?.response_summary?.worker_processed_at) continue;
      if(dryRun) return json({ok:true,dry_run:true,mode:"new_ean_cached_create",capture_id:cap.id});
      const result=await createFromProposal(cap,cache.proposal||{},cache.response_summary||{});
      if(!result.created) {
        await db.from("cosmos_ean_capture_research_v1").upsert({
          capture_id:cap.id,gtin:cap.ean,status:"review",proposal:cache.proposal||{},
          response_summary:{...(cache.response_summary||{}),worker_action:"manual_review",worker_reason:result.reason,worker_processed_at:new Date().toISOString()},
          last_http_status:cache.last_http_status,last_error:cache.last_error,researched_at:cache.researched_at,updated_at:new Date().toISOString()
        },{onConflict:"capture_id"});
      }
      cachedCreates++;
      if(cachedCreates>=5) return json({ok:true,mode:"new_ean_cached_results",created_or_reviewed:cachedCreates});
      continue;
    }
    if(cache&&cache.status==="not_found"&&cache.researched_at) {
      await db.from("cosmos_ean_capture_research_v1").upsert({
        capture_id:cap.id,gtin:cap.ean,status:"not_found",proposal:cache.proposal||{},
        response_summary:{...(cache.response_summary||{}),worker_action:"terminal_not_found"},
        last_http_status:cache.last_http_status,last_error:cache.last_error,researched_at:cache.researched_at,updated_at:new Date().toISOString()
      },{onConflict:"capture_id"});
      continue;
    }
    const count=await db.from("oscb_gtin_research_attempts_v1").select("id",{count:"exact",head:true}).eq("gtin",cap.ean);
    if((count.count||0)>=3) continue;
    lookupCapture=cap; break;
  }

  if(lookupCapture) {
    if(dryRun) return json({ok:true,dry_run:true,mode:"lookup_new_ean",capture_id:lookupCapture.id,gtin:lookupCapture.ean});
    const reservation=await db.rpc("oscb_reserve_gtin_lookup_v1",{
      p_gtin:lookupCapture.ean,p_capture_id:lookupCapture.id,p_actor_id:null,p_daily_limit:45
    });
    if(reservation.error) return json({ok:false,error:"quota_reservation_failed"},500);
    if(!reservation.data?.allowed) return json({ok:true,mode:"new_ean_deferred",reason:reservation.data?.reason||"not_allowed"});
    const attemptId=String(reservation.data.attempt_id||"");
    let result;
    try { result=await providerLookup(lookupCapture.ean,{username,password}); }
    catch(e) { result={status:"error",http:null,error:e instanceof Error?e.name:"network_error"}; }
    const saved=await persistResearch(lookupCapture,lookupCapture.ean,result.status,result.proposal||{},result.http??null,result.error||null,
      {source:"oscb",gtin:lookupCapture.ean,observed_at:new Date().toISOString(),review_required:result.status==="review"},attemptId);
    if(result.status==="review") {
      const created=await createFromProposal(lookupCapture,result.proposal||{},saved.summary);
      return json({ok:true,mode:"new_ean_review",gtin:lookupCapture.ean,result:created.created?"created_inactive":"manual_review",reason:created.reason||null});
    }
    return json({ok:true,mode:"new_ean_"+result.status,gtin:lookupCapture.ean,http_status:result.http??null});
  }

  const products=await db.from("products").select("id,gtin,name,ncm,brand,category")
    .not("gtin","is",null).order("created_at",{ascending:true}).limit(3000);
  if(products.error) return json({ok:false,error:"product_review_queue_unavailable"},500);
  const ids=(products.data||[]).map((x:any)=>x.id);
  const reviewed=ids.length?await db.from("oscb_product_research_v1").select("product_id,status,attempts,researched_at").in("product_id",ids):{data:[],error:null};
  if(reviewed.error) return json({ok:false,error:"product_review_state_unavailable"},500);
  const byId=new Map((reviewed.data||[]).map((x:any)=>[String(x.product_id),x]));
  let product:any=null;
  for(const item of products.data||[]) {
    const state:any=byId.get(String(item.id));
    if(!state || ((state.status==="error"||state.status==="researching")&&Number(state.attempts||0)<3)) { product=item; break; }
  }
  if(!product) return json({ok:true,mode:"idle",unmatched_remaining:(captures.data||[]).length,existing_products_remaining:0});

  if(dryRun) return json({ok:true,dry_run:true,mode:"review_existing_product",product_id:product.id,gtin:product.gtin});
  const prev:any=byId.get(String(product.id));
  const reservation=await db.rpc("oscb_reserve_gtin_lookup_v1",{
    p_gtin:product.gtin,p_capture_id:null,p_actor_id:null,p_daily_limit:45
  });
  if(reservation.error) return json({ok:false,error:"quota_reservation_failed"},500);
  if(!reservation.data?.allowed) {
    const cached=reservation.data?.reason==="cached"?reservation.data?.cache:null;
    if(cached) {
      const now=new Date().toISOString();
      const savedCache=await db.from("oscb_product_research_v1").upsert({
        product_id:product.id,gtin:product.gtin,status:cached.status,proposal:cached.proposal||{},
        response_summary:{...(cached.response_summary||{}),existing_product_id:product.id,review_only:true,
          existing_name:product.name,existing_ncm:product.ncm,existing_brand:product.brand},
        last_http_status:cached.last_http_status,last_error:cached.last_error,
        attempts:Number(prev?.attempts||0),attempted_at:cached.attempted_at||now,
        researched_at:cached.researched_at||now,updated_at:now
      },{onConflict:"product_id"});
      if(savedCache.error) return json({ok:false,error:"product_review_save_failed"},500);
      return json({ok:true,mode:"existing_review_cached",product_id:product.id});
    }
    return json({ok:true,mode:"existing_review_deferred",reason:reservation.data?.reason||"not_allowed"});
  }
  const attemptNo=Number(prev?.attempts||0)+1;
  const staged=await db.from("oscb_product_research_v1").upsert({
    product_id:product.id,gtin:product.gtin,status:"researching",attempts:attemptNo,
    attempted_at:new Date().toISOString(),updated_at:new Date().toISOString()
  },{onConflict:"product_id"});
  if(staged.error) return json({ok:false,error:"product_review_claim_failed"},500);
  const attemptId=String(reservation.data.attempt_id||"");
  let result;
  try { result=await providerLookup(product.gtin,{username,password}); }
  catch(e) { result={status:"error",http:null,error:e instanceof Error?e.name:"network_error"}; }
  const now=new Date().toISOString();
  const proposal=result.proposal||{};
  const response=await persistResearch(null,product.gtin,result.status,proposal,result.http??null,result.error||null,
    {source:"oscb",gtin:product.gtin,observed_at:now,review_required:true,existing_product_id:product.id},attemptId);
  const saved=await db.from("oscb_product_research_v1").upsert({
    product_id:product.id,gtin:product.gtin,status:result.status,proposal,
    response_summary:{source:"oscb",observed_at:now,existing_product_id:product.id,review_only:true,
      existing_name:product.name,existing_ncm:product.ncm,existing_brand:product.brand},
    last_http_status:result.http??null,last_error:result.error||null,attempts:attemptNo,
    attempted_at:now,researched_at:response.researched_at,updated_at:now
  },{onConflict:"product_id"});
  if(saved.error) return json({ok:false,error:"product_review_save_failed"},500);

  // Never overwrite existing product details automatically. These are suggestions for a later review screen.
  if(result.status==="not_found") return json({ok:true,mode:"existing_review_not_found",product_id:product.id});
  if(result.status==="error") return json({ok:true,mode:"existing_review_error",product_id:product.id});
  return json({ok:true,mode:"existing_review_suggestion",product_id:product.id,fields_suggested:Object.keys(proposal).filter((k:string)=>proposal[k]!=null).length});
});