import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_HOST="ssbesxgaijknwsjbsbcz.supabase.co";
const OPENAI_URL="https://api.openai.com/v1/responses";
const RICH_VERSION="v2";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=800)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const obj=(v:unknown):Record<string,any>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{};
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"").slice(0,32);
const score=(v:unknown)=>Math.max(0,Math.min(1,Number(v||0)));
const nullable=(v:unknown,max=300)=>clean(v,max)||null;
function safeHttpUrl(v:unknown){try{const raw=clean(v,1400);if(!raw)return null;const u=new URL(raw);if(!/^https?:$/.test(u.protocol))return null;if(!u.hostname||/^(localhost|127\.|0\.0\.0\.0|::1$)/i.test(u.hostname))return null;return u.toString()}catch{return null}}
function validNcm(v:unknown,confidence:unknown){const n=digits(v);return n.length===8&&score(confidence)>=0.80?n:null}
async function sha256Hex(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("")}
function finalText(data:any){return arr(data?.output).filter((x:any)=>x?.type==="message").flatMap((x:any)=>arr(x.content)).filter((x:any)=>x?.type==="output_text").map((x:any)=>String(x.text||"")).join("").trim()}
function commercialDescription(value:unknown){
  let s=clean(value,900)
    .replace(/\(\[[^\]]+\]\(https?:\/\/[^)]+\)\)/gi," ")
    .replace(/\[[^\]]+\]\(https?:\/\/[^)]+\)/gi," ")
    .replace(/https?:\/\/\S+/gi," ");
  const sentences=s.split(/(?<=[.!?])\s+/).filter(x=>!/(\bEAN\b|\bGTIN\b|varejist|fonte|cat[aá]logo|p[aá]gina|pesquisa|explicitamente associado)/i.test(x));
  return clean(sentences.join(" "),900)||clean(s,900);
}

const productSchema={
  type:"object",additionalProperties:false,
  properties:{
    found:{type:"boolean"},confidence:{type:"number",minimum:0,maximum:1},
    name:{type:"string",maxLength:300},brand:{type:"string",maxLength:160},manufacturer:{type:"string",maxLength:180},
    packaging:{type:"string",maxLength:160},unit:{type:"string",maxLength:40},category:{type:"string",maxLength:120},subcategory:{type:"string",maxLength:120},
    description:{type:"string",maxLength:900},net_content:{type:"string",maxLength:120},gross_weight:{type:"string",maxLength:120},
    dimensions:{
      type:"object",additionalProperties:false,
      properties:{length_cm:{type:"number",minimum:0},width_cm:{type:"number",minimum:0},height_cm:{type:"number",minimum:0},confidence:{type:"number",minimum:0,maximum:1}},
      required:["length_cm","width_cm","height_cm","confidence"]
    },
    ncm:{type:"string",maxLength:20},ncm_confidence:{type:"number",minimum:0,maximum:1},ncm_evidence_summary:{type:"string",maxLength:500},
    image_url:{type:"string",maxLength:1400},image_source_page_url:{type:"string",maxLength:1400},image_confidence:{type:"number",minimum:0,maximum:1},
    evidence_summary:{type:"string",maxLength:700}
  },
  required:["found","confidence","name","brand","manufacturer","packaging","unit","category","subcategory","description","net_content","gross_weight","dimensions","ncm","ncm_confidence","ncm_evidence_summary","image_url","image_source_page_url","image_confidence","evidence_summary"]
};

