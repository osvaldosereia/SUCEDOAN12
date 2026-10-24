import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const base=Deno.env.get("SUPABASE_URL")||"";
const key=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
const PHOTO_BUCKET="ean-capture-unknown-photos";
const sniffImage=(buf:Uint8Array)=>{
 if(buf.length>=3&&buf[0]===255&&buf[1]===216&&buf[2]===255)return {contentType:"image/jpeg",ext:"jpg"};
 if(buf.length>=8&&buf[0]===137&&buf[1]===80&&buf[2]===78&&buf[3]===71&&buf[4]===13&&buf[5]===10&&buf[6]===26&&buf[7]===10)return {contentType:"image/png",ext:"png"};
 if(buf.length>=12&&String.fromCharCode(...buf.slice(0,4))==="RIFF"&&String.fromCharCode(...buf.slice(8,12))==="WEBP")return {contentType:"image/webp",ext:"webp"};
 return null;
};
const origins=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(r:Request)=>{
  const o=r.headers.get("origin")||"";
  return {
    "Access-Control-Allow-Origin":origins.has(o)?o:"https://donaantonia.com.br",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Vary":"Origin"
  };
};
const reply=(r:Request,v:unknown,status=200)=>new Response(JSON.stringify(v),{
  status,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const idOk=(x:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(x||""));
const eanOk=(x:unknown)=>/^\d{8,14}$/.test(String(x||""));
const qty=(x:unknown)=>{
  const n=Number(x);
  return Number.isFinite(n)&&n>0&&n<=999999&&Math.round(n*1000)===n*1000?n:null;
};
async function withProductNames(rows:Record<string,unknown>[]){
  const ids=[...new Set(rows.map(row=>String(row.matched_product_id||"")).filter(idOk))];
  const names=new Map<string,string>(),images=new Map<string,string>();
  if(ids.length){
    const products=await db.from("products").select("id,name,image_url").in("id",ids);
    if(products.error)throw products.error;
    for(const product of products.data||[]){names.set(String(product.id),String(product.name||""));if(product.image_url)images.set(String(product.id),String(product.image_url));}
  }
  return rows.map(row=>({...row,product_name:names.get(String(row.matched_product_id||""))||null,product_image_url:images.get(String(row.matched_product_id||""))||null}));
}
async function withCosmosResearch(rows){
  const ids=[...new Set(rows.map(row=>String(row.id||"")).filter(idOk))];
  if(!ids.length)return rows;
  const result=await db.from("cosmos_ean_capture_research_v1")
    .select("capture_id,gtin,status,proposal,response_summary,last_http_status,last_error,researched_at,attempted_at")
    .in("capture_id",ids);
  if(result.error)throw result.error;
  const byId=new Map((result.data||[]).map(item=>[String(item.capture_id),item]));
  const gtins=[...new Set(rows.map(row=>String(row.ean||"")).filter(eanOk))];
  const prior=gtins.length?await db.from("oscb_gtin_research_cache_v1")
    .select("gtin,status,proposal,response_summary,last_http_status,last_error,researched_at,attempted_at")
    .in("gtin",gtins).in("status",["review","not_found"]).not("researched_at","is",null)
    .order("researched_at",{ascending:false}):{data:[],error:null};
  if(prior.error)throw prior.error;
  const byGtin=new Map();
  for(const item of prior.data||[])if(!byGtin.has(String(item.gtin)))byGtin.set(String(item.gtin),item);
  return rows.map(row=>{
    const direct=byId.get(String(row.id));
    const research=direct&&String(direct.gtin)===String(row.ean)?direct:byGtin.get(String(row.ean||""));
    if(!research)return row;
    return {...row,cosmos_research:{
      gtin:research.gtin,status:research.status,proposal:research.proposal||{},
      summary:research.response_summary||{},http_status:research.last_http_status,
      error:research.last_error,researched_at:research.researched_at,attempted_at:research.attempted_at,
      cached_by_gtin:String(research.gtin)===String(row.ean)
    }};
  });
}
const cosmosClean=(value,max=250)=>String(value??"").replace(/[\x00-\x1f\x7f]/g," ").trim().slice(0,max);
const cosmosDigits=(value)=>String(value??"").replace(/\D/g,"");
function cosmosCest(item){
  const raw=item?.cest??item?.cests?.[0]??item?.tax?.cest??null;
  const value=raw&&typeof raw==="object"?(raw.code??raw.value??raw.number??""):raw;
  const digits=cosmosDigits(value);
  return /^\d{7}$/.test(digits)?digits:null;
}
function oscbCandidate(item,gtin){
  const exact=cosmosDigits(item?.ean??item?.gtin)===gtin;
  const ncmValue=item?.ncm?.code??item?.ncm?.codigo??item?.ncm;
  const ncm=cosmosDigits(ncmValue);
  const cestValue=item?.cest?.code??item?.cest?.codigo??item?.cest??null;
  const cestDigits=cosmosDigits(cestValue);
  const positive=(value)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
  return {exact,proposal:{
    description:cosmosClean(item?.nome??item?.description??item?.descricao,250)||null,
    brand:cosmosClean(item?.marca??item?.brand,100)||null,
    gpc_code:null,
    gpc_description:cosmosClean(item?.categoria??item?.category,160)||null,
    category:cosmosClean(item?.categoria??item?.category,160)||null,
    ncm_candidate:/^\d{8}$/.test(ncm)?ncm:null,
    cest_candidate:/^\d{7}$/.test(cestDigits)?cestDigits:null,
    unit:cosmosClean(item?.unid_abr??item?.unit,24)||null,
    unit_description:cosmosClean(item?.unid_desc??item?.unit_description,80)||null,
    packaging:cosmosClean(item?.embalagem??item?.packaging,100)||null,
    manufacturer:cosmosClean(item?.fabricante??item?.manufacturer,120)||null,
    net_weight_raw:positive(item?.peso_liquido??item?.net_weight),
    gross_weight_raw:positive(item?.peso_bruto??item?.gross_weight),
    thumbnail_source:null
  }};
}
async function researchCosmosForCapture(captureId,actorId){
  const capture=await db.from("ean_capture_records_v1").select("id,ean,sync_status")
    .eq("id",captureId).maybeSingle();
  if(capture.error)throw capture.error;
  if(!capture.data)return {error:"leitura_nao_encontrada",status:404};
  if(capture.data.sync_status!=="not_found")return {error:"leitura_nao_esta_na_fila",status:409};
  const gtin=String(capture.data.ean||"");
  const existing=await db.from("cosmos_ean_capture_research_v1")
    .select("gtin,status,proposal,response_summary,last_http_status,last_error,researched_at,attempted_at")
    .eq("capture_id",captureId).maybeSingle();
  if(existing.error)throw existing.error;
  const cached=existing.data;
  const terminal=cached&&cached.gtin===gtin&&["review","not_found"].includes(cached.status)&&cached.researched_at;
  if(terminal)
    return {research:{gtin,status:cached.status,proposal:cached.proposal||{},summary:cached.response_summary||{},
      http_status:cached.last_http_status,error:cached.last_error,researched_at:cached.researched_at,cached:true}};
  // Reserve quota atomically and reuse a durable result by GTIN, even if this
  // capture is deleted, recreated or corrected later.
  const dailyLimit=45;
  const username=Deno.env.get("OSCBR_USERNAME")||"";
  const password=Deno.env.get("OSCBR_PASSWORD")||"";
  if(!username||!password){
    const global=await db.from("oscb_gtin_research_cache_v1")
      .select("gtin,status,proposal,response_summary,last_http_status,last_error,attempted_at,researched_at")
      .eq("gtin",gtin).maybeSingle();
    if(global.error)throw global.error;
    const c=global.data;
    if(c&&["review","not_found"].includes(c.status)&&c.researched_at){
      const row={capture_id:captureId,gtin,status:c.status,proposal:c.proposal||{},
        response_summary:{...(c.response_summary||{}),reused_by_gtin:true},last_http_status:c.last_http_status,
        last_error:c.last_error,attempted_at:c.attempted_at,researched_at:c.researched_at,
        researched_by:actorId,updated_at:new Date().toISOString()};
      const saved=await db.from("cosmos_ean_capture_research_v1").upsert(row,{onConflict:"capture_id"});
      if(saved.error)throw saved.error;
      return {research:{gtin,status:row.status,proposal:row.proposal,summary:row.response_summary,
        http_status:row.last_http_status,error:row.last_error,researched_at:row.researched_at,cached:true}};
    }
    return {error:"credenciais_oscb_nao_configuradas",status:503};
  }
  const reservation=await db.rpc("oscb_reserve_gtin_lookup_v1",{
    p_gtin:gtin,p_capture_id:captureId,p_actor_id:actorId,p_daily_limit:dailyLimit
  });
  if(reservation.error)throw reservation.error;
  const reserved=reservation.data||{};
  if(reserved.reason==="cached"&&reserved.cache){
    const c=reserved.cache;
    const row={capture_id:captureId,gtin,status:c.status,proposal:c.proposal||{},
      response_summary:{...(c.response_summary||{}),reused_by_gtin:true},
      last_http_status:c.last_http_status,last_error:c.last_error,
      attempted_at:c.attempted_at,researched_at:c.researched_at,researched_by:actorId,updated_at:new Date().toISOString()};
    const saved=await db.from("cosmos_ean_capture_research_v1").upsert(row,{onConflict:"capture_id"});
    if(saved.error)throw saved.error;
    return {research:{gtin,status:row.status,proposal:row.proposal,summary:row.response_summary,
      http_status:row.last_http_status,error:row.last_error,researched_at:row.researched_at,cached:true}};
  }
  if(!reserved.allowed){
    const errors:Record<string,{error:string,status:number}>={
      in_progress:{error:"pesquisa_em_andamento",status:409},
      retry_later:{error:"aguarde_5_minutos_antes_de_tentar_novamente",status:429},
      daily_limit:{error:"limite_diario_oscb_atingido",status:429},
      rate_limit:{error:"limite_de_2_consultas_por_minuto_oscb",status:429}
    };
    return errors[reserved.reason]||{error:"consulta_oscb_nao_autorizada",status:409};
  }
  const attemptId=String(reserved.attempt_id||"");
  const attemptedAt=new Date().toISOString();
  const queued=await db.from("cosmos_ean_capture_research_v1").upsert({
    capture_id:captureId,gtin,status:"researching",proposal:{},response_summary:{source:"oscb"},
    last_http_status:null,last_error:null,attempted_at:attemptedAt,researched_at:null,
    researched_by:actorId,updated_at:attemptedAt
  },{onConflict:"capture_id"});
  if(queued.error){
    await db.from("oscb_gtin_research_cache_v1").update({status:"error",last_error:"capture_mirror_failed",updated_at:new Date().toISOString()}).eq("gtin",gtin);
    if(attemptId)await db.from("oscb_gtin_research_attempts_v1").update({outcome:"error",http_status:500}).eq("id",attemptId);
    if(queued.error.code==="23503")return {error:"leitura_nao_encontrada",status:404};
    throw queued.error;
  }
  const finish=async(status,httpStatus,proposal={},summary={},error=null)=>{
    const now=new Date().toISOString();
    const state={
      gtin,status,proposal,response_summary:summary,last_http_status:httpStatus,last_error:error,
      researched_at:["review","not_found"].includes(status)?now:null,updated_at:now
    };
    const saved=await db.from("cosmos_ean_capture_research_v1").update(state).eq("capture_id",captureId).eq("gtin",gtin);
    if(saved.error)throw saved.error;
    const globalSaved=await db.from("oscb_gtin_research_cache_v1").update({
      status,proposal,response_summary:summary,last_http_status:httpStatus,last_error:error,
      researched_at:["review","not_found"].includes(status)?now:null,updated_at:now
    }).eq("gtin",gtin);
    if(globalSaved.error)throw globalSaved.error;
    if(attemptId){const attempt=await db.from("oscb_gtin_research_attempts_v1").update({outcome:status,http_status:httpStatus}).eq("id",attemptId);if(attempt.error)throw attempt.error;}
    return {gtin,status,proposal,summary,http_status:httpStatus,error,researched_at:["review","not_found"].includes(status)?now:null};
  };
  let upstreamStage="oauth";
  try{
    const credentialBytes=new TextEncoder().encode(username+":"+password);
    let credentialBinary="";
    for(const byte of credentialBytes)credentialBinary+=String.fromCharCode(byte);
    const authResponse=await fetch("https://gtin.rscsistemas.com.br/api/v3/oauth/token",{
      method:"POST",
      headers:{
        "Authorization":"Basic "+btoa(credentialBinary),
        "Accept":"application/json",
        "User-Agent":"DonaAntoniaVitrine/1.0"
      },
      signal:AbortSignal.timeout(10000)
    });
    if(authResponse.status===429){
      await finish("error",429,{}, {source:"oscb",gtin},"auth_rate_limit");
      return {error:"limite_ou_frequencia_oscb",status:429};
    }
    if(!authResponse.ok){
      await finish("error",authResponse.status,{}, {source:"oscb",gtin},
        authResponse.status===401||authResponse.status===403?"invalid_credentials":"auth_http_"+authResponse.status);
      return {error:authResponse.status===401||authResponse.status===403
        ?"credencial_oscb_negada":"falha_autenticacao_oscb",status:502};
    }
    const authPayload=await authResponse.json();
    const accessToken=String(authPayload?.access_token||authPayload?.token||"");
    if(!accessToken){
      await finish("error",200,{}, {source:"oscb",gtin},"access_token_missing");
      return {error:"resposta_autenticacao_oscb_invalida",status:502};
    }
    upstreamStage="gtin";
    const response=await fetch("https://gtin.rscsistemas.com.br/api/v3/gtin/"+encodeURIComponent(gtin),{
      method:"GET",
      headers:{
        "Authorization":"Bearer "+accessToken,
        "Accept":"application/json",
        "User-Agent":"DonaAntoniaVitrine/1.0"
      },
      signal:AbortSignal.timeout(10000)
    });
    if(response.status===404){
      const research=await finish("not_found",404,{}, {source:"oscb",gtin});
      return {research};
    }
    if(response.status===429){
      await finish("error",429,{}, {source:"oscb",gtin},"quota_or_throttle");
      return {error:"limite_ou_frequencia_oscb",status:429};
    }
    if(!response.ok){
      await finish("error",response.status,{}, {source:"oscb",gtin},"http_"+response.status);
      return {error:response.status===401||response.status===403
        ?"credencial_oscb_negada":"falha_oscb_http_"+response.status,status:502};
    }
    const payload=await response.json();
    const candidate=oscbCandidate(payload,gtin);
    if(!candidate.exact){
      await finish("error",200,{}, {source:"oscb",gtin},"gtin_divergente");
      return {error:"gtin_divergente_na_resposta_oscb",status:502};
    }
    const research=await finish("review",200,candidate.proposal,{
      source:"oscb",gtin,observed_at:new Date().toISOString(),review_required:true
    });
    return {research};
  }catch(error){
    const errName=error instanceof Error?error.name:"network_error";
    const errMessage=error instanceof Error?error.message:"unknown_error";
    console.error("[oscb] upstream request failed",{stage:upstreamStage,name:errName,message:errMessage.slice(0,240)});
    await finish("error",0,{}, {source:"oscb",gtin},errName);
    return {error:"falha_de_rede_oscb",status:502};
  }
}
async function withProductNamesOnRow(payload:Record<string,unknown>){
  if(payload&&payload.row&&typeof payload.row==="object"&&!Array.isArray(payload.row)){
    payload.row=(await withProductNames([payload.row as Record<string,unknown>]))[0];
  }
  return payload;
}
const validDate=(x:unknown)=>{
  if(x===null||x===undefined||x==="")return null;
  const s=String(x);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error("data_invalida");
  const d=new Date(s+"T12:00:00Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new Error("data_invalida");
  return s;
};
async function authorized(r:Request){
  const t=(r.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!t)return null;
  const {data:user,error}=await db.auth.getUser(t);
  if(error||!user?.user?.id)return null;
  const admin=await db.from("admin_users").select("role,is_active").eq("user_id",user.user.id).maybeSingle();
  if(admin.error||admin.data?.is_active!==true)return null;
  return {id:user.user.id,role:admin.data.role};
}
Deno.serve(async (r:Request)=>{
  if(r.method==="OPTIONS")return new Response(null,{status:204,headers:cors(r)});
  if(!base||!key)return reply(r,{ok:false,error:"servico_indisponivel"},503);
  if(!["GET","POST"].includes(r.method))return reply(r,{ok:false,error:"metodo_invalido"},405);
  const origin=r.headers.get("origin")||"";
  if(origin&&!origins.has(origin))return reply(r,{ok:false,error:"origem_nao_permitida"},403);
  try{
    const actor=await authorized(r);
    if(!actor)return reply(r,{ok:false,error:"sessao_admin_invalida"},401);
    const url=new URL(r.url);
    const action=url.searchParams.get("action")||(r.method==="GET"?"list":"add");
    if(r.method==="GET"&&action==="photo_url"){
      const rowId=url.searchParams.get("id")||"";
      if(!idOk(rowId))return reply(r,{ok:false,error:"leitura_invalida"},400);
      const selected=await db.from("ean_capture_records_v1").select("photo_path").eq("id",rowId).maybeSingle();
      if(selected.error)throw selected.error;
      if(!selected.data?.photo_path)return reply(r,{ok:false,error:"foto_nao_encontrada"},404);
      const signed=await db.storage.from(PHOTO_BUCKET).createSignedUrl(selected.data.photo_path,120);
      if(signed.error)throw signed.error;
      return reply(r,{ok:true,url:signed.data.signedUrl});
    }
    if(r.method==="GET"&&action==="product_research"){
      const selected=await db.from("oscb_product_research_v1")
        .select("product_id,gtin,status,proposal,response_summary,last_http_status,last_error,attempts,researched_at,updated_at",{count:"exact"})
        .eq("review_state","pending").in("status",["review","not_found","error"])
        .order("updated_at",{ascending:false}).limit(1000);
      if(selected.error)throw selected.error;
      const terminal=(selected.data||[]).filter((item:any)=>item.status!=="error"||Number(item.attempts||0)>=3);
      const ids=[...new Set(terminal.map((item:any)=>String(item.product_id)).filter(idOk))];
      const products=ids.length?await db.from("products")
        .select("id,name,gtin,ncm,brand,category,unit,packaging,image_url,created_at,updated_at")
        .in("id",ids):{data:[],error:null};
      if(products.error)throw products.error;
      const byId=new Map((products.data||[]).map((item:any)=>[String(item.id),item]));
      const items=terminal.map((item:any)=>({...item,product:byId.get(String(item.product_id))||null}));
      return reply(r,{ok:true,count:items.length,items});
    }
    if(r.method==="GET"&&action==="list"){
      const limit=Math.max(1,Math.min(100,Number(url.searchParams.get("limit"))||60));
      const offset=Math.max(0,Math.min(2000000,Number(url.searchParams.get("offset"))||0));
      const filter=url.searchParams.get("filter")||"all";
      if(!["all","pending","found","not_found"].includes(filter))return reply(r,{ok:false,error:"filtro_invalido"},400);
      let query=db.from("ean_capture_records_v1")
        .select("id,ean,quantity,expires_on,sync_status,matched_product_id,photo_path,photo_captured_at,created_at,updated_at,synced_at",{count:"exact"})
        .order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+limit-1);
      if(filter!=="all")query=query.eq("sync_status",filter);
      const [records,stats]=await Promise.all([query,db.rpc("ean_capture_stats_v1")]);
      if(records.error||stats.error)throw records.error||stats.error;
      const named=await withProductNames(records.data||[]);
      const rows=await withCosmosResearch(named);
      return reply(r,{ok:true,rows,count:records.count||0,summary:stats.data||{},next_offset:offset+rows.length,
        has_more:offset+rows.length<(records.count||0)});
    }
    if(r.method!=="POST")return reply(r,{ok:false,error:"metodo_invalido"},405);
    if(action==="photo"){
      const form=await r.formData().catch(()=>null);
      const recordId=String(form?.get("id")||"");
      const file=form?.get("file");
      if(!idOk(recordId)||!(file instanceof File)||file.size<80||file.size>5242880)
        return reply(r,{ok:false,error:"foto_invalida_ate_5mb"},400);
      const existing=await db.from("ean_capture_records_v1")
        .select("id,sync_status,photo_path").eq("id",recordId).maybeSingle();
      if(existing.error)throw existing.error;
      if(!existing.data)return reply(r,{ok:false,error:"leitura_nao_encontrada"},404);
      if(existing.data.sync_status!=="not_found")return reply(r,{ok:false,error:"foto_somente_para_ean_nao_encontrado"},409);
      const bytes=new Uint8Array(await file.arrayBuffer());
      const image=sniffImage(bytes);
      if(!image)return reply(r,{ok:false,error:"formato_de_foto_invalido"},400);
      const path=recordId+"/"+crypto.randomUUID()+"."+image.ext;
      const uploaded=await db.storage.from(PHOTO_BUCKET).upload(path,bytes,{
        contentType:image.contentType,upsert:false,cacheControl:"3600"
      });
      if(uploaded.error)throw uploaded.error;
      const saved=await db.from("ean_capture_records_v1")
       .update({photo_path:path,photo_captured_at:new Date().toISOString(),updated_at:new Date().toISOString()})
       .eq("id",recordId).eq("sync_status","not_found")
       .select("id,ean,quantity,expires_on,sync_status,matched_product_id,photo_path,photo_captured_at,created_at,updated_at,synced_at")
       .maybeSingle();
      if(saved.error||!saved.data){
        await db.storage.from(PHOTO_BUCKET).remove([path]).catch(()=>{});
        if(saved.error)throw saved.error;
        return reply(r,{ok:false,error:"leitura_nao_encontrada_ou_sincronizada"},409);
      }
      if(existing.data.photo_path&&existing.data.photo_path!==path)
       await db.storage.from(PHOTO_BUCKET).remove([existing.data.photo_path]).catch(()=>{});
      return reply(r,{ok:true,row:saved.data});
    }
    const input=await r.json().catch(()=>null);
    if(!input||typeof input!=="object"||Array.isArray(input))return reply(r,{ok:false,error:"dados_invalidos"},400);
    if(action==="product_review_mark"){
      const productId=String(input.product_id||"");
      if(!idOk(productId))return reply(r,{ok:false,error:"produto_invalido"},400);
      const current=await db.from("oscb_product_research_v1")
        .select("status,attempts,review_state").eq("product_id",productId).maybeSingle();
      if(current.error)throw current.error;
      if(!current.data)return reply(r,{ok:false,error:"sugestao_nao_encontrada"},404);
      if(current.data.review_state!=="pending")return reply(r,{ok:false,error:"revisao_ja_concluida"},409);
      if(!["review","not_found"].includes(String(current.data.status))&&
        !(current.data.status==="error"&&Number(current.data.attempts||0)>=3))
        return reply(r,{ok:false,error:"pesquisa_ainda_nao_terminal"},409);
      const saved=await db.from("oscb_product_research_v1").update({
        review_state:"reviewed",reviewed_at:new Date().toISOString(),reviewed_by:actor.id,updated_at:new Date().toISOString()
      }).eq("product_id",productId).eq("review_state","pending").select("product_id").maybeSingle();
      if(saved.error)throw saved.error;
      if(!saved.data)return reply(r,{ok:false,error:"revisao_ja_concluida"},409);
      return reply(r,{ok:true,product_id:productId});
    }
    if(action==="search_products"){
      const raw=String(input.query||"").trim();
      const term=raw.replace(/[^a-zA-Z0-9À-ÿ _-]/g," ").replace(/\s+/g," ").trim().slice(0,80);
      if(term.length<2)return reply(r,{ok:false,error:"consulta_muito_curta"},400);
      const pattern="%"+term+"%";
      const found=await db.from("products")
        .select("id,name,gtin,sku,stock,ncm,image_url,is_active,brand,packaging")
        .eq("is_active",true)
        .or("name.ilike."+pattern+",brand.ilike."+pattern+",sku.ilike."+pattern+",gtin.ilike."+pattern)
        .order("name",{ascending:true}).limit(30);
      if(found.error)throw found.error;
      return reply(r,{ok:true,rows:found.data||[]});
    }
    if(action==="repair_ean"){
      if(!idOk(input.id)||!eanOk(input.ean))return reply(r,{ok:false,error:"leitura_ou_ean_invalido"},400);
      const existing=await db.from("ean_capture_records_v1").select("id,sync_status")
        .eq("id",input.id).maybeSingle();
      if(existing.error)throw existing.error;
      if(!existing.data)return reply(r,{ok:false,error:"leitura_nao_encontrada"},404);
      if(existing.data.sync_status!=="not_found")return reply(r,{ok:false,error:"leitura_nao_esta_na_fila"},409);
      const edited=await db.from("ean_capture_records_v1").update({
        ean:input.ean,matched_product_id:null,sync_status:"pending",synced_at:null,updated_at:new Date().toISOString()
      }).eq("id",input.id).eq("sync_status","not_found").select("id").maybeSingle();
      if(edited.error)throw edited.error;
      if(!edited.data)return reply(r,{ok:false,error:"leitura_ja_alterada"},409);
      const synced=await db.rpc("ean_capture_sync_one_v1",{p_capture_id:input.id});
      if(synced.error)throw synced.error;
      if(synced.data?.ok!==true)return reply(r,{ok:false,error:synced.data?.error||"leitura_nao_encontrada"},404);
      return reply(r,await withProductNamesOnRow(synced.data));
    }
    if(action==="add"){
      if(!eanOk(input.ean)||!idOk(input.client_entry_id)||qty(input.quantity)===null)
        return reply(r,{ok:false,error:"ean_quantidade_ou_id_invalido"},400);
      const expires=validDate(input.expires_on);
      const inserted=await db.from("ean_capture_records_v1").upsert({
        client_entry_id:input.client_entry_id,ean:input.ean,quantity:qty(input.quantity),
        expires_on:expires,created_by:actor.id
      },{onConflict:"client_entry_id",ignoreDuplicates:true}).select("id,ean,quantity,expires_on,sync_status,created_at").maybeSingle();
      if(inserted.error)throw inserted.error;
      let record=inserted.data;
      if(!record){
        const existing=await db.from("ean_capture_records_v1")
          .select("id,ean,quantity,expires_on,sync_status,created_at")
          .eq("client_entry_id",input.client_entry_id).single();
        if(existing.error)throw existing.error;
        if(existing.data.ean!==input.ean)return reply(r,{ok:false,error:"id_reutilizado"},409);
        record=existing.data;
      }
      return reply(r,{ok:true,row:record},201);
    }
    if(action==="edit"){
      if(!idOk(input.id)||qty(input.quantity)===null||(input.ean!==undefined&&!eanOk(input.ean)))
        return reply(r,{ok:false,error:"quantidade_ou_ean_invalido"},400);
      const expires=validDate(input.expires_on);
      const existing=await db.from("ean_capture_records_v1").select("id,ean,photo_path").eq("id",input.id).maybeSingle();
      if(existing.error)throw existing.error;
      if(!existing.data)return reply(r,{ok:false,error:"leitura_nao_encontrada"},404);
      const eanChanged=input.ean!==undefined&&input.ean!==existing.data.ean;
      const patch={quantity:qty(input.quantity),expires_on:expires,updated_at:new Date().toISOString()};
      if(eanChanged)Object.assign(patch,{ean:input.ean,matched_product_id:null,sync_status:"pending",synced_at:null,photo_path:null,photo_captured_at:null});
      const edited=await db.from("ean_capture_records_v1").update(patch).eq("id",input.id).eq("ean",existing.data.ean)
        .select("id,ean,quantity,expires_on,sync_status,matched_product_id,photo_path,photo_captured_at,created_at,updated_at,synced_at").maybeSingle();
      if(edited.error)throw edited.error;
      if(!edited.data)return reply(r,{ok:false,error:"leitura_ja_alterada"},409);
      if(eanChanged&&existing.data.photo_path)await db.storage.from(PHOTO_BUCKET).remove([existing.data.photo_path]).catch(()=>{});
      return reply(r,{ok:true,row:edited.data});
    }
    if(action==="delete"){
      if(!idOk(input.id))return reply(r,{ok:false,error:"leitura_invalida"},400);
      const existing=await db.from("ean_capture_records_v1").select("id,photo_path").eq("id",input.id).maybeSingle();
      if(existing.error)throw existing.error;
      if(!existing.data)return reply(r,{ok:false,error:"leitura_nao_encontrada"},404);
      const deleted=await db.from("ean_capture_records_v1").delete().eq("id",input.id).select("id").maybeSingle();
      if(deleted.error)throw deleted.error;
      if(!deleted.data)return reply(r,{ok:false,error:"leitura_ja_removida"},409);
      if(existing.data.photo_path)await db.storage.from(PHOTO_BUCKET).remove([existing.data.photo_path]).catch(()=>{});
      return reply(r,{ok:true,deleted_id:input.id});
    }
    if(action==="sync_one"){
      if(!idOk(input.id))return reply(r,{ok:false,error:"leitura_invalida"},400);
      const synced=await db.rpc("ean_capture_sync_one_v1",{p_capture_id:input.id});
      if(synced.error)throw synced.error;
      if(synced.data?.ok!==true)return reply(r,{ok:false,error:synced.data?.error||"leitura_nao_encontrada"},404);
      return reply(r,await withProductNamesOnRow(synced.data));
    }
    if(action==="sync"){
      const synced=await db.rpc("ean_capture_sync_v1");
      if(synced.error)throw synced.error;
      return reply(r,{ok:true,summary:synced.data});
    }
    if(action==="cosmos_research"){
      if(!idOk(input.id))return reply(r,{ok:false,error:"leitura_invalida"},400);
      const result=await researchCosmosForCapture(input.id,actor.id);
      if(result.error)return reply(r,{ok:false,error:result.error},result.status||400);
      return reply(r,{ok:true,research:result.research});
    }
    if(action==="link_product"||action==="create_inactive"){
      if(!idOk(input.id))return reply(r,{ok:false,error:"leitura_invalida"},400);
      const ncm=String(input.ncm||"").replace(/\D/g,"");
      if(ncm&&ncm.length!==8)return reply(r,{ok:false,error:"ncm_invalido"},400);
      if(action==="link_product"&&!idOk(input.product_id))return reply(r,{ok:false,error:"produto_invalido"},400);
      const name=String(input.name||"").trim().slice(0,180);
      if(action==="create_inactive"&&!name)return reply(r,{ok:false,error:"nome_obrigatorio"},400);
      const rawAttrs=input.attributes&&typeof input.attributes==="object"&&!Array.isArray(input.attributes)?input.attributes:{};
      const img=String(rawAttrs.image_url||"");
      let imageUrl=null;try{const u=new URL(img);if(u.protocol==="https:"&&u.hostname==="cdn-cosmos.bluesoft.com.br")imageUrl=u.toString()}catch{}
      const cest=String(rawAttrs.cest||"").replace(/\D/g,"");
      if(cest&&cest.length!==7)return reply(r,{ok:false,error:"cest_invalido"},400);
      const attrs={
        brand:String(rawAttrs.brand||"").trim().slice(0,100)||null,
        category:String(rawAttrs.category||"").trim().slice(0,160)||null,
        description:String(rawAttrs.description||"").trim().slice(0,1000)||null,
        cest:cest||null,gpc:String(rawAttrs.gpc||"").trim().slice(0,40)||null,
        net_weight_raw:Number.isFinite(Number(rawAttrs.net_weight_raw))?Number(rawAttrs.net_weight_raw):null,
        gross_weight_raw:Number.isFinite(Number(rawAttrs.gross_weight_raw))?Number(rawAttrs.gross_weight_raw):null,
        researched_at:String(rawAttrs.researched_at||"").slice(0,60)||null,
        image_url:imageUrl
      };
      const resolved=await db.rpc("ean_capture_resolve_v2",{
        p_capture_id:input.id,p_mode:action==="link_product"?"link":"create",
        p_product_id:action==="link_product"?input.product_id:null,
        p_name:action==="create_inactive"?name:null,p_ncm:ncm||null,p_attributes:attrs
      });
      if(resolved.error)throw resolved.error;
      if(resolved.data?.ok!==true)return reply(r,{ok:false,error:resolved.data?.error||"resolucao_falhou"},409);
      return reply(r,await withProductNamesOnRow(resolved.data));
    }

    return reply(r,{ok:false,error:"acao_invalida"},404);
  }catch(e){
    if(String(e instanceof Error?e.message:e)==="data_invalida")return reply(r,{ok:false,error:"data_invalida"},400);
    console.error("ean_capture_error",e);
    return reply(r,{ok:false,error:"operacao_falhou"},500);
  }
});
