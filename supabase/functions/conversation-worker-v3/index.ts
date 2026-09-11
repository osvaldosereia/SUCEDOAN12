import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_HOST="ssbesxgaijknwsjbsbcz.supabase.co";
const OPENAI_URL="https://api.openai.com/v1/responses";
const MAX_MEDIA_BYTES=10*1024*1024;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=1200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80))?clean(v,80):"";
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const money=(v:unknown)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
async function sha256Hex(value:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("")}
function finalText(data:any){return arr(data?.output).flatMap((x:any)=>arr(x?.content)).filter((x:any)=>x?.type==="output_text").map((x:any)=>String(x.text||"")).join("").trim()}

const CLASSIFY_SCHEMA={type:"object",additionalProperties:false,properties:{matched:{type:"boolean"},rule_id:{type:"string"},confidence:{type:"number",minimum:0,maximum:1},tool_input:{type:"string",maxLength:160}},required:["matched","rule_id","confidence","tool_input"]};

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  let openaiKey=Deno.env.get("OPENAI_API_KEY")||"";
  if(!supabaseUrl||!serviceKey)return json({ok:false,error:"server_config"},500);
  const parsed=new URL(supabaseUrl);if(parsed.protocol!=="https:"||parsed.hostname!==PROJECT_HOST)return json({ok:false,error:"unexpected_supabase_project"},500);
  const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const suppliedKey=req.headers.get("x-da-worker-key")||"";if(!suppliedKey)return json({ok:false,error:"unauthorized"},401);
  const {data:secretRow,error:secretError}=await sb.from("system_secrets").select("key_hash,is_active").eq("key_name","conversation_worker_webhook_v2").maybeSingle();
  if(secretError||!secretRow?.is_active||(await sha256Hex(suppliedKey))!==secretRow.key_hash)return json({ok:false,error:"unauthorized"},401);
  if(!openaiKey){const {data:vaultKey}=await sb.rpc("get_conversation_worker_provider_secret_v1");if(typeof vaultKey==="string")openaiKey=vaultKey}
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  if(body?.event==="healthcheck")return json({ok:true,event:"healthcheck",worker_version:"3-simple",provider_configured:Boolean(openaiKey)},200);
  const expectedJobId=uuid(body?.job_id);if(!expectedJobId)return json({ok:false,error:"job_id_required"},400);

  const [{data:cfg,error:cfgError},{data:simple,error:simpleError}]=await Promise.all([
    sb.from("automation_config").select("automation_enabled,ai_enabled,conversation_worker_enabled,conversation_worker_dispatch_enabled,whatsapp_sales_mvp_enabled").eq("id",1).maybeSingle(),
    sb.from("service_simple_runtime_config").select("*").eq("id",1).maybeSingle()
  ]);
  if(cfgError||!cfg||simpleError||!simple)return json({ok:false,error:"config_unavailable"},500);
  if(!cfg.automation_enabled||!cfg.ai_enabled||!cfg.conversation_worker_enabled||!cfg.conversation_worker_dispatch_enabled||!simple.enabled)return json({ok:true,skipped:true,reason:"worker_disabled"},202);

  const workerId=`conversation-simple-${crypto.randomUUID()}`;
  const {data:job,error:claimError}=await sb.rpc("claim_conversation_job_v2",{p_worker:workerId,p_expected_job_id:expectedJobId});
  if(claimError)return json({ok:false,error:"claim_failed"},500);
  if(!job)return json({ok:true,skipped:true,reason:"job_not_claimable"},202);
  if(job.skipped)return json({ok:true,skipped:true,reason:clean(job.reason,100)},200);

  let inputTokens=0,outputTokens=0,modelUsed="deterministic";
  const configuredModel=clean(Deno.env.get("OPENAI_CONVERSATION_MODEL"),80);
  const model=configuredModel.startsWith("gpt-5.6-")?configuredModel:"gpt-5.6-luna";
  const addUsage=(d:any)=>{inputTokens+=Number(d?.usage?.input_tokens||0);outputTokens+=Number(d?.usage?.output_tokens||0);modelUsed=model};
  const finish=async(result:any,error:string|null=null)=>{const {data,error:finishError}=await sb.rpc("finish_whatsapp_sales_job_v1",{p_job_id:job.id,p_worker:workerId,p_attempt:job.attempt,p_result:result,p_usage:{model:modelUsed,input_tokens:inputTokens||null,output_tokens:outputTokens||null},p_error:error});if(finishError)throw new Error("completion_uncertain");return data};
  const queue=async(text:string,action:string,result:any={},confidence:number|null=null)=>{const {data,error}=await sb.rpc("queue_whatsapp_sales_reply_v1",{p_conversation_id:job.conversation_id,p_source_message_id:job.message_id,p_body_text:text,p_delivery_mode:"text",p_image_url:null,p_interactive:null,p_action_type:action,p_action_result:result,p_confidence:confidence});if(error)throw new Error("reply_queue_failed");return data};
  const recentHistory=async()=>{const limit=Math.max(0,Math.min(8,Number(simple.max_history_messages||4)));if(!limit)return [];const {data}=await sb.from("messages").select("direction,body_text,transcript,created_at").eq("conversation_id",job.conversation_id).order("created_at",{ascending:false}).limit(limit);return arr(data).reverse().map((m:any)=>({role:m.direction==="outbound"?"assistant":"customer",text:clean(m.body_text||m.transcript,500)})).filter((m:any)=>m.text)};

  const humanize=async(base:string,current:string,history:any[])=>{
    const safe=clean(base,1800);if(!safe||!simple.generative_ai_enabled||!simple.humanize_all_replies||!openaiKey)return safe;
    try{
      const r=await fetch(OPENAI_URL,{method:"POST",headers:{Authorization:`Bearer ${openaiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,max_output_tokens:180,reasoning:{effort:"low"},instructions:"Reescreva apenas a resposta-base da Dona Antônia em português brasileiro natural, cordial, simples e curta. Preserve exatamente o sentido, todos os fatos, números, preços, nomes e URLs. Não acrescente informação, promessa, pergunta, produto ou condição que não esteja na resposta-base. Não mencione regras internas. Retorne somente a mensagem final.",input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({mensagem_do_cliente:clean(current,600),historico_curto:history,resposta_base:safe})}]}],text:{verbosity:"low"}}),signal:AbortSignal.timeout(45000)});
      const d=await r.json().catch(()=>({}));if(!r.ok)return safe;addUsage(d);return clean(finalText(d),1800)||safe;
    }catch{return safe}
  };

  const classify=async(current:string,history:any[],candidates:any[])=>{
    if(!candidates.length)return {matched:false,rule_id:"",confidence:0,tool_input:""};
    const top=candidates[0];
    if(Number(top.exact)===1&&top.response_mode!=="product_lookup")return {matched:true,rule_id:String(top.id),confidence:1,tool_input:""};
    if(!simple.classifier_ai_enabled||!openaiKey){return Number(top.score||0)>=Number(simple.similarity_threshold||0.5)?{matched:true,rule_id:String(top.id),confidence:Number(top.score||0),tool_input:current}:{matched:false,rule_id:"",confidence:0,tool_input:""}}
    try{
      const compact=candidates.map((c:any)=>({id:c.id,pergunta:c.question,variacoes:c.variations,modo:c.response_mode,similaridade:Number(c.score||0)}));
      const r=await fetch(OPENAI_URL,{method:"POST",headers:{Authorization:`Bearer ${openaiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,max_output_tokens:150,reasoning:{effort:"low"},instructions:"Classifique a intenção do cliente usando SOMENTE uma das regras candidatas fornecidas. Se nenhuma tiver a mesma intenção, matched=false. Não invente regra. Para modo product_lookup, tool_input deve conter somente o nome/termo do produto que deve ser pesquisado, sem frases como 'vocês têm' ou 'quanto custa'. Para outros modos, tool_input pode ficar vazio.",input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({mensagem:clean(current,600),historico_curto:history,regras_candidatas:compact})}]}],text:{verbosity:"low",format:{type:"json_schema",name:"simple_rule_match",strict:true,schema:CLASSIFY_SCHEMA}}}),signal:AbortSignal.timeout(45000)});
      const d=await r.json().catch(()=>({}));if(!r.ok)return {matched:false,rule_id:"",confidence:0,tool_input:""};addUsage(d);const t=finalText(d);const x=JSON.parse(t);if(!x?.matched)return {matched:false,rule_id:"",confidence:Number(x?.confidence||0),tool_input:""};if(!candidates.some((c:any)=>String(c.id)===String(x.rule_id)))return {matched:false,rule_id:"",confidence:0,tool_input:""};return x;
    }catch{return {matched:false,rule_id:"",confidence:0,tool_input:""}}
  };

  try{
    if(job.job_type==="transcription"){
      const mime=clean(job.media?.mime_type,80);if(!job.media?.object_path||!mime)throw new Error("media_required");
      const {data:blob,error:downloadError}=await sb.storage.from("shopping-room-media").download(job.media.object_path);if(downloadError||!blob||blob.size<=0||blob.size>MAX_MEDIA_BYTES)throw new Error("media_download_failed");
      if(!openaiKey)throw new Error("openai_key_missing");
      const form=new FormData();form.append("file",blob,String(job.media.object_path).split("/").pop()||"audio.ogg");form.append("model",Deno.env.get("OPENAI_TRANSCRIPTION_MODEL")||"gpt-4o-mini-transcribe");form.append("language","pt");form.append("response_format","json");
      const r=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${openaiKey}`},body:form,signal:AbortSignal.timeout(90000)});const d=await r.json().catch(()=>({}));if(!r.ok||!clean(d.text,4000))throw new Error("transcription_failed");
      const {data:done,error:finishError}=await sb.rpc("finish_conversation_job",{p_job_id:job.id,p_worker:workerId,p_attempt:job.attempt,p_result:{transcript:clean(d.text,4000)},p_usage:{model:Deno.env.get("OPENAI_TRANSCRIPTION_MODEL")||"gpt-4o-mini-transcribe"},p_error:null});if(finishError)throw new Error("completion_uncertain");return json({ok:true,status:done?.status||"done",action:"transcription"},200);
    }

    const {data:ctx,error:ctxError}=await sb.rpc("build_whatsapp_sales_context_v1",{p_conversation_id:job.conversation_id,p_message_id:job.message_id});if(ctxError||!ctx)throw new Error("sales_context_failed");
    const current=clean(ctx?.message?.text||"",1200),interactiveId=clean(ctx?.message?.interactive?.id,240),history=await recentHistory();
    if(!current&&!interactiveId){const text=await humanize("Recebi sua mensagem, mas ainda preciso que você me diga em texto o que deseja.",current,history);await queue(text,"simple_need_text",{},1);await finish({simple:true,action:"need_text"});return json({ok:true,status:"done",action:"need_text"},200)}

    if(interactiveId==="da_human"){
      await sb.rpc("queue_human_handoff_v1",{p_conversation_id:job.conversation_id,p_reason:"customer_requested_human",p_message_id:job.message_id,p_priority:2,p_summary:"Cliente pediu atendimento humano.",p_context:{source:"simple_ai"}});
      const text=await humanize("Claro. Vou chamar nossa equipe para continuar com você.",current,history);await queue(text,"simple_human",{handoff:true},1);await finish({simple:true,action:"human"});return json({ok:true,status:"done",action:"human"},200);
    }

    const {data:candidatePack,error:candidateError}=await sb.rpc("get_service_simple_rule_candidates_v1",{p_message:current,p_limit:Number(simple.max_candidate_rules||5)});if(candidateError)throw new Error("rule_candidates_failed");
    const candidates=arr(candidatePack?.candidates),choice=await classify(current,history,candidates);
    const rule=choice.matched?candidates.find((c:any)=>String(c.id)===String(choice.rule_id)):null;

    if(!rule){
      if(simple.fallback_mode==="silence"){await finish({simple:true,action:"no_rule_silence",candidates:candidates.map((c:any)=>({id:c.id,score:c.score}))});return json({ok:true,status:"done",action:"no_rule_silence"},200)}
      await sb.rpc("queue_human_handoff_v1",{p_conversation_id:job.conversation_id,p_reason:"simple_rule_not_found",p_message_id:job.message_id,p_priority:3,p_summary:"Pergunta ainda sem orientação cadastrada no modo simples.",p_context:{source:"simple_ai",message:current}});
      const text=await humanize("Essa orientação ainda não está cadastrada aqui. Vou chamar nossa equipe para te ajudar.",current,history);await queue(text,"simple_rule_missing",{},choice.confidence||0);await finish({simple:true,action:"fallback_human"});return json({ok:true,status:"done",action:"fallback_human"},200);
    }

    const mode=clean(rule.response_mode,40),answer=clean(rule.answer,1800);
    if(mode==="silence"){await finish({simple:true,rule_id:rule.id,action:"silence"});return json({ok:true,status:"done",action:"silence"},200)}
    if(mode==="human"){
      await sb.rpc("queue_human_handoff_v1",{p_conversation_id:job.conversation_id,p_reason:"simple_rule_human",p_message_id:job.message_id,p_priority:2,p_summary:clean(rule.question,180),p_context:{source:"simple_ai",rule_id:rule.id}});
      const text=await humanize(answer||"Claro. Vou chamar nossa equipe para continuar com você.",current,history);await queue(text,"simple_human",{rule_id:rule.id},choice.confidence);await finish({simple:true,rule_id:rule.id,action:"human"});return json({ok:true,status:"done",action:"human"},200);
    }
    if(mode==="basket_flow"){
      const intro=await humanize(answer||"Claro! Vou abrir nossas cestas para você.",current,history);
      const {data:flow,error:flowError}=await sb.rpc("queue_whatsapp_basket_flow_strict_v1",{p_conversation_id:job.conversation_id,p_source_message_id:job.message_id,p_body_text:intro});
      if(flowError||flow?.ok===false)throw new Error("basket_flow_failed");await finish({simple:true,rule_id:rule.id,action:"basket_flow",flow});return json({ok:true,status:"done",action:"basket_flow"},200);
    }
    if(mode==="product_lookup"){
      const q=clean(choice.tool_input||current,120);const {data:products,error:productError}=await sb.rpc("search_whatsapp_sellable_products_v1",{p_query:q,p_limit:5});if(productError)throw new Error("product_lookup_failed");const rows=arr(products);
      if(!rows.length){const lead=await humanize(`Não encontrei ${q||"esse produto"} entre os produtos disponíveis agora.`,current,history);await queue(lead,"simple_product_lookup",{rule_id:rule.id,query:q,count:0},choice.confidence)}
      else {const lead=await humanize(answer||"Encontrei estas opções para você:",current,history);const list=rows.map((p:any)=>`• ${clean(p.name,90)} — ${money(p.price)}`).join("\n");await queue(`${lead}\n\n${list}`,"simple_product_lookup",{rule_id:rule.id,query:q,count:rows.length,product_ids:rows.map((p:any)=>p.id)},choice.confidence)}
      await finish({simple:true,rule_id:rule.id,action:"product_lookup",query:q,count:rows.length});return json({ok:true,status:"done",action:"product_lookup"},200);
    }

    const text=await humanize(answer,current,history);await queue(text,"simple_text",{rule_id:rule.id},choice.confidence);await finish({simple:true,rule_id:rule.id,action:"text"});return json({ok:true,status:"done",action:"text"},200);
  }catch(error){
    const code=clean(error instanceof Error?error.message:"simple_worker_failed",100).replace(/[^a-z0-9_]+/gi,"_").toLowerCase();
    try{await finish({},code);return json({ok:false,handled:true,error:code},200)}catch{return json({ok:false,error:"completion_uncertain_review_required"},500)}
  }
});