const INSTRUCTIONS=`Você pesquisa produtos de varejo brasileiro a partir de EAN/GTIN para cadastro interno da Dona Antônia.
Use busca na web e confirme primeiro que o EAN/GTIN pertence ao produto. Priorize fabricante, documentos técnicos/fiscais, distribuidores confiáveis e grandes varejistas que mostrem explicitamente o código.
Nunca invente correspondência. Se a identidade do produto não estiver suficientemente comprovada, found=false.
Quando identificar, preencha somente dados sustentados pelas fontes: nome comercial, marca, fabricante, embalagem/apresentação, unidade comercial, categoria, subcategoria, descrição factual curta, conteúdo/peso/volume líquido, peso bruto quando publicado e dimensões físicas do produto/embalagem quando publicadas.
NCM é dado fiscal: só retorne um NCM de 8 dígitos quando houver evidência específica e confiável para o produto ou classificação inequívoca. Dê preferência a fabricante, documento fiscal/técnico ou múltiplas fontes concordantes. Se houver dúvida, retorne ncm vazio e ncm_confidence baixo. Nunca deduza NCM apenas por semelhança de nome.
Para dimensões, use centímetros. Quando não estiverem publicadas ou houver dúvida sobre se são do produto versus caixa de transporte, use zeros e confiança baixa.
Para imagem, procure foto real frontal do MESMO produto/apresentação. Dê preferência à imagem oficial do fabricante ou de página que também confirme o EAN. image_url deve ser URL direta da imagem somente quando visível/confiável; image_source_page_url deve ser a página que comprova a imagem. Se não houver segurança, deixe ambas vazias. Não use logos, banners, mockups genéricos ou imagem de outra gramatura/sabor/variante.
Não invente preço, custo, estoque, validade, localização, SKU ou fornecedor comercial da Dona Antônia.
A descrição deve ter uma ou duas frases em português do Brasil, sem propaganda exagerada, URLs, citações ou nomes de sites.`;

