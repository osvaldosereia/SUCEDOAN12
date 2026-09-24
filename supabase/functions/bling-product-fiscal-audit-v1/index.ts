import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BLING_API_BASE="https://api.bling.com.br/Api/v3";
const BLING_OAUTH_URLS=["https://api.bling.com.br/oauth/token","https://api.bling.com.br/Api/v3/oauth/token"];
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
  });
}
function clean(v:any,max=1000){return String(v??"").trim().slice(0,max)}
function digits(v:any){return String(v??"").replace(/\D/g,"")}
function originCode(v:any):number|null{
  const raw=typeof v==="object"&&v!==null ? (v.codigo??v.id??v.valor??v.value) : v;
  const s=String(raw??"").trim();
  return /^[0-8]$/.test(s)?Number(s):null;
}
async function sha256Hex(value:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function authorized(sb:any,req:Request){
  const supplied=clean(req.headers.get("x-dona-antonia-bling-hub-key"),200);
  if(!supplied)return false;
  const q=await sb.rpc("get_bling_hub_key_v2");
  if(q.error||!q.data)return false;
  const a=new TextEncoder().encode(supplied),b=new TextEncoder().encode(String(q.data));
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
async function reserveSlot(sb:any){
  const q=await sb.rpc("reserve_bling_hub_rate_slot_v2",{});
  if(q.error)throw new Error("rate_slot_failed");
  const wait=Math.max(0,Number(q.data||0));if(wait)await sleep(wait);
}
async function oauth(sb:any){
  const owner=crypto.randomUUID();
  const lock=await sb.rpc("claim_bling_hub_oauth_lock_v2",{p_owner:owner,p_ttl_seconds:90});
  if(lock.error)throw new Error("oauth_lock_failed");
  if(lock.data!==true)throw new Error("oauth_busy");
  try{
    const c=await sb.rpc("get_bling_api_credentials_v1");
    if(c.error)throw new Error("credentials_lookup_failed");
    const clientId=clean(c.data?.client_id,500),clientSecret=clean(c.data?.client_secret,500),refreshToken=clean(c.data?.refresh_token,5000);
    if(!clientId||!clientSecret||!refreshToken)throw new Error("bling_credentials_missing");
    const basic=btoa(clientId+":"+clientSecret);
    let response:Response|null=null;let data:any={};let lastCode="";
    for(const oauthUrl of BLING_OAUTH_URLS){
      const body=new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken});
      const attempt=await fetch(oauthUrl,{
        method:"POST",
        headers:{Authorization:"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded",Accept:"1.0","enable-jwt":"1"},
        body,
        signal:AbortSignal.timeout(10000)
      });
      const raw=await attempt.text();let parsed:any={};try{parsed=raw?JSON.parse(raw):{}}catch{}
      response=attempt;data=parsed;lastCode=clean(parsed?.error||parsed?.error_description,120);
      if(attempt.ok&&clean(parsed?.access_token,5000))break;
      if(![403,404,405].includes(attempt.status))break;
    }
    if(!response?.ok||!clean(data?.access_token,5000)){
      throw new Error("oauth_http_"+String(response?.status||0)+(lastCode?":"+lastCode:""));
    }
    const rotated=clean(data?.refresh_token,5000);
    if(rotated&&rotated!==refreshToken){
      const save=await sb.rpc("set_bling_api_refresh_token_v1",{p_refresh_token:rotated});
      if(save.error)throw new Error("refresh_token_persist_failed");
    }
    return clean(data.access_token,5000);
  }finally{
    await sb.rpc("release_bling_hub_oauth_lock_v2",{p_owner:owner});
  }
}
async function blingGet(sb:any,token:string,path:string){
  await reserveSlot(sb);
  const r=await fetch(BLING_API_BASE+path,{
    headers:{Authorization:"Bearer "+token,Accept:"application/json","enable-jwt":"1"},
    signal:AbortSignal.timeout(10000)
  });
  const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
  return {ok:r.ok,status:r.status,data,error:r.ok?"":clean(data?.error?.message||data?.error?.description||raw,500)};
}
function fiscalFromProduct(d:any){
  const t=d?.tributacao&&typeof d.tributacao==="object"?d.tributacao:{};
  const ncm=digits(t?.ncm??d?.ncm);
  const cest=digits(t?.cest??d?.cest);
  const origem=originCode(t?.origem??d?.origem);
  const gtin=digits(d?.gtin);
  const taxGtin=digits(d?.gtinEmbalagem??d?.gtinTributavel??d?.gtinTrib);
  return {
    ncm:/^\d{8}$/.test(ncm)?ncm:null,
    cest:/^\d{7}$/.test(cest)?cest:null,
    origin_code:origem,
    gtin:gtin||null,
    tax_gtin:taxGtin||null,
    fiscal_description:clean(d?.nome,500)||null,
    raw_tributacao:t
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:"server_config"},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!(await authorized(sb,req)))return json({ok:false,error:"unauthorized"},401);

  let body:any={};try{body=await req.json()}catch{}
  const limit=Math.max(1,Math.min(50,Number(body?.limit||25)||25));
  const minRisk=Math.max(0,Math.min(100,Number(body?.min_risk??0)||0));
  const offset=Math.max(0,Number(body?.offset||0)||0);
  const requestedIds=Array.isArray(body?.product_ids)?body.product_ids.map((x:any)=>clean(x,50)).filter(Boolean).slice(0,50):[];

  let productIds:string[]=[];
  let riskMap=new Map<string,{risk_code:string,risk_score:number}>();
  if(requestedIds.length){
    productIds=requestedIds;
  }else{
    const scan=await sb.from("product_fiscal_catalog_scan_v1")
      .select("product_id,risk_code,risk_score")
      .eq("is_active",true)
      .gte("risk_score",minRisk)
      .order("risk_score",{ascending:false})
      .order("product_id",{ascending:true})
      .range(offset,offset+limit-1);
    if(scan.error)return json({ok:false,error:"scan_query_failed",detail:scan.error.message},500);
    for(const row of scan.data||[]){
      productIds.push(String(row.product_id));
      riskMap.set(String(row.product_id),{risk_code:String(row.risk_code||""),risk_score:Number(row.risk_score||0)});
    }
  }
  if(!productIds.length)return json({ok:true,selected:0,read:0,evidence_written:0,external_write:false});

  const pq=await sb.from("products")
    .select("id,name,gtin,ncm,bling_product_id,is_active")
    .in("id",productIds);
  if(pq.error)return json({ok:false,error:"product_query_failed",detail:pq.error.message},500);

  const productMap=new Map((pq.data||[]).map((p:any)=>[String(p.id),p]));
  const missingLinkIds=(pq.data||[]).filter((p:any)=>!Number(p.bling_product_id)).map((p:any)=>String(p.id));
  const linkMap=new Map<string,number>();
  if(missingLinkIds.length){
    const lq=await sb.from("bling_hub_entity_links_v2")
      .select("source_id,bling_id,status")
      .eq("entity_type","product")
      .eq("status","matched")
      .in("source_id",missingLinkIds);
    if(!lq.error)for(const l of lq.data||[])if(Number(l.bling_id))linkMap.set(String(l.source_id),Number(l.bling_id));
  }

  const token=await oauth(sb);
  const evidence:any[]=[];
  const failures:any[]=[];
  let read=0;
  for(const id of productIds){
    const p=productMap.get(id);
    if(!p){failures.push({product_id:id,error:"product_not_found"});continue}
    const blingId=Number(p.bling_product_id||linkMap.get(id)||0);
    if(!blingId){failures.push({product_id:id,error:"bling_product_not_linked"});continue}
    const r=await blingGet(sb,token,"/produtos/"+encodeURIComponent(String(blingId)));
    if(!r.ok){failures.push({product_id:id,bling_product_id:blingId,error:"bling_http_"+r.status});continue}
    read++;
    const d=r.data?.data||{};
    const f=fiscalFromProduct(d);
    const fingerprint=await sha256Hex(JSON.stringify([f.ncm,f.cest,f.origin_code,f.gtin,f.tax_gtin]));
    evidence.push({
      evidence_key:"bling_product_detail:"+blingId+":"+fingerprint,
      product_id:id,
      evidence_type:"bling_product_detail",
      source_name:"Bling ERP",
      document_key:String(blingId),
      gtin:f.gtin||digits(p.gtin)||null,
      ncm:f.ncm,
      cest:f.cest,
      origin_code:f.origin_code,
      fiscal_description:f.fiscal_description||clean(p.name,500)||null,
      observed_at:new Date().toISOString(),
      evidence_payload:{
        bling_product_id:blingId,
        fetched_at:new Date().toISOString(),
        tax_gtin:f.tax_gtin,
        tributacao:f.raw_tributacao,
        risk:riskMap.get(id)||null,
        read_only:true
      }
    });
  }

  if(evidence.length){
    const up=await sb.from("product_fiscal_evidence").upsert(evidence,{onConflict:"evidence_key"});
    if(up.error)return json({ok:false,error:"evidence_upsert_failed",detail:up.error.message,read},500);
  }

  await sb.rpc("refresh_product_fiscal_candidates_r0_3").catch(()=>{});
  await sb.rpc("refresh_product_fiscal_review_state_v1").catch(()=>{});

  return json({
    ok:true,
    selected:productIds.length,
    read,
    evidence_written:evidence.length,
    failures:failures.slice(0,50),
    external_write:false,
    bling_mutations:0
  });
});
