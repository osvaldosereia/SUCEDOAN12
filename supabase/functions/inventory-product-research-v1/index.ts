import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_HOST="ssbesxgaijknwsjbsbcz.supabase.co";
const OPENAI_URL="https://api.openai.com/v1/responses";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=800)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const obj=(v:unknown):Record<string,any>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:{};
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"").slice(0,32);
async function sha256Hex(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("")}
function finalText(data:any){return arr(data?.output).filter((x:any)=>x?.type==="message").flatMap((x:any)=>arr(x.content)).filter((x:any)=>x?.type==="output_text").map((x:any)=>String(x.text||"")).join("").trim()}

const productSchema={
  type:"object",additionalProperties:false,
  properties:{
    found:{type:"boolean"},confidence:{type:"number",minimum:0,maximum:1},
    name:{type:"string",maxLength:300},brand:{type:"string",maxLength:160},
    packaging:{type:"string",maxLength:120},description:{type:"string",maxLength:900},
    evidence_summary:{type:"string",maxLength:700}
  },
  required:["found","confidence","name","brand","packaging","description","evidence_summary"]
};

const INSTRUCTIONS=`Você pesquisa produtos de varejo brasileiro a partir de EAN/GTIN para um cadastro interno.
Use a busca na web. Dê prioridade a fabricante, distribuidor, grandes varejistas e páginas que mostrem explicitamente o EAN consultado.
Nunca invente correspondência. Se não houver evidência suficiente de que o EAN pertence ao produto, retorne found=false.
Quando identificar, devolva somente fatos úteis ao cadastro: nome comercial claro, marca, embalagem/apresentação e uma descrição curta factual em português do Brasil.
Não invente preço, custo, estoque, NCM, categoria, validade, localização, SKU ou qualquer outro campo.
A descrição deve ter uma ou duas frases, sem propaganda exagerada e sem dados não confirmados.`;

async function research(openaiKey:string,model:string,ean:string){
  const body={
    model,store:false,max_output_tokens:700,reasoning:{effort:"low"},
    instructions:INSTRUCTIONS,
    tools:[{type:"web_search"}],tool_choice:"auto",
    input:[{role:"user",content:[{type:"input_text",text:`Pesquise o produto correspondente ao EAN/GTIN ${ean}. Confirme o código em fontes da web antes de identificar o produto.`}]}],
    text:{format:{type:"json_schema",name:"ean_product_research",strict:true,schema:productSchema}}
  };
  const r=await fetch(OPENAI_URL,{method:"POST",headers:{Authorization:`Bearer ${openaiKey}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(110000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`openai_http_${r.status}`);
  const output=finalText(data);if(!output)throw new Error("empty_model_output");
  let parsed:any;try{parsed=JSON.parse(output)}catch{throw new Error("invalid_model_json")}
  return {result:obj(parsed),response_id:clean(data?.id,180)};
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
  if(body?.event==="healthcheck")return json({ok:true,provider_configured:Boolean(openaiKey),model:Deno.env.get("INVENTORY_PRODUCT_RESEARCH_MODEL")||"gpt-5.6-luna"});
  if(body?.event!=="drain")return json({ok:false,error:"unknown_event"},400);
  if(!openaiKey)return json({ok:false,error:"openai_key_missing"},500);

  const limit=Math.max(1,Math.min(10,Number(body?.limit||5)));
  const {data:jobs,error:claimError}=await sb.rpc("claim_unresolved_product_eans_v1",{p_limit:limit});
  if(claimError)return json({ok:false,error:"claim_failed",detail:claimError.message},500);

  const model=clean(Deno.env.get("INVENTORY_PRODUCT_RESEARCH_MODEL")||"gpt-5.6-luna",80);
  const results:any[]=[];
  for(const job of arr(jobs)){
    const item=obj(job),id=clean(item.id,80),ean=digits(item.ean);
    if(!id||!ean)continue;
    try{
      const {data:existing}=await sb.from("products").select("id,name,is_active,physically_verified,source_system").eq("gtin",ean).limit(1).maybeSingle();
      if(existing?.id){
        await sb.from("unresolved_product_eans").update({status:"resolved",resolved_product_id:existing.id,resolution:{reason:"already_exists",product_name:existing.name},updated_at:new Date().toISOString()}).eq("id",id);
        results.push({ean,ok:true,resolved:"existing",product_id:existing.id});continue;
      }

      const researched=await research(openaiKey,model,ean),r=researched.result;
      const confidence=Math.max(0,Math.min(1,Number(r.confidence||0)));
      const name=clean(r.name,300),brand=clean(r.brand,160),packaging=clean(r.packaging,120),description=clean(r.description,900);
      if(r.found!==true||confidence<0.60||!name){
        await sb.from("unresolved_product_eans").update({status:"error",resolution:{reason:"insufficient_evidence",confidence,evidence_summary:clean(r.evidence_summary,700),response_id:researched.response_id},updated_at:new Date().toISOString()}).eq("id",id);
        results.push({ean,ok:false,error:"insufficient_evidence",confidence});continue;
      }

      const payload={
        gtin:ean,
        name,
        brand:brand||null,
        packaging:packaging||null,
        description_short:description||null,
        source_system:"ai_ean_research",
        sync_status:"local",
        is_active:false,
        is_whatsapp_active:false,
        physically_verified:false,
        metadata:{
          ai_created:true,
          review_status:"pending_human_review",
          activation_mode:"manual_admin_only",
          research_queue_id:id,
          research_confidence:confidence,
          research_response_id:researched.response_id,
          evidence_summary:clean(r.evidence_summary,700),
          researched_at:new Date().toISOString()
        }
      };
      let product:any=null;
      const {data:inserted,error:insertError}=await sb.from("products").insert(payload).select("id,name,gtin,brand,packaging,is_active,is_whatsapp_active,physically_verified,source_system").single();
      if(insertError){
        const {data:raced}=await sb.from("products").select("id,name,gtin,brand,packaging,is_active,is_whatsapp_active,physically_verified,source_system").eq("gtin",ean).limit(1).maybeSingle();
        if(!raced)throw insertError;product=raced;
      }else product=inserted;

      await sb.from("unresolved_product_eans").update({
        status:"resolved",resolved_product_id:product.id,
        resolution:{name,brand:brand||null,packaging:packaging||null,description:description||null,confidence,response_id:researched.response_id,review_status:"pending_human_review"},
        updated_at:new Date().toISOString()
      }).eq("id",id);
      results.push({ean,ok:true,resolved:"created_inactive",product_id:product.id,confidence});
    }catch(error){
      const message=clean(error instanceof Error?error.message:"research_failed",180);
      await sb.from("unresolved_product_eans").update({status:"error",resolution:{reason:message},updated_at:new Date().toISOString()}).eq("id",id);
      results.push({ean,ok:false,error:message});
    }
  }
  return json({ok:true,event:"drain",processed:results.length,succeeded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,model,results});
});