async function research(openaiKey:string,model:string,ean:string){
  const body={
    model,store:false,max_output_tokens:1200,reasoning:{effort:"low"},
    instructions:INSTRUCTIONS,
    tools:[{type:"web_search"}],tool_choice:"auto",
    input:[{role:"user",content:[{type:"input_text",text:`Pesquise profundamente o produto correspondente ao EAN/GTIN ${ean}. Confirme o código antes de identificar. Além dos dados cadastrais, procure NCM confiável, embalagem/conteúdo, medidas publicadas e uma foto real do mesmo produto/apresentação.`}]}],
    text:{format:{type:"json_schema",name:"ean_product_rich_research",strict:true,schema:productSchema}}
  };
  const r=await fetch(OPENAI_URL,{method:"POST",headers:{Authorization:`Bearer ${openaiKey}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(110000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`openai_http_${r.status}`);
  const output=finalText(data);if(!output)throw new Error("empty_model_output");
  let parsed:any;try{parsed=JSON.parse(output)}catch{throw new Error("invalid_model_json")}
  return {result:obj(parsed),response_id:clean(data?.id,180)};
}

function normalizedResearch(r:any){
  const dim=obj(r.dimensions),dimConfidence=score(dim.confidence);
  const dimensions=dimConfidence>=0.65&&Number(dim.length_cm)>0&&Number(dim.width_cm)>0&&Number(dim.height_cm)>0?{
    length_cm:Number(dim.length_cm),width_cm:Number(dim.width_cm),height_cm:Number(dim.height_cm),confidence:dimConfidence
  }:null;
  const imageConfidence=score(r.image_confidence);
  return {
    confidence:score(r.confidence),name:clean(r.name,300),brand:nullable(r.brand,160),manufacturer:nullable(r.manufacturer,180),
    packaging:nullable(r.packaging,160),unit:nullable(r.unit,40),category:nullable(r.category,120),subcategory:nullable(r.subcategory,120),
    description:commercialDescription(r.description)||null,net_content:nullable(r.net_content,120),gross_weight:nullable(r.gross_weight,120),dimensions,
    ncm:validNcm(r.ncm,r.ncm_confidence),ncm_confidence:score(r.ncm_confidence),ncm_evidence_summary:clean(r.ncm_evidence_summary,500)||null,
    image_candidate_url:imageConfidence>=0.72?safeHttpUrl(r.image_url):null,
    image_source_page_url:imageConfidence>=0.72?safeHttpUrl(r.image_source_page_url):null,
    image_confidence:imageConfidence,evidence_summary:clean(r.evidence_summary,700)||null
  };
}

function richMetadata(base:any,n:any,responseId:string,extra:Record<string,unknown>={}){
  return {
    ...obj(base),...extra,
    rich_research_version:RICH_VERSION,rich_researched_at:new Date().toISOString(),research_response_id:responseId,
    research_confidence:n.confidence,evidence_summary:n.evidence_summary,
    manufacturer:n.manufacturer,net_content:n.net_content,gross_weight:n.gross_weight,dimensions:n.dimensions,
    ncm_research_confidence:n.ncm_confidence,ncm_evidence_summary:n.ncm_evidence_summary,
    image_candidate_url:n.image_candidate_url,image_source_page_url:n.image_source_page_url,image_research_confidence:n.image_confidence,
    image_enrichment_status:n.image_candidate_url||n.image_source_page_url?"pending":"no_reliable_image_found"
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  let openaiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:"server_config"},500);
  const parsedUrl=new URL(supabaseUrl);if(parsedUrl.protocol!=="https:"||parsedUrl.hostname!==PROJECT_HOST)return json({ok:false,error:"unexpected_supabase_project"},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const suppliedKey=req.headers.get("x-da-product-research-key")||"";
  if(!suppliedKey)return json({ok:false,error:"unauthorized"},401);
  const {data:secretRow,error:secretError}=await sb.from("system_secrets").select("key_hash,is_active").eq("key_name","inventory_product_research_webhook_v1").maybeSingle();
  if(secretError||!secretRow?.is_active||(await sha256Hex(suppliedKey))!==secretRow.key_hash)return json({ok:false,error:"unauthorized"},401);

  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  if(!openaiKey){try{const {data:key}=await sb.rpc("get_conversation_worker_provider_secret_v1");if(typeof key==="string")openaiKey=key}catch{}}
  if(body?.event==="healthcheck")return json({ok:true,provider_configured:Boolean(openaiKey),model:Deno.env.get("INVENTORY_PRODUCT_RESEARCH_MODEL")||"gpt-5.6-luna",rich_version:RICH_VERSION});
  if(body?.event!=="drain")return json({ok:false,error:"unknown_event"},400);
  if(!openaiKey)return json({ok:false,error:"openai_key_missing"},500);

  const limit=Math.max(1,Math.min(10,Number(body?.limit||5)));
  const model=clean(Deno.env.get("INVENTORY_PRODUCT_RESEARCH_MODEL")||"gpt-5.6-luna",80);
  const results:any[]=[];

  const {data:jobs,error:claimError}=await sb.rpc("claim_unresolved_product_eans_v1",{p_limit:limit});
  if(claimError)return json({ok:false,error:"claim_failed",detail:claimError.message},500);

  for(const job of arr(jobs)){
    if(results.length>=limit)break;
    const item=obj(job),id=clean(item.id,80),ean=digits(item.ean);if(!id||!ean)continue;
    try{
      const {data:existing}=await sb.from("products").select("id,name,is_active,physically_verified,source_system,metadata").eq("gtin",ean).limit(1).maybeSingle();
      if(existing?.id){
        await sb.from("unresolved_product_eans").update({status:"resolved",resolved_product_id:existing.id,resolution:{reason:"already_exists",product_name:existing.name},updated_at:new Date().toISOString()}).eq("id",id);
        results.push({ean,ok:true,resolved:"existing",product_id:existing.id});continue;
      }

      const researched=await research(openaiKey,model,ean),r=researched.result,n=normalizedResearch(r);
      if(r.found!==true||n.confidence<0.60||!n.name){
        await sb.from("unresolved_product_eans").update({status:"error",resolution:{reason:"insufficient_evidence",confidence:n.confidence,evidence_summary:n.evidence_summary,response_id:researched.response_id},updated_at:new Date().toISOString()}).eq("id",id);
        results.push({ean,ok:false,error:"insufficient_evidence",confidence:n.confidence});continue;
      }

      const metadata=richMetadata({},n,researched.response_id,{ai_created:true,review_status:"pending_human_review",activation_mode:"manual_admin_only",research_queue_id:id});
      const payload={
        gtin:ean,name:n.name,brand:n.brand,packaging:n.packaging,unit:n.unit,category:n.category,subcategory:n.subcategory,ncm:n.ncm,
        description_short:n.description,source_system:"ai_ean_research",sync_status:"local",is_active:false,is_whatsapp_active:false,physically_verified:false,metadata
      };
      let product:any=null;
      const {data:inserted,error:insertError}=await sb.from("products").insert(payload).select("id,name,gtin,ncm,brand,packaging,is_active,is_whatsapp_active,physically_verified,source_system").single();
      if(insertError){
        const {data:raced}=await sb.from("products").select("id,name,gtin,ncm,brand,packaging,is_active,is_whatsapp_active,physically_verified,source_system").eq("gtin",ean).limit(1).maybeSingle();
        if(!raced)throw insertError;product=raced;
      }else product=inserted;

      await sb.from("unresolved_product_eans").update({status:"resolved",resolved_product_id:product.id,resolution:{name:n.name,brand:n.brand,packaging:n.packaging,ncm:n.ncm,description:n.description,confidence:n.confidence,response_id:researched.response_id,review_status:"pending_human_review"},updated_at:new Date().toISOString()}).eq("id",id);
      results.push({ean,ok:true,resolved:"created_inactive",product_id:product.id,confidence:n.confidence,ncm:n.ncm,image_candidate:Boolean(n.image_candidate_url||n.image_source_page_url)});
    }catch(error){
      const message=clean(error instanceof Error?error.message:"research_failed",180);
      await sb.from("unresolved_product_eans").update({status:"error",resolution:{reason:message},updated_at:new Date().toISOString()}).eq("id",id);
      results.push({ean,ok:false,error:message});
    }
  }

  if(results.length<limit){
    const {data:rows}=await sb.from("products").select("id,gtin,name,ncm,brand,packaging,unit,category,subcategory,description_short,image_url,metadata,is_active,is_whatsapp_active,physically_verified").eq("source_system","ai_ean_research").order("created_at",{ascending:true}).limit(80);
    for(const product of arr(rows)){
      if(results.length>=limit)break;
      const meta=obj(product?.metadata);
      if(meta.rich_research_version===RICH_VERSION||meta.rich_research_version===`${RICH_VERSION}_failed`)continue;
      const attempts=Math.max(0,Number(meta.rich_research_attempts||0));
      const ean=digits(product?.gtin);if(!product?.id||!ean)continue;
      if(attempts>=3){
        await sb.from("products").update({metadata:{...meta,rich_research_version:`${RICH_VERSION}_failed`,rich_research_status:"failed_after_retries",rich_research_attempts:attempts}}).eq("id",product.id);
        continue;
      }
      try{
        const researched=await research(openaiKey,model,ean),r=researched.result,n=normalizedResearch(r);
        if(r.found!==true||n.confidence<0.60||!n.name)throw new Error("insufficient_evidence_backfill");
        const update:any={metadata:richMetadata(meta,n,researched.response_id,{rich_research_attempts:attempts+1,rich_research_status:"completed"})};
        if(!clean(product.ncm)&&n.ncm)update.ncm=n.ncm;
        if(!clean(product.brand)&&n.brand)update.brand=n.brand;
        if(!clean(product.packaging)&&n.packaging)update.packaging=n.packaging;
        if(!clean(product.unit)&&n.unit)update.unit=n.unit;
        if(!clean(product.category)&&n.category)update.category=n.category;
        if(!clean(product.subcategory)&&n.subcategory)update.subcategory=n.subcategory;
        if(!clean(product.description_short)&&n.description)update.description_short=n.description;
        await sb.from("products").update(update).eq("id",product.id);
        results.push({ean,ok:true,resolved:"rich_backfill",product_id:product.id,ncm:update.ncm||product.ncm||null,image_candidate:Boolean(n.image_candidate_url||n.image_source_page_url)});
      }catch(error){
        const message=clean(error instanceof Error?error.message:"rich_backfill_failed",180);
        const nextAttempts=attempts+1;
        await sb.from("products").update({metadata:{...meta,rich_research_attempts:nextAttempts,rich_research_status:"error",rich_research_last_error:message,rich_research_last_attempt_at:new Date().toISOString(),...(nextAttempts>=3?{rich_research_version:`${RICH_VERSION}_failed`}:{})}}).eq("id",product.id);
        results.push({ean,ok:false,error:message,product_id:product.id,phase:"rich_backfill"});
      }
    }
  }

  return json({ok:true,event:"drain",processed:results.length,succeeded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,model,rich_version:RICH_VERSION,results});
});
