import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  ANALYSIS_MODEL, ESCALATION_MODEL, ANALYSIS_SCHEMA, IMAGE_MODEL, IMAGE_OUTPUT,
  OUTPUT_KINDS, MAX_INPUT_PHOTOS, buildAnalysisPrompt, normalizeAnalysis,
  resolveOpenAiKey, shouldEscalateV2, buildImagePrompts, storagePaths, sanitizeEan,
} from "./core.mjs";

const RESPONSES_URL="https://api.openai.com/v1/responses";
const IMAGE_EDIT_URL="https://api.openai.com/v1/images/edits";
const BUCKET="ame-mais";
const MAX_UPLOAD=10*1024*1024;
const RATE_LIMIT_PER_HOUR=50;
const ALLOWED_TYPES=new Set(["image/jpeg","image/png","image/webp"]);
const ALLOWED_KINDS=new Set(OUTPUT_KINDS);
const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br","https://osvaldosereia.github.io"]);

const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const isUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const cors=(origin:string|null)=>({...(origin&&(ALLOWED_ORIGINS.has(origin)||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))?{"Access-Control-Allow-Origin":origin}:{}),"Access-Control-Allow-Headers":"apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const bytesToBase64=(bytes:Uint8Array)=>{let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s)};
const base64ToBytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function finalText(data:any){return (Array.isArray(data?.output)?data.output:[]).filter((x:any)=>x?.type==="message").flatMap((x:any)=>Array.isArray(x?.content)?x.content:[]).filter((x:any)=>x?.type==="output_text").map((x:any)=>String(x?.text||"")).join("").trim()}

async function analyzeWithModel(apiKey:string,model:string,photos:{bytes:Uint8Array,mime:string}[],prior?:any){
  const extra=prior?`\nUma análise anterior ficou realmente incerta. Reavalie sem inventar. Análise anterior: ${JSON.stringify(prior).slice(0,3500)}`:"";
  const content:any[]=[{type:"input_text",text:buildAnalysisPrompt()+"\nAs imagens mostram o mesmo produto por ângulos diferentes. Consolide as evidências e não duplique atributos."+extra}];
  for(const p of photos)content.push({type:"input_image",image_url:`data:${p.mime};base64,${bytesToBase64(p.bytes)}`,detail:"high"});
  const body={model,store:false,max_output_tokens:1050,reasoning:{effort:model===ESCALATION_MODEL?"medium":"low"},input:[{role:"user",content}],text:{format:{type:"json_schema",name:"ame_mais_product_analysis_v3",strict:true,schema:ANALYSIS_SCHEMA}}};
  const r=await fetch(RESPONSES_URL,{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`analysis_http_${r.status}_${clean(data?.error?.message||"error",160)}`);
  const text=finalText(data);if(!text)throw new Error("analysis_empty_output");
  let parsed;try{parsed=JSON.parse(text)}catch{throw new Error("analysis_invalid_json")}
  return {analysis:normalizeAnalysis(parsed),model};
}

async function generateImage(apiKey:string,photos:{bytes:Uint8Array,mime:string}[],prompt:string){
  const form=new FormData();form.append("model",IMAGE_MODEL);form.append("prompt",prompt);form.append("size",IMAGE_OUTPUT.size);form.append("quality",IMAGE_OUTPUT.quality);form.append("output_format",IMAGE_OUTPUT.format);form.append("output_compression",String(IMAGE_OUTPUT.compression));form.append("background","opaque");
  photos.forEach((p,i)=>form.append("image[]",new Blob([p.bytes],{type:p.mime}),`referencia-${i+1}`));
  const r=await fetch(IMAGE_EDIT_URL,{method:"POST",headers:{Authorization:`Bearer ${apiKey}`},body:form,signal:AbortSignal.timeout(115000)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`image_http_${r.status}_${clean(data?.error?.message||"error",180)}`);
  const b64=String(data?.data?.[0]?.b64_json||"");if(!b64)throw new Error("image_empty_output");return base64ToBytes(b64);
}

async function validateHero(apiKey:string,photos:{bytes:Uint8Array,mime:string}[],candidate:Uint8Array){
  const schema={type:"object",additionalProperties:false,properties:{same_product:{type:"boolean"},fidelity_score:{type:"number",minimum:0,maximum:1},critical_issue:{type:"string"}},required:["same_product","fidelity_score","critical_issue"]};
  const content:any[]=[{type:"input_text",text:"Compare as fotos de referência com a última imagem comercial. Confirme apenas se é o mesmo produto, sem exigir cenário igual. Reprove mudanças claras de identidade, forma, cor, símbolo, estampa ou texto físico principal."}];
  photos.forEach(p=>content.push({type:"input_image",image_url:`data:${p.mime};base64,${bytesToBase64(p.bytes)}`,detail:"high"}));
  content.push({type:"input_image",image_url:`data:image/webp;base64,${bytesToBase64(candidate)}`,detail:"high"});
  const body={model:ANALYSIS_MODEL,store:false,max_output_tokens:180,reasoning:{effort:"low"},input:[{role:"user",content}],text:{format:{type:"json_schema",name:"ame_mais_v2_hero_validation",strict:true,schema}}};
  const r=await fetch(RESPONSES_URL,{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const data=await r.json().catch(()=>({}));if(!r.ok)return {accepted:true,skipped:true};
  try{const v=JSON.parse(finalText(data));return {accepted:v.same_product===true&&Number(v.fidelity_score||0)>=.82,...v}}catch{return {accepted:true,skipped:true}}
}

async function sha256Hex(value:string){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));return Array.from(d).map(b=>b.toString(16).padStart(2,"0")).join("")}
async function rateLimit(req:Request,sb:any){const fp=await sha256Hex(`${req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")||"unknown"}|${req.headers.get("user-agent")||"unknown"}`);const now=new Date();const q=await sb.from("ame_mais_rate_limits").select("window_started_at,request_count").eq("fingerprint",fp).maybeSingle();const started=q.data?.window_started_at?new Date(q.data.window_started_at):null;const expired=!started||now.getTime()-started.getTime()>=3600000;const count=expired?0:Number(q.data?.request_count||0);if(count>=RATE_LIMIT_PER_HOUR)return false;await sb.from("ame_mais_rate_limits").upsert({fingerprint:fp,window_started_at:expired?now.toISOString():started!.toISOString(),request_count:count+1,updated_at:now.toISOString()},{onConflict:"fingerprint"});return true}
async function updateRun(sb:any,id:string,patch:any){const q=await sb.from("ame_mais_runs").update({...patch,updated_at:new Date().toISOString()}).eq("id",id);if(q.error)throw new Error(q.error.message)}
async function getRun(sb:any,id:string){const q=await sb.from("ame_mais_runs").select("*").eq("id",id).maybeSingle();if(q.error)throw new Error(q.error.message);return q.data}
async function getImages(sb:any,id:string){const q=await sb.from("ame_mais_images").select("*").eq("run_id",id);if(q.error)throw new Error(q.error.message);const order=new Map(OUTPUT_KINDS.map((k,i)=>[k,i]));return (q.data||[]).sort((a:any,b:any)=>(order.get(a.kind)??9)-(order.get(b.kind)??9))}
async function loadPhotos(sb:any,id:string){const paths=storagePaths(id);const out:any[]=[];for(const path of paths.sources){const d=await sb.storage.from(BUCKET).download(path);if(!d.error&&d.data)out.push({bytes:new Uint8Array(await d.data.arrayBuffer()),mime:d.data.type||"image/jpeg"});}return out}
function imageObject(rows:any[]){return Object.fromEntries((rows||[]).map(r=>[r.kind,{kind:r.kind,title:r.title,url:r.image_url,status:r.status,validation:r.validation||{},model:r.model,quality:r.quality,size:r.size}]))}
function cardJson(run:any,rows:any[]){const a=run.analysis||{};return {run_id:run.id,ean:a.ean||"",name:a.nome_cadastro||"",storefront_description:a.descricao_vitrine||"",catalog_description:a.descricao_cadastro||"",gallery:OUTPUT_KINDS.map(k=>{const r=rows.find((x:any)=>x.kind===k)||{};return {kind:k,title:r.title||k,url:r.image_url||"",status:r.status||"pending"}})}}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");const local=Boolean(origin&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));if(origin&&!ALLOWED_ORIGINS.has(origin)&&!local)return json({ok:false,error:"origin_not_allowed"},403);if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405,origin);
  const sb=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});const apiKey=await resolveOpenAiKey(Deno.env.get("OPENAI_API_KEY")||"",sb);if(!apiKey)return json({ok:false,error:"server_config"},500,origin);
  let form:FormData;try{form=await req.formData()}catch{return json({ok:false,error:"invalid_form"},400,origin)}
  const action=clean(form.get("action")||"analyze",40).toLowerCase(),id=clean(form.get("session_id"),80);if(!isUuid(id))return json({ok:false,error:"invalid_session_id"},400,origin);
  try{
    if(action==="status"||action==="get_run"){const run=await getRun(sb,id);if(!run)return json({ok:false,error:"run_not_found"},404,origin);return json({ok:true,run,image_rows:await getImages(sb,id),card:run.card_json||{}},200,origin)}
    if(!await rateLimit(req,sb))return json({ok:false,error:"rate_limited"},429,origin);
    if(action==="analyze"){
      const files=[] as File[];for(let i=1;i<=MAX_INPUT_PHOTOS;i++){const f=form.get(`image${i}`);if(f instanceof File&&f.size)files.push(f)}if(files.length<1||files.length>MAX_INPUT_PHOTOS)return json({ok:false,error:"image_count_invalid"},400,origin);
      for(const f of files)if(!ALLOWED_TYPES.has(f.type)||f.size<5000||f.size>MAX_UPLOAD)return json({ok:false,error:"image_invalid"},400,origin);
      const ean=sanitizeEan(form.get("ean")||"");const photos=[] as any[];const paths=storagePaths(id);
      await sb.from("ame_mais_runs").upsert({id,status:"processing",step:"saving_original",analysis:{ean},images:{},conflicts:[],observations:[],prompts:{},card_json:{},model_image:IMAGE_MODEL,error_message:null,updated_at:new Date().toISOString()},{onConflict:"id"});
      for(let i=0;i<files.length;i++){const bytes=new Uint8Array(await files[i].arrayBuffer());photos.push({bytes,mime:files[i].type});const up=await sb.storage.from(BUCKET).upload(paths.sources[i],bytes,{contentType:files[i].type,cacheControl:"31536000",upsert:true});if(up.error)throw new Error(up.error.message)}
      const firstUrl=sb.storage.from(BUCKET).getPublicUrl(paths.sources[0]).data.publicUrl;await updateRun(sb,id,{source_url:firstUrl,step:"analyzing_product"});
      let result=await analyzeWithModel(apiKey,ANALYSIS_MODEL,photos);if(shouldEscalateV2(result.analysis)){const advanced=await analyzeWithModel(apiKey,ESCALATION_MODEL,photos,result.analysis);if(Number(advanced.analysis.confianca_geral||0)>=Number(result.analysis.confianca_geral||0))result=advanced}
      result.analysis={...result.analysis,ean};const prompts=buildImagePrompts(result.analysis);await sb.from("ame_mais_images").upsert(prompts.map(p=>({run_id:id,kind:p.kind,title:p.title,prompt:p.prompt,status:"pending",validation:{},model:IMAGE_MODEL,quality:IMAGE_OUTPUT.quality,size:IMAGE_OUTPUT.size,updated_at:new Date().toISOString()})),{onConflict:"run_id,kind"});await updateRun(sb,id,{analysis:result.analysis,conflicts:result.analysis.conflitos||[],observations:result.analysis.observacoes||[],prompts:Object.fromEntries(prompts.map(p=>[p.kind,p])),model_analysis:result.model,step:"generating_hero"});return json({ok:true,session_id:id,analysis:result.analysis,model:result.model,image_plan:prompts.map(({kind,title})=>({kind,title}))},200,origin)
    }
    if(action==="generate_image"){
      const kind=clean(form.get("kind"),30);if(!ALLOWED_KINDS.has(kind))return json({ok:false,error:"invalid_kind"},400,origin);const run=await getRun(sb,id);if(!run)return json({ok:false,error:"run_not_found"},404,origin);let analysis=run.analysis||{};const supplied=clean(form.get("analysis_json"),20000);if(supplied){try{analysis={...normalizeAnalysis(JSON.parse(supplied)),ean:run.analysis?.ean||""}}catch{return json({ok:false,error:"invalid_analysis"},400,origin)}}const photos=await loadPhotos(sb,id);if(!photos.length)return json({ok:false,error:"run_not_ready"},409,origin);const prompt=buildImagePrompts(analysis).find(x=>x.kind===kind);if(!prompt)return json({ok:false,error:"invalid_kind"},400,origin);
      await updateRun(sb,id,{step:`generating_${kind}`,analysis});await sb.from("ame_mais_images").update({status:"generating",updated_at:new Date().toISOString()}).eq("run_id",id).eq("kind",kind);const bytes=await generateImage(apiKey,photos,prompt.prompt);let validation:any={skipped:true};if(kind==="hero"){await updateRun(sb,id,{step:"validating_hero"});validation=await validateHero(apiKey,photos,bytes)}
      const out=(storagePaths(id) as any)[kind];const up=await sb.storage.from(BUCKET).upload(out,bytes,{contentType:"image/webp",cacheControl:"31536000",upsert:true});if(up.error)throw new Error(up.error.message);const url=sb.storage.from(BUCKET).getPublicUrl(out).data.publicUrl;await sb.from("ame_mais_images").update({image_url:url,storage_path:out,status:"completed",validation,model:IMAGE_MODEL,quality:IMAGE_OUTPUT.quality,size:IMAGE_OUTPUT.size,attempt_count:1,updated_at:new Date().toISOString()}).eq("run_id",id).eq("kind",kind);
      const rows=await getImages(sb,id),images=imageObject(rows),all=OUTPUT_KINDS.every(k=>rows.some((r:any)=>r.kind===k&&r.status==="completed"&&r.image_url));let card=run.card_json||{};if(all){const latest=await getRun(sb,id);card=cardJson({...latest,analysis},rows)}await updateRun(sb,id,{images,card_json:card,status:all?"completed":"processing",step:all?"completed":`saving_${kind}`,completed_at:all?new Date().toISOString():null,error_message:null});return json({ok:true,kind,title:prompt.title,url,validation,completed:all,card},200,origin)
    }
    return json({ok:false,error:"unknown_action"},400,origin)
  }catch(e){const message=clean((e as Error)?.message||e,260);console.error("ame-mais-v2",action,message);try{await updateRun(sb,id,{status:"error",error_message:message})}catch{}return json({ok:false,error:"processing_failed",detail:message},500,origin)}
});
