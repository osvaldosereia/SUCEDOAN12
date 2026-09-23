import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { planPapoAiTurn } from "../_shared/papoai-ai-planner-v1.mjs";
import { deterministicCommerceIntent, contextualCommerceIntent } from "../_shared/papoai-commerce-intent-v1.mjs";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type,x-vitrine-history-key,x-dona-antonia-bling-hub-key","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=2000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80))?clean(v,80):"";
const strArray=(v:unknown,max=30)=>Array.isArray(v)?v.map(x=>clean(x,120)).filter(Boolean).slice(0,max):[];
const obj=(v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};

async function r8Sha256Hex(value:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function r8MergeEvalContext(base:any,fixture:any){
  const f=obj(fixture),b=obj(base);
  const merged:any={...b,...f};
  for(const k of ["conversation","customer_summary","cart","checkout","journey","governor","commercial","human_precedence","policies"]){
    merged[k]={...obj(b[k]),...obj(f[k])};
  }
  if(Object.prototype.hasOwnProperty.call(f,"pending_action"))merged.pending_action=f.pending_action;
  return merged;
}
function r8EvalCheck(expectedRaw:any,result:any){
  const e=obj(expectedRaw),failures:string[]=[];
  const decision=clean(result?.decision,60);
  const tools=(Array.isArray(result?.tools)?result.tools:[]).map((x:any)=>clean(x?.tool_key,80)).filter(Boolean);
  const toolResults=Array.isArray(result?.tool_results)?result.tool_results:[];
  const response=String(result?.response||"");
  const low=response.toLowerCase();
  const decisions=Array.isArray(e.decision_any)?e.decision_any.map((x:any)=>clean(x,60)):[];
  const toolAny=Array.isArray(e.tool_any)?e.tool_any.map((x:any)=>clean(x,80)):[];
  const contains=Array.isArray(e.response_contains_any)?e.response_contains_any.map((x:any)=>clean(x,200).toLowerCase()):[];
  const notContains=Array.isArray(e.response_not_contains_any)?e.response_not_contains_any.map((x:any)=>clean(x,200).toLowerCase()):[];
  if(result?.ok!==true)failures.push("simulation_not_ok");
  if(decisions.length&&!decisions.includes(decision))failures.push("decision_mismatch");
  if(toolAny.length&&!toolAny.some((x:string)=>tools.includes(x)))failures.push("expected_tool_missing");
  if(typeof e.should_handoff==="boolean"&&Boolean(result?.should_handoff)!==e.should_handoff)failures.push("handoff_mismatch");
  if(e.media_required===true&&!result?.media_preview?.url)failures.push("media_missing");
  if(typeof e.known_customer==="boolean"&&Boolean(result?.context?.customer_summary?.known_customer)!==e.known_customer)failures.push("known_customer_mismatch");
  if(contains.length&&!contains.some((x:string)=>low.includes(x)))failures.push("response_semantic_missing");
  if(notContains.some((x:string)=>x&&low.includes(x)))failures.push("prohibited_text_present");
  if(result?.external_side_effect!==false||result?.writes_executed!==false)failures.push("unsafe_side_effect");
  if(result?.context_mode!=="strict_read_only")failures.push("context_not_strict_readonly");
  for(const tr of toolResults){
    if(tr?.operation_kind==="read"&&tr?.ok===false&&!tr?.skipped)failures.push("read_tool_error");
    if(["write","commitment"].includes(String(tr?.operation_kind||""))&&tr?.executed===true)failures.push("write_executed");
  }
  return {
    passed:failures.length===0,
    failures:[...new Set(failures)],
    checks:{
      decision,tools,
      should_handoff:Boolean(result?.should_handoff),
      media_present:Boolean(result?.media_preview?.url),
      known_customer:Boolean(result?.context?.customer_summary?.known_customer),
      response_length:response.length,
      strict_read_only:result?.context_mode==="strict_read_only",
      external_side_effect:result?.external_side_effect
    }
  };
}
const entityTable=(type:string)=>({knowledge:"service_knowledge_items",guidance:"service_guidance_rules",procedure:"service_procedures",media:"service_media_library",regression_case:"service_regression_cases"} as Record<string,string>)[type]||"";


const R8_CONFIGS:any={
  ai:{table:"papoai_ai_runtime_config",fields:["primary_model","utility_model","primary_reasoning_effort","utility_reasoning_effort","max_recent_messages","max_message_chars","max_context_bytes","max_output_tokens","max_tool_calls","customer_preference_limit","frequent_product_limit","prompt_cache_key","prompt_cache_ttl"]},
  brain:{table:"papoai_commerce_brain_config",fields:["offers_enabled","upsell_enabled","max_history_messages","max_product_results","component_prices_visible"]},
  commercial:{table:"papoai_commercial_policy_config",fields:["max_segmenting_questions","max_recommendations","max_proactive_offers_per_cart","rejection_cooldown_days","strong_min_discount_percent","strong_min_discount_amount","strong_min_personalized_score","suppress_during_checkout","suppress_when_pending_action","suppress_after_decline"]},
  channel:{table:"papoai_channel_runtime_config",fields:["transcription_model","vision_model","vision_detail","tts_model","tts_voice","tts_instructions","max_audio_bytes","max_image_bytes"]}
};
const r8OutputText=(data:any)=>Array.isArray(data?.output)?data.output.flatMap((v:any)=>Array.isArray(v?.content)?v.content:[]).filter((v:any)=>v?.type==="output_text").map((v:any)=>String(v.text||"")).join("").trim():"";
async function r8OpenAiKey(sb:any){let k=Deno.env.get("OPENAI_API_KEY")||"";if(!k){try{const q=await sb.rpc("get_conversation_worker_provider_secret_v1");if(typeof q.data==="string")k=q.data}catch{}}return k}
async function r8Snapshot(sb:any,entityType:string,entityKey:string,value:any,actor:string,action="update",note=""){await sb.from("papoai_admin_config_versions").insert({entity_type:entityType,entity_key:entityKey,snapshot:value??{},action,actor_user_id:actor||null,note:clean(note,500)||null})}
function r8Patch(area:string,input:any){const cfg=R8_CONFIGS[area],out:any={};if(!cfg)return out;for(const k of cfg.fields){if(input?.[k]===undefined)continue;const v=input[k];if(typeof v==="boolean")out[k]=v;else if(typeof v==="number"&&Number.isFinite(v))out[k]=v;else if(typeof v==="string")out[k]=clean(v,k==="tts_instructions"?1500:240)}out.updated_at=new Date().toISOString();return out}
async function r8Configs(sb:any){const [ai,brain,commercial,channel,prices]=await Promise.all([sb.from("papoai_ai_runtime_config").select("*").eq("id",1).maybeSingle(),sb.from("papoai_commerce_brain_config").select("*").eq("id",1).maybeSingle(),sb.from("papoai_commercial_policy_config").select("*").eq("id",1).maybeSingle(),sb.from("papoai_channel_runtime_config").select("*").eq("id",1).maybeSingle(),sb.from("papoai_model_price_profiles").select("*").order("model")]);return {ai:ai.data,brain:brain.data,commercial:commercial.data,channel:channel.data,prices:prices.data||[]}}
async function r8Overview(sb:any){const since24=new Date(Date.now()-86400000).toISOString(),since7=new Date(Date.now()-7*86400000).toISOString();const [activation,r7,products,customers,convs,orders,handoffs,planner,recent]=await Promise.all([sb.rpc("get_papoai_commerce_activation_readiness_v1"),sb.rpc("get_papoai_r7_readiness_v1"),sb.from("products").select("id",{count:"exact",head:true}).eq("is_active",true).eq("physically_verified",true).gt("stock",0).gt("price",0),sb.from("customers").select("id",{count:"exact",head:true}).eq("is_active",true),sb.from("conversations").select("id",{count:"exact",head:true}).gte("updated_at",since24),sb.from("orders").select("id",{count:"exact",head:true}).gte("created_at",since7),sb.from("human_handoffs").select("id",{count:"exact",head:true}).in("status",["open","claimed"]),sb.from("papoai_ai_planner_runs").select("id,success,decision,commercial_opportunity,latency_ms,input_tokens,cached_input_tokens,output_tokens,created_at").order("created_at",{ascending:false}).limit(12),sb.from("orders").select("id,order_number,status,total,source,created_at").order("created_at",{ascending:false}).limit(8)]);return {activation:activation.data||{},r7:r7.data||{},counts:{sellable_products:products.count||0,active_customers:customers.count||0,conversations_24h:convs.count||0,orders_7d:orders.count||0,pending_handoffs:handoffs.count||0},recent_orders:recent.data||[],recent_planner_runs:planner.data||[]}}
async function r8Health(sb:any){const since=new Date(Date.now()-86400000).toISOString();const [activation,r7,r6,channel,pe,te,se,hq]=await Promise.all([sb.rpc("get_papoai_commerce_activation_readiness_v1"),sb.rpc("get_papoai_r7_readiness_v1"),sb.rpc("get_papoai_r6_readiness_v1"),sb.rpc("get_papoai_channel_readiness_v1"),sb.from("papoai_ai_planner_runs").select("id",{count:"exact",head:true}).eq("success",false).gte("created_at",since),sb.from("papoai_ai_tool_audit").select("id",{count:"exact",head:true}).eq("success",false).gte("created_at",since),sb.from("papoai_admin_simulator_runs").select("id",{count:"exact",head:true}).eq("success",false).gte("created_at",since),sb.rpc("get_papoai_assisted_handoff_queue_v1")]);return {activation:activation.data||{},r7:r7.data||{},r6:r6.data||{},channel:channel.data||{},errors_24h:{planner:pe.count||0,tools:te.count||0,simulator:se.count||0},handoff_queue:hq.data||{ok:true,count:0,items:[]}}}
async function r8ReadTool(sb:any,key:string,args:any,conversationId:string|null,context:any){
  try{
    if(key==="search_products"){
      const q=await sb.rpc("search_papoai_commerce_products_v1",{
        p_query:clean(args?.query,200),
        p_limit:Math.max(1,Math.min(20,Number(args?.limit||3)))
      });
      return {
        ok:!q.error,
        result:q.data?.items||[],
        search_meta:q.data?{
          normalized_query:q.data.normalized_query||null,
          count:q.data.count||0,
          ranking_version:q.data.ranking_version||null
        }:null,
        error:q.error?.message||null
      };
    }
    if(key==="search_baskets"){
      const q=await sb.rpc("get_papoai_commerce_basket_catalog_v1");
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    if(key==="get_basket"){
      const [detail,catalog]=await Promise.all([
        sb.rpc("get_papoai_commerce_basket_detail_v1",{p_basket_query:clean(args?.basket,180)}),
        sb.rpc("get_papoai_commerce_basket_catalog_v1")
      ]);
      let result=detail.data||null;
      if(result?.found&&result?.basket&&Array.isArray(catalog.data)){
        const match=catalog.data.find((x:any)=>
          String(x?.id||"")===String(result.basket.id||"")
          || String(x?.name||"").toLowerCase()===String(result.basket.name||"").toLowerCase()
        );
        if(match?.image_url){
          result={...result,basket:{...result.basket,image_url:match.image_url}};
        }
      }
      return {ok:!detail.error,result,error:detail.error?.message||null};
    }
    if(key==="get_product"&&uuid(args?.product_id)){
      const q=await sb.rpc("get_papoai_commerce_product_v1",{p_product_id:uuid(args.product_id)});
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    if(key==="identify_customer"){
      const s=context?.customer_summary||{};
      return {ok:true,result:{
        known_customer:Boolean(s.known_customer),
        customer_id:s.customer_id||null,
        first_name:s.first_name||null,
        order_count:Number(s.order_count||0),
        read_only:true
      }};
    }
    if(key==="get_customer_context"){
      return {ok:true,result:{...(context?.customer_summary||{}),read_only:true}};
    }
    if(key==="get_cart"){
      return {ok:true,result:{...(context?.cart||{has_cart:false}),read_only:true}};
    }
    if(key==="get_checkout_next_step"){
      const cart=context?.cart||{has_cart:false};
      const checkout=context?.checkout||{};
      const result=!cart?.has_cart
        ? {step:"cart_missing",ready:false,read_only:true}
        : !checkout?.payment_method
          ? {
              step:"collect_payment",
              ready:false,
              question_count:Number(checkout?.question_count||0),
              prompt:"Como você prefere pagar? Pode ser Pix, dinheiro, cartão de crédito ou cartão alimentação/refeição.",
              read_only:true
            }
          : {
              step:"simulator_readonly",
              ready:false,
              payment_method:checkout.payment_method,
              reason:"full checkout mutation is intentionally disabled in simulator",
              read_only:true
            };
      return {ok:true,result};
    }
    if(key==="preview_order"){
      return {ok:true,result:{
        ready:false,
        cart:context?.cart||{has_cart:false},
        checkout:context?.checkout||{},
        payment_method:args?.payment_method||context?.checkout?.payment_method||null,
        writes_performed:false,
        simulator_read_only:true
      }};
    }
    if(key==="get_offers"){
      const limit=Math.max(1,Math.min(10,Number(args?.limit||4)));
      const q=await sb.from("products")
        .select("id,name,brand,category,price,offer_price,stock,image_url")
        .eq("is_active",true)
        .eq("physically_verified",true)
        .eq("is_offer",true)
        .gt("stock",0)
        .gt("offer_price",0)
        .order("sort_order",{ascending:true,nullsFirst:false})
        .limit(limit);
      const items=(q.data||[])
        .filter((x:any)=>Number(x.offer_price||0)<=Number(x.price||0))
        .map((x:any)=>({
          product_id:x.id,name:x.name,brand:x.brand,category:x.category,
          regular_price:x.price,offer_price:x.offer_price,commercial_price:x.offer_price,
          stock:x.stock,image_url:x.image_url
        }));
      return {ok:!q.error,result:{ok:!q.error,count:items.length,items,personalized:false,read_only:true},error:q.error?.message||null};
    }
    if(key==="recommend_replacement"){
      if(!conversationId)return {ok:false,skipped:true,reason:"conversation_required"};
      const q=await sb.rpc("recommend_papoai_commerce_value_replacement_v1",{
        p_conversation_id:conversationId,
        p_source_query:clean(args?.source_query,180),
        p_limit:Math.max(1,Math.min(3,Number(args?.limit||3)))
      });
      return {ok:!q.error,result:q.data,error:q.error?.message||null};
    }
    return {ok:false,skipped:true,reason:"write_or_unsupported_tool"};
  }catch(e){
    return {ok:false,error:clean((e as Error)?.message,300)};
  }
}
async function r8FinalDraft(apiKey:string,model:string,message:string,plan:any,toolResults:any[]){
  if(!apiKey||!toolResults.length)return {text:plan?.response_draft||"",usage:null,latency_ms:0};
  const st=Date.now();
  try{
    const res=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        model,store:false,max_output_tokens:400,reasoning:{effort:"low"},
        instructions:[
          "Redija a resposta final da atendente Dona Antônia em português brasileiro.",
          "Seja natural, curta e objetiva.",
          "Use somente fatos presentes nos resultados das tools.",
          "Nunca invente preço, estoque, total, produto, pedido ou dados do cliente.",
          "Se o cliente pediu foto ou imagem e o resultado contém image_url, diga que a imagem está disponível e será mostrada; nunca diga que não conseguiu acessar.",
          "Não mencione ferramentas, JSON, sistema interno ou simulação."
        ].join(" "),
        input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({message,plan,tool_results:toolResults})}]}],
        text:{verbosity:"low"}
      }),
      signal:AbortSignal.timeout(15000)
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok)return {text:plan?.response_draft||"",usage:data?.usage||null,latency_ms:Date.now()-st,error:"final_http_"+res.status};
    return {text:r8OutputText(data)||plan?.response_draft||"",usage:data?.usage||null,latency_ms:Date.now()-st};
  }catch(e){
    return {text:plan?.response_draft||"",usage:null,latency_ms:Date.now()-st,error:clean((e as Error)?.message,200)};
  }
}
function r8MediaPreview(message:string,toolResults:any[]){
  if(!/(foto|imagem|mostrar|mostra|mande|manda|ver\s+(a|uma)?\s*(foto|imagem))/i.test(message))return null;
  for(const tr of toolResults||[]){
    const r=tr?.result;
    if(r?.basket?.image_url)return {url:r.basket.image_url,label:r.basket.display_name||r.basket.name||"Cesta",kind:"basket"};
    if(Array.isArray(r)){
      const x=r.find((v:any)=>v?.image_url);
      if(x)return {url:x.image_url,label:x.name||"Produto",kind:"product"};
    }
    if(Array.isArray(r?.items)){
      const x=r.items.find((v:any)=>v?.image_url);
      if(x)return {url:x.image_url,label:x.name||"Produto",kind:"product"};
    }
    if(r?.image_url)return {url:r.image_url,label:r.name||"Produto",kind:"product"};
  }
  return null;
}
async function r8Simulator(sb:any,actorId:string|null,body:any){
  const started=Date.now(),message=clean(body?.message,2000);
  const evalMode=body?.eval_mode===true;
  if(!message)return {status:400,body:{ok:false,error:"message_required"}};

  let customerId=uuid(body?.customer_id)||null;
  let conversationId=uuid(body?.conversation_id)||null;
  const phone=clean(body?.phone,40).replace(/[^\d+]/g,"");

  if(!customerId&&phone){
    const d=phone.replace(/\D/g,"");
    const n=d.startsWith("55")?("+"+d):("+55"+d);
    const q=await sb.from("customers").select("id").eq("primary_whatsapp_e164",n).maybeSingle();
    customerId=q.data?.id||null;
  }
  if(!conversationId&&customerId){
    const q=await sb.from("conversations")
      .select("id")
      .eq("customer_id",customerId)
      .order("updated_at",{ascending:false})
      .limit(1)
      .maybeSingle();
    conversationId=q.data?.id||null;
  }

  const [contextQ,knowledgeQ,cfgQ,toolsQ,key]=await Promise.all([
    sb.rpc("get_papoai_admin_simulator_context_v1",{
      p_message:message,
      p_customer_id:customerId,
      p_conversation_id:conversationId
    }),
    sb.rpc("search_service_knowledge_text_v1",{p_query:message,p_limit:4}),
    sb.from("papoai_ai_runtime_config").select("*").eq("id",1).single(),
    sb.rpc("get_papoai_ai_planner_tools_v1"),
    r8OpenAiKey(sb)
  ]);

  if(contextQ.error)return {status:400,body:{ok:false,error:"context_failed",detail:contextQ.error.message}};
  if(cfgQ.error||!cfgQ.data)return {status:500,body:{ok:false,error:"runtime_config_missing"}};
  if(toolsQ.error)return {status:500,body:{ok:false,error:"tools_missing"}};
  if(!key)return {status:503,body:{ok:false,error:"openai_key_missing"}};

  const serviceKnowledge=knowledgeQ.error?[]:(knowledgeQ.data||[]);
  const baseContext={
    ...(contextQ.data||{}),
    service_knowledge:serviceKnowledge,
    service_intelligence:{
      ...((contextQ.data||{})?.service_intelligence||{}),
      enabled:true,
      retrieval:"admin_simulator_published_knowledge",
      simulation_only:true,
      knowledge:serviceKnowledge
    }
  };
  const context=evalMode
    ? r8MergeEvalContext(baseContext,body?.context_fixture||{})
    : baseContext;

  const paymentPolicy=Array.isArray(serviceKnowledge)
    ? serviceKnowledge.find((x:any)=>x?.key==="payment_baseline")
    : null;
  const simulatorHistory=Array.isArray(context?.recent_messages)
    ? context.recent_messages.map((m:any)=>({
        role:m?.role||(m?.direction==='outbound'?'assistant':'user'),
        content:m?.content??m?.text??m?.body_text??''
      }))
    : [];
  const deterministicIntent=contextualCommerceIntent(message,simulatorHistory)||deterministicCommerceIntent(message);

  const deterministicReturn=async({
    response,
    decision="RESPOND",
    tools=[],
    toolResults=[],
    mediaPreview=null,
    model="deterministic-router",
    salesNextStep="answer_need",
    question="",
    shouldHandoff=false
  }:any)=>{
    const latency=Date.now()-started;
    const contextBytes=new TextEncoder().encode(JSON.stringify(context)).length;
    const row:any={
      actor_user_id:actorId,customer_id:customerId,conversation_id:conversationId,input_text:message,
      model,decision,commercial_opportunity:"none",
      journey_stage:context?.journey?.stage||"discovery",sales_next_step:salesNextStep,
      proposed_tool_calls:tools,tool_results:toolResults,response_text:response,
      context_snapshot:context,context_bytes:contextBytes,
      input_tokens:0,cached_input_tokens:0,output_tokens:0,estimated_cost_usd:0,
      latency_ms:latency,success:true,error_code:null
    };
    let saved:any={data:null};
    if(!evalMode&&actorId){
      saved=await sb.from("papoai_admin_simulator_runs").insert(row).select("id,created_at").single();
    }
    return {status:200,body:{
      ok:true,simulation_id:saved.data?.id||null,created_at:saved.data?.created_at||new Date().toISOString(),
      response,decision,confidence:1,
      commercial_opportunity:"none",journey_stage:row.journey_stage,sales_next_step:salesNextStep,
      should_handoff:shouldHandoff,question,tools,tool_results:toolResults,context,
      media_preview:mediaPreview,
      metrics:{model,input_tokens:0,cached_input_tokens:0,output_tokens:0,estimated_cost_usd:0,latency_ms:latency,context_bytes:contextBytes},
      policy:{adjusted:false,violations:[]},
      external_side_effect:false,writes_executed:false,context_mode:"strict_read_only"
    }};
  };

  if(deterministicIntent?.intent==="payment_info"){
    let paymentContent=paymentPolicy?.content||"";
    if(!paymentContent){
      const policyQ=await sb.from("service_knowledge_items")
        .select("content")
        .eq("knowledge_key","payment_baseline")
        .eq("status","published")
        .maybeSingle();
      paymentContent=String(policyQ.data?.content||"");
    }
    if(paymentContent){
      const responseText=String(paymentContent)
        .replace(/\s*Nunca invente[\s\S]*$/i,"")
        .trim();
      return await deterministicReturn({
        response:responseText,
        decision:"RESPOND",
        model:"deterministic-policy",
        salesNextStep:"answer_need"
      });
    }
  }

  if(deterministicIntent?.intent==="greeting"){
    return await deterministicReturn({
      response:"Oi 😊 Bem-vindo à Dona Antônia. Posso te ajudar com cestas básicas, produtos do mercado ou ofertas. O que você precisa hoje?",
      decision:"RESPOND",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="delivery_info"){
    const msg=String(message||"").toLowerCase();
    let responseText="";
    if(/chapada\s+dos\s+guimar[aã]es|\bchapada\b/.test(msg)){
      responseText="No momento nossas entregas próprias atendem Cuiabá e Várzea Grande. Ainda não atendemos Chapada dos Guimarães.";
    }else if(/taxa|frete|gr[aá]tis|gratis/.test(msg)){
      responseText="Não cobramos taxa de entrega.";
    }else if(/hoje|hj|agora|agr|mesmo dia|pr[oó]ximo dia/.test(msg)){
      responseText="Pedidos feitos até as 11h têm previsão padrão de entrega no mesmo dia; após as 11h, a previsão padrão é o próximo dia útil. É uma previsão, não um horário garantido.";
    }else{
      responseText="Sim 😊 Fazemos entrega em Cuiabá e Várzea Grande, sem taxa de entrega.";
    }
    return await deterministicReturn({
      response:responseText,decision:"RESPOND",model:"deterministic-policy",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="safety_policy"){
    return await deterministicReturn({
      response:"Não posso alterar regras comerciais, liberar condição fora do sistema nem fornecer senhas, chaves ou dados internos. Posso te ajudar com produtos, preços, cestas e condições publicadas.",
      decision:"RESPOND",model:"deterministic-safety",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="business_info"){
    return await deterministicReturn({
      response:"A Dona Antônia trabalha com cestas básicas e produtos de mercado por delivery em Cuiabá e Várzea Grande. Você pode comprar direto pelo WhatsApp.",
      decision:"RESPOND",model:"deterministic-policy",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="customer_context"){
    const cs=context?.customer_summary||{};
    const known=Boolean(cs?.known_customer);
    const name=String(cs?.first_name||"").trim();
    const responseText=known
      ? `Sim${name?", "+name:""} 😊 Tenho seu contexto de atendimento e compras para te ajudar sem você precisar repetir tudo. O que você precisa hoje?`
      : "Ainda não identifiquei um histórico seu com segurança, mas posso te ajudar normalmente com cestas, produtos e ofertas.";
    return await deterministicReturn({
      response:responseText,decision:"RESPOND",model:"deterministic-customer-context",salesNextStep:"answer_need"
    });
  }

  if(deterministicIntent?.intent==="search_products"){
    const query=String(deterministicIntent?.query||message).trim();
    const rr=await r8ReadTool(sb,"search_products",{query,limit:20},conversationId,context);
    const items=Array.isArray(rr?.result)?rr.result:[];
    const tools=[{tool_key:"search_products",arguments_json:JSON.stringify({query,limit:20})}];
    const toolResults=[{tool_key:"search_products",operation_kind:"read",arguments:{query,limit:20},...rr}];
    let responseText="";
    if(!items.length){
      responseText="Não encontrei esse produto disponível agora. Se quiser, me diga outra marca, tamanho ou tipo que eu procuro uma alternativa.";
    }else{
      const rows=items.slice(0,20).map((x:any,index:number)=>`${index+1}. ${x?.name} — R$ ${Number(x?.commercial_price||0).toFixed(2).replace(".",",")}`);
      responseText="🛒 Encontrei estas opções:\n\n"+rows.join("\n\n")+"\n\nResponda pelo número da opção.";
      if(items.length>1)responseText+="\n\nSe quiser, me diga qual delas você prefere.";
      else responseText+="\n\nQuer que eu adicione ao pedido?";
    }
    const mediaPreview=r8MediaPreview(message,toolResults);
    return await deterministicReturn({
      response:responseText,decision:"ACT",tools,toolResults,mediaPreview,
      salesNextStep:"show_options"
    });
  }

  if(deterministicIntent?.intent==="list_baskets"){
    const rr=await r8ReadTool(sb,"search_baskets",{},conversationId,context);
    const items=Array.isArray(rr?.result)?rr.result:[];
    const response=items.length
      ? "🧺 Cestas disponíveis\n\n"+items.map((x:any)=>`🧺 ${x?.display_name||x?.name} — R$ ${Number(x?.commercial_price||0).toFixed(2).replace(".",",")}`).join("\n\n")+"\n\nQuer ver o que vem em alguma delas? Me diga o nome da cesta."
      : "Não encontrei cestas disponíveis agora.";
    const tools=[{tool_key:"search_baskets",arguments_json:"{}"}];
    const toolResults=[{tool_key:"search_baskets",operation_kind:"read",arguments:{},...rr}];
    return await deterministicReturn({
      response,decision:"ACT",tools,toolResults,salesNextStep:"show_options"
    });
  }

  if(deterministicIntent?.intent==="offers"){
    const rr=await r8ReadTool(sb,"get_offers",{limit:4},conversationId,context);
    const items=Array.isArray(rr?.result?.items)?rr.result.items:[];
    const response=items.length
      ? "🔥 Ofertas de hoje\n\n"+items.map((x:any)=>`🔥 ${x?.name} — R$ ${Number(x?.commercial_price||x?.offer_price||0).toFixed(2).replace(".",",")}`).join("\n\n")
      : "Não encontrei ofertas disponíveis agora.";
    const tools=[{tool_key:"get_offers",arguments_json:JSON.stringify({limit:4})}];
    const toolResults=[{tool_key:"get_offers",operation_kind:"read",arguments:{limit:4},...rr}];
    return await deterministicReturn({
      response,decision:"ACT",tools,toolResults,salesNextStep:"show_options"
    });
  }

  if(deterministicIntent?.intent==="basket_disambiguate"){
    const rr=await r8ReadTool(sb,"search_baskets",{},conversationId,context);
    const catalog=Array.isArray(rr?.result)?rr.result:[];
    const scale=String(deterministicIntent?.basket||deterministicIntent?.query||"").toLowerCase();
    const matches=catalog.filter((x:any)=>String(x?.name||x?.display_name||"").toLowerCase().includes(scale));
    const names=matches.slice(0,4).map((x:any)=>x?.display_name||x?.name).filter(Boolean);
    const responseText=names.length>1
      ? `Temos ${names.join(" e ")}. Qual delas você quer ver?`
      : names.length===1
        ? `Você quer a ${names[0]}?`
        : "Temos mais de uma cesta. Você quer Bonini ou Koblenz?";
    const tools=[{tool_key:"search_baskets",arguments_json:"{}"}];
    const toolResults=[{tool_key:"search_baskets",operation_kind:"read",arguments:{},...rr}];
    return await deterministicReturn({
      response:responseText,decision:"ASK",tools,toolResults,
      question:responseText,salesNextStep:"clarify_basket"
    });
  }

  if(deterministicIntent?.intent==="basket_detail"){
    const basket=String(deterministicIntent?.basket||deterministicIntent?.query||"").trim();
    const rr=await r8ReadTool(sb,"get_basket",{basket},conversationId,context);
    const detail=rr?.result||{};
    const b=detail?.basket||{};
    const items=Array.isArray(detail?.items)?detail.items:[];
    const wantsPhoto=/(foto|imagem|mostrar|mostra|manda)/i.test(message);
    let responseText="";
    if(detail?.found){
      if(wantsPhoto&&b?.image_url){
        responseText=`Claro! Aqui está a ${b?.display_name||b?.name||basket}.`;
      }else{
        const itemText=items.map((x:any)=>`• ${Number(x?.quantity||1)}x ${x?.name||"item"}`).join("\n\n");
        responseText=`🧺 ${b?.display_name||b?.name||basket}\n💰 R$ ${Number(b?.commercial_price||0).toFixed(2).replace(".",",")}\n\n${itemText}`;
      }
    }else{
      responseText="Não consegui localizar essa cesta pelo nome. Me diga se é Bonini ou Koblenz.";
    }
    const tools=[{tool_key:"get_basket",arguments_json:JSON.stringify({basket})}];
    const toolResults=[{tool_key:"get_basket",operation_kind:"read",arguments:{basket},...rr}];
    const mediaPreview=r8MediaPreview(message,toolResults);
    return await deterministicReturn({
      response:responseText,
      decision:detail?.found?"ACT":"ASK",
      tools,toolResults,mediaPreview,
      question:detail?.found?"":"Qual cesta você quer ver?",
      salesNextStep:detail?.found?"answer_need":"clarify_basket"
    });
  }

  if(deterministicIntent?.intent==="delivery_schedule"){
    const tools=[{tool_key:"request_handoff",arguments_json:JSON.stringify({
      reason:"delivery_schedule_confirmation",
      summary:"Cliente pediu confirmação de horário ou janela específica de entrega."
    })}];
    const toolResults=[{
      tool_key:"request_handoff",operation_kind:"commitment",
      arguments:{
        reason:"delivery_schedule_confirmation",
        summary:"Cliente pediu confirmação de horário ou janela específica de entrega."
      },
      ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:"Vou chamar uma pessoa da nossa equipe para continuar com você. O horário exato depende da rota e da operação do dia, então ela confirma essa janela com você.",
      decision:"ACT",tools,toolResults,shouldHandoff:true,salesNextStep:"handoff"
    });
  }

  if(deterministicIntent?.intent==="handoff"){
    const tools=[{tool_key:"request_handoff",arguments_json:JSON.stringify({
      reason:"customer_requested_human",
      summary:"Cliente pediu atendimento humano."
    })}];
    const toolResults=[{
      tool_key:"request_handoff",operation_kind:"commitment",
      arguments:{reason:"customer_requested_human",summary:"Cliente pediu atendimento humano."},
      ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:"Vou chamar uma pessoa da nossa equipe para continuar com você. 😊",
      decision:"ACT",tools,toolResults,shouldHandoff:true,salesNextStep:"handoff"
    });
  }

  if(deterministicIntent?.intent==="checkout_readiness"&&context?.cart?.has_cart){
    const rr=await r8ReadTool(sb,"get_checkout_next_step",{},conversationId,context);
    const step=rr?.result||{};
    const tools=[{tool_key:"get_checkout_next_step",arguments_json:"{}"}];
    const toolResults=[{tool_key:"get_checkout_next_step",operation_kind:"read",arguments:{},...rr}];
    if(step?.step==="collect_payment"){
      return await deterministicReturn({
        response:step?.prompt||"Como você prefere pagar? Pode ser Pix, dinheiro, cartão de crédito ou cartão alimentação/refeição.",
        decision:"ASK",tools,toolResults,
        question:step?.prompt||"Como você prefere pagar?",
        salesNextStep:"collect_payment"
      });
    }
    if(step?.step==="cart_missing"){
      return await deterministicReturn({
        response:"Seu carrinho ainda está vazio. O que você gostaria de comprar?",
        decision:"ASK",tools,toolResults,
        question:"O que você gostaria de comprar?",
        salesNextStep:"build_cart"
      });
    }
    const prepareCall={tool_key:"prepare_order_confirmation",arguments_json:"{}"};
    toolResults.push({
      tool_key:"prepare_order_confirmation",operation_kind:"commitment",
      arguments:{},ok:true,executed:false,blocked_by_simulator:true
    });
    return await deterministicReturn({
      response:"Perfeito. Vou preparar o resumo final para você confirmar antes de fechar o pedido.",
      decision:"ACT",tools:[...tools,prepareCall],toolResults,
      salesNextStep:"prepare_confirmation"
    });
  }

  if(deterministicIntent?.intent==="cancel_pending"&&context?.pending_action){
    const tools=[{tool_key:"cancel_pending",arguments_json:"{}"}];
    const toolResults=[{
      tool_key:"cancel_pending",operation_kind:"write",
      arguments:{},ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:"Tudo bem, não vou confirmar essa ação.",
      decision:"ACT",tools,toolResults,salesNextStep:"return_to_conversation"
    });
  }

  if(deterministicIntent?.intent==="confirm_pending"&&context?.pending_action){
    const tools=[{tool_key:"confirm_order",arguments_json:JSON.stringify({confirm:true})}];
    const toolResults=[{
      tool_key:"confirm_order",operation_kind:"commitment",
      arguments:{confirm:true},ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:"Perfeito, confirmação recebida. No fluxo real, este é o ponto de confirmar o pedido de forma idempotente.",
      decision:"ACT",tools,toolResults,salesNextStep:"confirm_order"
    });
  }

  if(deterministicIntent?.intent==="set_basket_quantity"&&context?.cart?.has_cart){
    const source=String(deterministicIntent?.source_query||"").trim();
    const quantity=Math.max(0,Number(deterministicIntent?.quantity||0));
    const norm=(v:any)=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    const sourceNorm=norm(source);
    const items=Array.isArray(context?.cart?.items)?context.cart.items:[];
    const matched=items.find((x:any)=>{
      const name=norm(x?.name);
      return name===sourceNorm||name.includes(sourceNorm)||sourceNorm.includes(name);
    })||null;
    if(matched?.product_id){
      const toolKey=quantity===0?"remove_cart_item":"change_quantity";
      const args=quantity===0
        ? {product_id:matched.product_id}
        : {product_id:matched.product_id,quantity};
      const tools=[{tool_key:toolKey,arguments_json:JSON.stringify(args)}];
      const toolResults=[{
        tool_key:toolKey,operation_kind:"write",
        arguments:args,ok:true,executed:false,blocked_by_simulator:true
      }];
      const response=quantity===0
        ? `Certo, vou retirar ${matched.name||source} da cesta.`
        : `Certo, vou ajustar ${matched.name||source} para ${quantity} unidade(s).`;
      return await deterministicReturn({
        response,decision:"ACT",tools,toolResults,salesNextStep:"update_cart"
      });
    }
    return await deterministicReturn({
      response:`Não consegui identificar com segurança qual item corresponde a "${source}". Qual item da cesta você quer alterar?`,
      decision:"ASK",tools:[],toolResults:[],
      question:"Qual item da cesta você quer alterar?",salesNextStep:"clarify_cart_item"
    });
  }

  if(deterministicIntent?.intent==="set_payment_method"&&context?.cart?.has_cart){
    const payment=String(deterministicIntent?.query||"").trim();
    const tools=[{tool_key:"set_payment_method",arguments_json:JSON.stringify({payment_method:payment})}];
    const toolResults=[{
      tool_key:"set_payment_method",operation_kind:"write",
      arguments:{payment_method:payment},ok:true,executed:false,blocked_by_simulator:true
    }];
    return await deterministicReturn({
      response:`Perfeito, pagamento por ${payment}. Posso seguir para a confirmação do pedido.`,
      decision:"ACT",tools,toolResults,salesNextStep:"prepare_confirmation"
    });
  }

  if(deterministicIntent?.intent==="set_addon_quantity"){
    const query=String(deterministicIntent?.query||message).trim();
    const quantity=Math.max(1,Number(deterministicIntent?.quantity||1));
    const rr=await r8ReadTool(sb,"search_products",{query,limit:4},conversationId,context);
    const items=Array.isArray(rr?.result)?rr.result:[];
    const readCall={tool_key:"search_products",arguments_json:JSON.stringify({query,limit:4})};
    const toolResults:any[]=[{tool_key:"search_products",operation_kind:"read",arguments:{query,limit:4},...rr}];
    if(items.length===1){
      const selected=items[0];
      const writeCall={tool_key:"add_cart_item",arguments_json:JSON.stringify({product_id:selected.product_id||selected.id,quantity})};
      toolResults.push({
        tool_key:"add_cart_item",operation_kind:"write",
        arguments:{product_id:selected.product_id||selected.id,quantity},
        ok:true,executed:false,blocked_by_simulator:true
      });
      return await deterministicReturn({
        response:`Certo. Vou acrescentar ${quantity} unidade(s) de ${selected.name} ao pedido.`,
        decision:"ACT",tools:[readCall,writeCall],toolResults,salesNextStep:"update_cart"
      });
    }
    const names=items.slice(0,4).map((x:any)=>x?.name).filter(Boolean);
    const responseText=names.length
      ? `Encontrei estas opções: ${names.join("; ")}. Qual delas você quer adicionar?`
      : `Não encontrei ${query} com segurança. Quer tentar outro nome ou marca?`;
    return await deterministicReturn({
      response:responseText,decision:"ASK",tools:[readCall],toolResults,
      question:responseText,salesNextStep:"clarify_product"
    });
  }

  const model=cfgQ.data.primary_model||"gpt-5.6-terra";
  let planned=await planPapoAiTurn({
    message,
    contextPack:context,
    tools:Array.isArray(toolsQ.data)?toolsQ.data:[],
    apiKey:key,
    model,
    reasoningEffort:cfgQ.data.primary_reasoning_effort||"low",
    maxOutputTokens:Math.min(800,Number(cfgQ.data.max_output_tokens||500))
  });
  if(evalMode&&planned?.ok!==true){
    await new Promise(resolve=>setTimeout(resolve,900));
    planned=await planPapoAiTurn({
      message,
      contextPack:context,
      tools:Array.isArray(toolsQ.data)?toolsQ.data:[],
      apiKey:key,
      model,
      reasoningEffort:cfgQ.data.primary_reasoning_effort||"low",
      maxOutputTokens:Math.min(800,Number(cfgQ.data.max_output_tokens||500))
    });
  }
  if(evalMode&&planned?.ok!==true){
    await new Promise(resolve=>setTimeout(resolve,1800));
    planned=await planPapoAiTurn({
      message,
      contextPack:context,
      tools:Array.isArray(toolsQ.data)?toolsQ.data:[],
      apiKey:key,
      model,
      reasoningEffort:cfgQ.data.primary_reasoning_effort||"low",
      maxOutputTokens:Math.min(800,Number(cfgQ.data.max_output_tokens||500))
    });
  }

  const tr:any[]=[];
  for(const call of Array.isArray(planned?.plan?.tool_calls)?planned.plan.tool_calls.slice(0,6):[]){
    let args:any={};
    try{args=JSON.parse(String(call?.arguments_json||"{}"))}catch{}
    const tool=(Array.isArray(toolsQ.data)?toolsQ.data:[]).find((t:any)=>t?.tool_key===call?.tool_key);
    if(tool?.operation_kind==="read"){
      const rr=await r8ReadTool(sb,String(call.tool_key||""),args,conversationId,context);
      tr.push({tool_key:call.tool_key,operation_kind:"read",arguments:args,...rr});
    }else{
      tr.push({
        tool_key:call?.tool_key||"",
        operation_kind:tool?.operation_kind||"unknown",
        arguments:args,ok:true,executed:false,blocked_by_simulator:true
      });
    }
  }

  const mediaPreview=r8MediaPreview(message,tr);
  const final=planned?.ok
    ? await r8FinalDraft(key,model,message,planned.plan,tr)
    : {text:"",usage:null,latency_ms:0};

  let responseText=final?.text||planned?.plan?.response_draft||"";
  if(mediaPreview&&/(não consegui|nao consegui|não foi possível|nao foi possivel)/i.test(responseText)){
    responseText="Claro! Aqui está "+mediaPreview.label+".";
  }

  const u1=planned?.usage||{},u2=final?.usage||{};
  const input=Number(u1?.input_tokens||0)+Number(u2?.input_tokens||0);
  const cached=Number(u1?.input_tokens_details?.cached_tokens||0)+Number(u2?.input_tokens_details?.cached_tokens||0);
  const output=Number(u1?.output_tokens||0)+Number(u2?.output_tokens||0);
  const pq=await sb.from("papoai_model_price_profiles").select("*").eq("model",model).maybeSingle();
  const price=pq.data;
  let cost:number|null=null;
  if(price){
    const nc=Math.max(0,input-cached);
    cost=(nc*Number(price.input_usd_per_million||0)+cached*Number(price.cached_input_usd_per_million||0)+output*Number(price.output_usd_per_million||0))/1000000;
  }

  const cb=new TextEncoder().encode(JSON.stringify(context)).length;
  const success=planned?.ok===true;
  const row:any={
    actor_user_id:actorId,customer_id:customerId,conversation_id:conversationId,input_text:message,
    model,decision:planned?.plan?.decision||null,commercial_opportunity:planned?.plan?.commercial_opportunity||null,
    journey_stage:planned?.plan?.journey_stage||null,sales_next_step:planned?.plan?.sales_next_step||null,
    proposed_tool_calls:planned?.plan?.tool_calls||[],tool_results:tr,response_text:responseText,
    context_snapshot:context,context_bytes:cb,input_tokens:input,cached_input_tokens:cached,output_tokens:output,
    estimated_cost_usd:cost,latency_ms:Date.now()-started,success,
    error_code:success?null:String(planned?.error||"planner_failed")
  };
  let saved:any={data:null};
  if(!evalMode&&actorId){
    saved=await sb.from("papoai_admin_simulator_runs").insert(row).select("id,created_at").single();
  }

  return {status:200,body:{
    ok:success,simulation_id:saved.data?.id||null,created_at:saved.data?.created_at||new Date().toISOString(),
    response:responseText,decision:row.decision,confidence:planned?.plan?.confidence??null,
    commercial_opportunity:row.commercial_opportunity,journey_stage:row.journey_stage,
    sales_next_step:row.sales_next_step,should_handoff:Boolean(planned?.plan?.should_handoff),
    question:planned?.plan?.question||"",tools:row.proposed_tool_calls,tool_results:tr,context,
    media_preview:mediaPreview,
    metrics:{
      model,input_tokens:input,cached_input_tokens:cached,output_tokens:output,
      estimated_cost_usd:cost,latency_ms:row.latency_ms,context_bytes:cb
    },
    policy:{adjusted:Boolean(planned?.policy_adjusted),violations:planned?.policy_violations||[]},
    planner_error:success?null:(planned?.error||"planner_failed"),
    planner_error_status:success?null:(planned?.status??null),
    planner_error_message:success?null:(planned?.error_message||null),
    external_side_effect:false,writes_executed:false,context_mode:"strict_read_only"
  }};
}


async function r8VerifyEvalKey(sb:any,supplied:string){
  if(!supplied)return false;
  const hash=await r8Sha256Hex(supplied);
  const q=await sb.from("system_secrets")
    .select("key_hash,is_active")
    .eq("key_name","papoai_brain_eval_v1")
    .maybeSingle();
  return q.data?.is_active===true&&q.data?.key_hash===hash;
}
async function r8RunEvalChunk(sb:any,runId:string,limit:number){
  const claim=await sb.rpc("claim_papoai_brain_eval_batch_v1",{
    p_run_id:runId,
    p_limit:Math.max(1,Math.min(6,Number(limit||4)))
  });
  if(claim.error)return {ok:false,error:"claim_failed",detail:claim.error.message};
  const items=Array.isArray(claim.data?.items)?claim.data.items:[];
  let processed=0;
  for(const item of items){
    const started=Date.now();
    try{
      let sim=await r8Simulator(sb,null,{
        message:item.message_text,
        conversation_id:item.conversation_id||null,
        customer_id:item.customer_id||null,
        context_fixture:item.context_fixture||{},
        eval_mode:true
      });
      if(sim.status>=400||sim.body?.ok!==true){
        await new Promise(resolve=>setTimeout(resolve,250));
        sim=await r8Simulator(sb,null,{
          message:item.message_text,
          conversation_id:item.conversation_id||null,
          customer_id:item.customer_id||null,
          context_fixture:item.context_fixture||{},
          eval_mode:true
        });
      }
      const b=sim.body||{};
      const transientPlannerErrors=new Set(["openai_http_error","AbortError","TimeoutError","planner_parse_error","TypeError"]);
      const transientError=(sim.status>=400||b.ok!==true)
        && transientPlannerErrors.has(String(b.planner_error||b.error||""));
      if(transientError&&Number(item.attempt_count||1)<4){
        await sb.from("papoai_brain_eval_results").update({
          status:"queued",
          failure_codes:[],
          error_code:clean(b.planner_error||b.error||"transient_planner_error",120),
          error_detail:clean(b.planner_error_message||b.detail||"",1000),
          started_at:null,
          finished_at:null
        }).eq("id",item.result_id);
        processed++;
        continue;
      }
      const checked=r8EvalCheck(item.expected||{},b);
      const metrics=b.metrics||{};
      const status=sim.status>=400||b.ok!==true?"error":(checked.passed?"passed":"failed");
      const upd=await sb.from("papoai_brain_eval_results").update({
        status,
        decision:b.decision||null,
        commercial_opportunity:b.commercial_opportunity||null,
        journey_stage:b.journey_stage||null,
        should_handoff:Boolean(b.should_handoff),
        response_text:clean(b.response,12000)||null,
        proposed_tools:Array.isArray(b.tools)?b.tools:[],
        tool_results:Array.isArray(b.tool_results)?b.tool_results:[],
        media_preview:b.media_preview||null,
        checks:checked.checks||{},
        failure_codes:status==="error"?["simulation_error"]:checked.failures,
        error_code:status==="error"?clean(b.planner_error||b.error||"simulation_error",120):null,
        error_detail:status==="error"?clean(b.planner_error_message||b.detail||"",1000):null,
        input_tokens:Number(metrics.input_tokens||0),
        cached_input_tokens:Number(metrics.cached_input_tokens||0),
        output_tokens:Number(metrics.output_tokens||0),
        estimated_cost_usd:Number(metrics.estimated_cost_usd||0),
        latency_ms:Number(metrics.latency_ms||Date.now()-started),
        finished_at:new Date().toISOString()
      }).eq("id",item.result_id);
      if(upd.error)throw upd.error;
      processed++;
    }catch(e){
      await sb.from("papoai_brain_eval_results").update({
        status:"error",
        failure_codes:["runner_exception"],
        error_code:"runner_exception",
        error_detail:clean((e as Error)?.message,1000),
        latency_ms:Date.now()-started,
        finished_at:new Date().toISOString()
      }).eq("id",item.result_id);
      processed++;
    }
  }
  const fin=await sb.rpc("finalize_papoai_brain_eval_run_v1",{p_run_id:runId});
  if(!fin.error&&fin.data?.complete!==true){
    await sb.rpc("dispatch_papoai_brain_eval_run_v1",{p_run_id:runId});
  }
  return {ok:true,run_id:runId,processed,finalize:fin.data||null};
}


const vitrineDigits=(v:unknown,max=30)=>String(v??"").replace(/\D+/g,"").slice(0,max);
const vitrinePhone=(v:unknown)=>{let d=vitrineDigits(v,20);if(!d)return "";if((d.length===10||d.length===11)&&!d.startsWith("55"))d="55"+d;return d.startsWith("+")?d:"+"+d};
const vitrineDay=(v:unknown)=>{const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=31?n:null};
const vitrineMonth=(v:unknown)=>{const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=12?n:null};

async function vitrineCustomerBundles(sb:any,ids:string[]){
  const out=new Map<string,any>();
  for(const id of ids)out.set(id,{emails:[],addresses:[]});
  if(!ids.length)return out;
  const [emails,addresses]=await Promise.all([
    sb.from("customer_emails")
      .select("customer_id,email,is_primary,verification_status,created_at")
      .in("customer_id",ids)
      .order("is_primary",{ascending:false})
      .order("created_at",{ascending:false}),
    sb.from("customer_addresses")
      .select("id,customer_id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,is_active,google_maps_url,block,latitude,longitude,updated_at")
      .in("customer_id",ids)
      .eq("is_active",true)
      .order("is_default",{ascending:false})
      .order("updated_at",{ascending:false})
  ]);
  if(emails.error)throw emails.error;
  if(addresses.error)throw addresses.error;
  for(const row of emails.data||[])out.get(row.customer_id)?.emails.push(row);
  for(const row of addresses.data||[])out.get(row.customer_id)?.addresses.push(row);
  return out;
}
function vitrinePublicCustomer(row:any,bundle:any){
  const a=bundle?.addresses?.[0]||null;
  const email=bundle?.emails?.[0]?.email||"";
  return {
    id:row.id,
    display_name:row.name||"",
    phone:row.primary_whatsapp_e164||"",
    cpf:row.cpf_cnpj||"",
    email,
    status:row.is_active?"active":"inactive",
    is_active:Boolean(row.is_active),
    birthday_day:row.birthday_day??null,
    birthday_month:row.birthday_month??null,
    orders_count:Number(row.order_count||0),
    lifetime_value:Number(row.lifetime_value||0),
    created_at:row.created_at,
    updated_at:row.updated_at,
    address:a?{
      id:a.id,label:a.label,street:a.street,number:a.number,complement:a.complement,
      district:a.neighborhood,city:a.city,state:a.state,postal_code:a.postal_code,
      raw_text:a.reference,google_maps_url:a.google_maps_url,block:a.block,
      latitude:a.latitude,longitude:a.longitude
    }:null
  };
}
async function vitrineListCustomers(sb:any,body:any){
  const q=clean(body?.q,80).toLowerCase();
  const qDigits=vitrineDigits(q,20);
  const limit=Math.max(1,Math.min(150,Number(body?.limit||120)||120));
  const rows=await sb.from("customers")
    .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
    .order("updated_at",{ascending:false})
    .limit(650);
  if(rows.error)throw rows.error;
  let items=rows.data||[];
  if(q){
    items=items.filter((r:any)=>{
      const name=String(r.name||"").toLowerCase();
      const phone=vitrineDigits(r.primary_whatsapp_e164,20);
      const cpf=vitrineDigits(r.cpf_cnpj,20);
      return name.includes(q)||Boolean(qDigits&&(phone.includes(qDigits)||cpf.includes(qDigits)));
    });
  }
  items=items.slice(0,limit);
  const bundles=await vitrineCustomerBundles(sb,items.map((r:any)=>r.id));
  return items.map((r:any)=>vitrinePublicCustomer(r,bundles.get(r.id)));
}
async function vitrineGetCustomer(sb:any,id:string){
  const q=await sb.from("customers")
    .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
    .eq("id",id).maybeSingle();
  if(q.error)throw q.error;
  if(!q.data)return null;
  const bundles=await vitrineCustomerBundles(sb,[id]);
  return vitrinePublicCustomer(q.data,bundles.get(id));
}

const BLING_API_BASE="https://api.bling.com.br/Api/v3";
const BLING_OAUTH_URLS=["https://api.bling.com.br/oauth/token","https://api.bling.com.br/Api/v3/oauth/token"];
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function blingHubReadinessExtended(sb:any){
  const r=await sb.rpc("bling_hub_readiness_v2");
  if(r.error)throw r.error;
  const [links,customerLinks]=await Promise.all([
    sb.from("bling_hub_entity_links_v2").select("status").eq("source_system","vitrine_qx").eq("entity_type","product").limit(5000),
    sb.from("bling_hub_entity_links_v2").select("status").eq("source_system","canonical_ssbes").eq("entity_type","customer").limit(5000)
  ]);
  if(links.error)throw links.error;
  if(customerLinks.error)throw customerLinks.error;
  const counts:any={total:0,matched:0,not_found:0,ambiguous:0,review_required:0,unresolved:0,inactive:0};
  const customerCounts:any={total:0,matched:0,not_found:0,ambiguous:0,review_required:0,unresolved:0,inactive:0};
  for(const row of links.data||[]){counts.total++;counts[row.status]=(counts[row.status]||0)+1;}
  for(const row of customerLinks.data||[]){customerCounts.total++;customerCounts[row.status]=(customerCounts[row.status]||0)+1;}
  return {...(r.data||{}),product_links:counts,customer_links:customerCounts};
}
async function blingHubAuthorized(sb:any,req:Request){
  const supplied=clean(req.headers.get("x-dona-antonia-bling-hub-key"),200);
  if(!supplied)return false;
  const q=await sb.rpc("get_bling_hub_key_v2");
  if(q.error||!q.data)return false;
  const a=new TextEncoder().encode(supplied),b=new TextEncoder().encode(String(q.data));
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
async function blingHubReserveSlot(sb:any){
  const q=await sb.rpc("reserve_bling_hub_rate_slot_v2",{});
  if(q.error)throw new Error("rate_slot_failed");
  const wait=Math.max(0,Number(q.data||0));
  if(wait)await sleep(wait);
}
async function blingHubOauth(sb:any){
  const owner=crypto.randomUUID();
  const lock=await sb.rpc("claim_bling_hub_oauth_lock_v2",{p_owner:owner,p_ttl_seconds:90});
  if(lock.error)throw new Error("oauth_lock_failed");
  if(lock.data!==true)throw new Error("oauth_busy");
  try{
    const c=await sb.rpc("get_bling_api_credentials_v1");
    if(c.error)throw new Error("credentials_lookup_failed");
    const clientId=clean(c.data?.client_id,500),clientSecret=clean(c.data?.client_secret,500),refreshToken=clean(c.data?.refresh_token,5000);
    if(!clientId||!clientSecret||!refreshToken)throw new Error("bling_credentials_missing");
    await sb.from("bling_hub_runtime_v2").update({last_oauth_check_at:new Date().toISOString(),last_oauth_error:null,updated_at:new Date().toISOString()}).eq("id",1);
    const basic=btoa(clientId+":"+clientSecret);
    let response:Response|null=null;
    let data:any={};
    let lastCode="";
    for(const oauthUrl of BLING_OAUTH_URLS){
      const body=new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken});
      const attempt=await fetch(oauthUrl,{
        method:"POST",
        headers:{Authorization:"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded",Accept:"1.0","enable-jwt":"1"},
        body,
        signal:AbortSignal.timeout(10000)
      });
      const raw=await attempt.text();
      let parsed:any={};
      try{parsed=raw?JSON.parse(raw):{}}catch{}
      response=attempt;
      data=parsed;
      lastCode=clean(parsed?.error||parsed?.error_description,120);
      if(attempt.ok&&clean(parsed?.access_token,5000))break;
      if(![403,404,405].includes(attempt.status))break;
    }
    if(!response?.ok||!clean(data?.access_token,5000)){
      const errorLabel="oauth_http_"+String(response?.status||0)+(lastCode?":"+lastCode:"");
      await sb.from("bling_hub_runtime_v2").update({last_oauth_error:errorLabel,updated_at:new Date().toISOString()}).eq("id",1);
      throw new Error(errorLabel);
    }
    const rotated=clean(data?.refresh_token,5000);
    if(rotated&&rotated!==refreshToken){
      const save=await sb.rpc("set_bling_api_refresh_token_v1",{p_refresh_token:rotated});
      if(save.error)throw new Error("refresh_token_persist_failed");
    }
    await sb.from("bling_hub_runtime_v2").update({last_oauth_ok_at:new Date().toISOString(),last_oauth_error:null,updated_at:new Date().toISOString()}).eq("id",1);
    return clean(data.access_token,5000);
  }finally{
    await sb.rpc("release_bling_hub_oauth_lock_v2",{p_owner:owner});
  }
}
async function blingHubWriteIdempotent(sb:any,token:string,path:string,method:string,payload:any){
  let lastStatus=0,lastError="";
  for(let attempt=1;attempt<=4;attempt++){
    await blingHubReserveSlot(sb);
    try{
      const r=await fetch(BLING_API_BASE+path,{
        method,
        headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(15000)
      });
      lastStatus=r.status;
      const raw=await r.text();
      let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
      if(r.ok)return {ok:true,status:r.status,data};
      const retryable=r.status===429||r.status>=500;
      lastError=clean(data?.error?.message||data?.error?.description||data?.error||raw,500);
      const providerDetails=Array.isArray(data?.error?.fields)
        ? data.error.fields.slice(0,20).map((x:any)=>({
            field:clean(x?.field||x?.name||x?.path,120),
            message:clean(x?.message||x?.description||x?.error,240)
          }))
        : [];
      if(!retryable||attempt===4)return {ok:false,status:r.status,error:lastError,provider_details:providerDetails};
      const retryAfter=Number(r.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter)&&retryAfter>0?retryAfter*1000:attempt*attempt*1000);
    }catch(e){
      lastError=clean((e as Error)?.message||e,500);
      if(attempt===4)return {ok:false,status:lastStatus,error:lastError};
      await sleep(attempt*attempt*1000);
    }
  }
  return {ok:false,status:lastStatus,error:lastError||"bling_write_failed"};
}
async function blingHubGet(sb:any,token:string,path:string){
  await blingHubReserveSlot(sb);
  const r=await fetch(BLING_API_BASE+path,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json","enable-jwt":"1"},signal:AbortSignal.timeout(10000)});
  const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
  return {ok:r.ok,status:r.status,data};
}
function blingHubDigits(v:any){return String(v??"").replace(/\D/g,"")}
function blingHubValidGtin(v:any){
  const g=blingHubDigits(v);if(![8,12,13,14].includes(g.length))return false;
  const expected=Number(g[g.length-1]);let sum=0;
  for(let i=g.length-2,offset=0;i>=0;i--,offset++)sum+=Number(g[i])*(offset%2===0?3:1);
  return (10-(sum%10))%10===expected;
}
function blingHubProductPayload(current:any,local:any){
  const allowed=["nome","codigo","preco","tipo","formato","descricaoCurta","descricaoComplementar","dataValidade","unidade","pesoLiquido","pesoBruto","volumes","itensPorCaixa","gtin","gtinEmbalagem","tipoProducao","condicao","freteGratis","marca","observacoes","linkExterno","estoque","dimensoes","tributacao","midia","categoria"];
  const payload:any={};
  for(const key of allowed)if(current?.[key]!==undefined&&current?.[key]!==null)payload[key]=current[key];
  const meta=local?.metadata&&typeof local.metadata==="object"?local.metadata:{};
  if(clean(local?.name,220))payload.nome=clean(local.name,220);
  if(clean(local?.sku,120))payload.codigo=clean(local.sku,120);
  const price=Number(local?.sale_price_cents);if(Number.isFinite(price)&&price>=0)payload.preco=Math.round(price)/100;
  const gtin=blingHubDigits(local?.gtin);if(gtin&&blingHubValidGtin(gtin))payload.gtin=gtin;
  if(clean(meta?.unit,20))payload.unidade=clean(meta.unit,20);
  if(clean(meta?.brand,120))payload.marca=clean(meta.brand,120);
  if(clean(local?.description,1800))payload.descricaoComplementar=clean(local.description,1800);
  payload.tipo=clean(payload.tipo||current?.tipo||"P",10)||"P";
  payload.formato=clean(payload.formato||current?.formato||"S",10)||"S";
  payload.situacao=local?.active===false?"I":"A";
  delete payload.id;
  return payload;
}
function blingHubManagedProductDiff(current:any,payload:any){
  const keys=["nome","codigo","preco","gtin","unidade","marca","descricaoComplementar","situacao"];
  const diff:any={};
  for(const key of keys){
    const a=current?.[key]??null,b=payload?.[key]??null;
    if(JSON.stringify(a)!==JSON.stringify(b))diff[key]={from:a,to:b};
  }
  return diff;
}
async function blingHubPreviewProductSync(sb:any,item:any){
  const sourceId=uuid(item?.source_id);if(!sourceId)return {ok:false,error:"invalid_product"};
  const link=await sb.from("bling_hub_entity_links_v2").select("bling_id,status,metadata")
    .eq("source_system","vitrine_qx").eq("entity_type","product").eq("source_id",sourceId).maybeSingle();
  if(link.error)throw link.error;
  if(!link.data||link.data.status!=="matched"||!Number(link.data.bling_id))return {ok:false,error:"product_not_linked"};
  const token=await blingHubOauth(sb);
  const detail=await blingHubGet(sb,token,"/produtos/"+encodeURIComponent(String(link.data.bling_id)));
  if(!detail.ok)return {ok:false,error:"bling_product_http_"+detail.status};
  const current=detail.data?.data||{};
  const payload=blingHubProductPayload(current,item?.product||{});
  const diff=blingHubManagedProductDiff(current,payload);
  return {ok:true,readonly:true,external_write:false,source_id:sourceId,bling_id:Number(link.data.bling_id),changes:diff,change_count:Object.keys(diff).length,current:{nome:current?.nome||"",codigo:current?.codigo||"",preco:current?.preco??null,gtin:current?.gtin||"",unidade:current?.unidade||"",marca:current?.marca||"",situacao:current?.situacao||""},desired:{nome:payload?.nome||"",codigo:payload?.codigo||"",preco:payload?.preco??null,gtin:payload?.gtin||"",unidade:payload?.unidade||"",marca:payload?.marca||"",situacao:payload?.situacao||""}};
}
async function blingHubResolveDepositId(sb:any,token:string){
  const rt=await sb.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();
  if(rt.error)throw rt.error;
  const configured=Number(rt.data?.metadata?.selected_deposit_id||0);
  if(configured>0)return configured;
  const r=await blingHubGet(sb,token,"/depositos?pagina=1&limite=100&situacao=1");
  if(!r.ok)throw new Error("deposits_http_"+r.status);
  const rows=Array.isArray(r.data?.data)?r.data.data:[];
  const preferred=rows.find((d:any)=>d?.padrao===true||d?.padrao===1||d?.padrao==="true");
  const id=Number(preferred?.id||(rows.length===1?rows[0]?.id:0));
  if(!id)throw new Error("default_deposit_not_resolved");
  const nextMeta={...(rt.data?.metadata||{}),selected_deposit_id:id,selected_deposit_name:clean(preferred?.descricao||preferred?.nome||rows[0]?.descricao||rows[0]?.nome,120)||null,deposit_resolved_at:new Date().toISOString()};
  await sb.from("bling_hub_runtime_v2").update({metadata:nextMeta,updated_at:new Date().toISOString()}).eq("id",1);
  return id;
}
async function blingHubReadStock(sb:any,token:string,blingProductId:number,depositId:number){
  const q=new URLSearchParams();q.append("idsProdutos[]",String(blingProductId));
  const r=await blingHubGet(sb,token,"/estoques/saldos?"+q.toString());
  if(!r.ok)return {ok:false,status:r.status,stock:null};
  const rows=Array.isArray(r.data?.data)?r.data.data:[];
  const row=rows.find((x:any)=>Number(x?.produto?.id||0)===blingProductId)||rows[0];
  const dep=(Array.isArray(row?.depositos)?row.depositos:[]).find((d:any)=>Number(d?.id||0)===depositId);
  return {ok:true,status:r.status,stock:Number(dep?.saldoFisico??0)};
}
async function blingHubPreviewStockSync(sb:any,item:any){
  const sourceId=uuid(item?.source_id);if(!sourceId)return {ok:false,error:"invalid_product"};
  const target=Number(item?.stock_quantity);if(!Number.isFinite(target)||target<0)return {ok:false,error:"invalid_stock"};
  const link=await sb.from("bling_hub_entity_links_v2").select("bling_id,status").eq("source_system","vitrine_qx").eq("entity_type","product").eq("source_id",sourceId).maybeSingle();
  if(link.error)throw link.error;
  if(!link.data||link.data.status!=="matched"||!Number(link.data.bling_id))return {ok:false,error:"product_not_linked"};
  const token=await blingHubOauth(sb);
  const depositId=await blingHubResolveDepositId(sb,token);
  const current=await blingHubReadStock(sb,token,Number(link.data.bling_id),depositId);
  if(!current.ok)return {ok:false,error:"bling_stock_http_"+current.status};
  return {ok:true,readonly:true,external_write:false,source_id:sourceId,bling_id:Number(link.data.bling_id),deposit_id:depositId,current_stock:current.stock,target_stock:target,change_required:Number(current.stock)!==target};
}
async function blingHubPostStockOnce(sb:any,token:string,body:any){
  await blingHubReserveSlot(sb);
  try{
    const r=await fetch(BLING_API_BASE+"/estoques",{method:"POST",headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
    return {ok:r.ok,status:r.status,data,error:r.ok?"":clean(data?.error?.message||data?.error?.description||data?.error||raw,500)};
  }catch(e){return {ok:false,status:0,data:{},error:clean((e as Error)?.message||e,500)};}
}
async function blingHubProcessStockJobs(sb:any,limitRaw:any){
  const worker="bling-stock-edge-"+crypto.randomUUID();
  const limit=Math.max(1,Math.min(10,Number(limitRaw||1)||1));
  const claim=await sb.rpc("claim_bling_hub_jobs_v2",{p_worker:worker,p_domains:["stock"],p_limit:limit,p_lease_seconds:300});
  if(claim.error)throw claim.error;
  const jobs=claim.data||[];
  const summary:any={ok:true,claimed:jobs.length,processed:0,synced:0,review_required:0,retry:0,failed:0};
  if(!jobs.length)return summary;
  const token=await blingHubOauth(sb);
  const depositId=await blingHubResolveDepositId(sb,token);
  for(const job of jobs){
    summary.processed++;
    try{
      if(job.operation!=="set_stock"){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"unsupported_operation",p_error_message:"Unsupported stock operation",p_http_status:null,p_retry_seconds:120,p_provider_id:null});summary.review_required++;continue;
      }
      const target=Number(job.payload?.stock_quantity);
      if(!Number.isFinite(target)||target<0){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"invalid_stock",p_error_message:"Invalid stock quantity",p_http_status:null,p_retry_seconds:120,p_provider_id:null});summary.review_required++;continue;
      }
      const link=await sb.from("bling_hub_entity_links_v2").select("bling_id,status").eq("source_system",job.source_system).eq("entity_type","product").eq("source_id",job.source_id).maybeSingle();
      if(link.error)throw link.error;
      if(!link.data||link.data.status!=="matched"||!Number(link.data.bling_id)){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"product_not_linked",p_error_message:"Product is not safely linked",p_http_status:null,p_retry_seconds:120,p_provider_id:null});summary.review_required++;continue;
      }
      const blingId=Number(link.data.bling_id);
      const before=await blingHubReadStock(sb,token,blingId,depositId);
      if(!before.ok){
        const st=before.status===429||before.status>=500?"retry":"review_required";
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:st,p_result:{},p_error_code:"stock_read_http_"+before.status,p_error_message:"Could not read stock",p_http_status:before.status,p_retry_seconds:120,p_provider_id:String(blingId)});summary[st]++;continue;
      }
      if(Number(before.stock)===target){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"synced",p_result:{bling_id:blingId,deposit_id:depositId,changed:false,stock:target,verified:true},p_error_code:null,p_error_message:null,p_http_status:200,p_retry_seconds:120,p_provider_id:String(blingId)});summary.synced++;continue;
      }
      const write=await blingHubPostStockOnce(sb,token,{deposito:{id:depositId},operacao:"B",produto:{id:blingId},quantidade:target,observacoes:"Dona Antônia · saldo operacional Vitrine · "+job.id});
      if(!write.ok){
        const st=write.status===429?"retry":"review_required";
        const code=write.status===0||write.status>=500?"stock_delivery_uncertain":"stock_post_http_"+write.status;
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:st,p_result:{target_stock:target,previous_stock:before.stock},p_error_code:code,p_error_message:write.error||"Stock update failed",p_http_status:write.status||null,p_retry_seconds:120,p_provider_id:String(blingId)});summary[st]++;continue;
      }
      const after=await blingHubReadStock(sb,token,blingId,depositId);
      if(!after.ok||Number(after.stock)!==target){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{write_ok:true,target_stock:target,observed_stock:after.stock},p_error_code:"stock_post_write_mismatch",p_error_message:"Stock write was not verified",p_http_status:after.status||200,p_retry_seconds:120,p_provider_id:String(blingId)});summary.review_required++;continue;
      }
      await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"synced",p_result:{bling_id:blingId,deposit_id:depositId,changed:true,previous_stock:before.stock,stock:target,verified:true},p_error_code:null,p_error_message:null,p_http_status:write.status,p_retry_seconds:120,p_provider_id:String(blingId)});summary.synced++;
    }catch(e){
      const msg=clean((e as Error)?.message||e,500);
      await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"retry",p_result:{},p_error_code:"worker_exception",p_error_message:msg,p_http_status:null,p_retry_seconds:120,p_provider_id:null});summary.retry++;
    }
  }
  return summary;
}
async function blingHubProcessProductJobs(sb:any,limitRaw:any){
  const worker="bling-hub-edge-"+crypto.randomUUID();
  const limit=Math.max(1,Math.min(10,Number(limitRaw||1)||1));
  const claim=await sb.rpc("claim_bling_hub_jobs_v2",{p_worker:worker,p_domains:["product"],p_limit:limit,p_lease_seconds:300});
  if(claim.error)throw claim.error;
  const jobs=claim.data||[];
  if(!jobs.length)return {ok:true,claimed:0,processed:0,synced:0,review_required:0,retry:0,failed:0};
  const token=await blingHubOauth(sb);
  const summary:any={ok:true,claimed:jobs.length,processed:0,synced:0,review_required:0,retry:0,failed:0};
  for(const job of jobs){
    summary.processed++;
    try{
      if(job.operation!=="sync_product"){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"unsupported_operation",p_error_message:"Unsupported product operation",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
        summary.review_required++;continue;
      }
      const local=job.payload?.product;
      if(!local||typeof local!=="object"){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"product_payload_missing",p_error_message:"Product payload missing",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
        summary.review_required++;continue;
      }
      const link=await sb.from("bling_hub_entity_links_v2").select("bling_id,status").eq("source_system",job.source_system).eq("entity_type","product").eq("source_id",job.source_id).maybeSingle();
      if(link.error)throw link.error;
      if(!link.data||link.data.status!=="matched"||!Number(link.data.bling_id)){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"product_not_linked",p_error_message:"Product is not safely linked to Bling",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
        summary.review_required++;continue;
      }
      const blingId=Number(link.data.bling_id);
      const before=await blingHubGet(sb,token,"/produtos/"+encodeURIComponent(String(blingId)));
      if(!before.ok){
        const status=before.status===429||before.status>=500?"retry":"review_required";
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:status,p_result:{},p_error_code:"product_read_http_"+before.status,p_error_message:"Could not read Bling product",p_http_status:before.status,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary[status]++;continue;
      }
      const current=before.data?.data||{};
      const desired=blingHubProductPayload(current,local);
      const changes=blingHubManagedProductDiff(current,desired);
      if(!Object.keys(changes).length){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"synced",p_result:{bling_id:blingId,changed:false,verified:true},p_error_code:null,p_error_message:null,p_http_status:200,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary.synced++;continue;
      }
      const write=await blingHubWriteIdempotent(sb,token,"/produtos/"+encodeURIComponent(String(blingId)),"PUT",desired);
      if(!write.ok){
        const status=write.status===429||write.status>=500||write.status===0?"retry":"review_required";
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:status,p_result:{changes},p_error_code:"product_put_http_"+write.status,p_error_message:write.error||"Bling product update failed",p_http_status:write.status||null,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary[status]++;continue;
      }
      const after=await blingHubGet(sb,token,"/produtos/"+encodeURIComponent(String(blingId)));
      if(!after.ok){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{changes,write_ok:true},p_error_code:"post_write_verify_failed",p_error_message:"Write succeeded but verification failed",p_http_status:after.status,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary.review_required++;continue;
      }
      const verifyPayload=blingHubProductPayload(after.data?.data||{},local);
      const remaining=blingHubManagedProductDiff(after.data?.data||{},verifyPayload);
      if(Object.keys(remaining).length){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{changes,remaining},p_error_code:"post_write_mismatch",p_error_message:"Bling product differs after update",p_http_status:200,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary.review_required++;continue;
      }
      await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"synced",p_result:{bling_id:blingId,changed:true,changes,verified:true},p_error_code:null,p_error_message:null,p_http_status:write.status,p_retry_seconds:120,p_provider_id:String(blingId)});
      summary.synced++;
    }catch(e){
      const msg=clean((e as Error)?.message||e,500);
      await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"retry",p_result:{},p_error_code:"worker_exception",p_error_message:msg,p_http_status:null,p_retry_seconds:120,p_provider_id:null});
      summary.retry++;
    }
  }
  return summary;
}
async function blingHubReconcileProductCatalogReadonly(sb:any,itemsRaw:any){
  const items=(Array.isArray(itemsRaw)?itemsRaw:[]).slice(0,3000);
  if(!items.length)return {ok:true,processed:0,summary:{},bling_catalog_count:0,exceptions:[]};
  const token=await blingHubOauth(sb);
  const catalog:any[]=[];
  for(let page=1;page<=100;page++){
    const q=new URLSearchParams({pagina:String(page),limite:"100"});
    const r=await blingHubGet(sb,token,"/produtos?"+q.toString());
    if(!r.ok)throw new Error("bling_catalog_http_"+r.status);
    const rows=Array.isArray(r.data?.data)?r.data.data:[];
    catalog.push(...rows);
    if(rows.length<100)break;
    if(page===100)throw new Error("bling_catalog_page_guard");
  }

  const gtinMap=new Map<string,Set<number>>();
  const skuMap=new Map<string,Set<number>>();
  const add=(map:Map<string,Set<number>>,key:string,id:number)=>{if(!key||!id)return;if(!map.has(key))map.set(key,new Set());map.get(key)!.add(id);};
  for(const p of catalog){
    const id=Number(p?.id||0);if(!id)continue;
    const sku=clean(p?.codigo,120);
    const gtins=[p?.gtin,p?.gtinEmbalagem].map((v:any)=>String(v??"").replace(/\D/g,"")).filter(Boolean);
    if(sku)add(skuMap,sku,id);
    for(const g of gtins)add(gtinMap,g,id);
  }

  const now=new Date().toISOString();
  const rows:any[]=[];
  const exceptions:any[]=[];
  const summary:any={matched:0,not_found:0,ambiguous:0,review_required:0};
  for(const raw of items){
    const sourceId=uuid(raw?.source_id);if(!sourceId)continue;
    const sku=clean(raw?.sku,120),gtin=String(raw?.gtin??"").replace(/\D/g,"").slice(0,32),name=clean(raw?.name,220);
    let status="not_found",blingId:number|null=null,method="",reason="",candidates:number[]=[];
    if(gtin){
      candidates=[...(gtinMap.get(gtin)||new Set<number>())];
      if(candidates.length===1){status="matched";blingId=candidates[0];method="gtin_exact";}
      else if(candidates.length>1){status="ambiguous";reason="multiple_exact_gtin";}
      else if(sku){
        const skuIds=[...(skuMap.get(sku)||new Set<number>())];
        if(skuIds.length===1){status="matched";blingId=skuIds[0];method="sku_exact_after_gtin_lookup";candidates=skuIds;}
        else if(skuIds.length>1){status="ambiguous";reason="multiple_exact_sku";candidates=skuIds;}
      }
    }else if(sku){
      candidates=[...(skuMap.get(sku)||new Set<number>())];
      if(candidates.length===1){status="matched";blingId=candidates[0];method="sku_exact_no_local_gtin";}
      else if(candidates.length>1){status="ambiguous";reason="multiple_exact_sku";}
    }else{status="review_required";reason="missing_gtin_and_sku";}
    summary[status]=(summary[status]||0)+1;
    if(status!=="matched"&&exceptions.length<200)exceptions.push({source_id:sourceId,name,sku:sku||null,gtin:gtin||null,status,reason:reason||null,candidate_ids:candidates.slice(0,5)});
    rows.push({
      source_system:"vitrine_qx",entity_type:"product",source_id:sourceId,bling_id:blingId,
      identity_kind:gtin?"gtin":(sku?"sku":null),identity_value:gtin||sku||null,status,last_verified_at:now,updated_at:now,
      metadata:{method:method||null,reason:reason||null,name,sku:sku||null,gtin:gtin||null,candidate_ids:candidates.slice(0,10),readonly:true,catalog_snapshot_at:now}
    });
  }

  for(let i=0;i<rows.length;i+=500){
    const up=await sb.from("bling_hub_entity_links_v2").upsert(rows.slice(i,i+500),{onConflict:"source_system,entity_type,source_id"});
    if(up.error)throw up.error;
  }
  await sb.from("bling_hub_audit_v2").insert({event_type:"product_catalog_reconcile_readonly",severity:summary.review_required||summary.ambiguous?"warning":"info",domain:"product",details:{processed:rows.length,bling_catalog_count:catalog.length,summary,external_write:false,make_used:false}});
  return {ok:true,processed:rows.length,bling_catalog_count:catalog.length,summary,exceptions,external_write:false};
}
async function blingHubReconcileProductsReadonly(sb:any,itemsRaw:any){
  const items=(Array.isArray(itemsRaw)?itemsRaw:[]).slice(0,25);
  if(!items.length)return {ok:true,processed:0,results:[]};
  const token=await blingHubOauth(sb);
  const results:any[]=[];
  for(const raw of items){
    const sourceId=uuid(raw?.source_id);
    const sku=clean(raw?.sku,120);
    const gtin=String(raw?.gtin??"").replace(/\D/g,"").slice(0,32);
    const name=clean(raw?.name,220);
    if(!sourceId){results.push({source_id:null,status:"review_required",reason:"invalid_source_id"});continue;}
    let status="not_found",blingId:number|null=null,method="",reason="";
    try{
      if(gtin){
        const q=new URLSearchParams({pagina:"1",limite:"20"});
        q.append("gtins[]",gtin);
        const r=await blingHubGet(sb,token,"/produtos?"+q.toString());
        if(!r.ok){
          status="review_required";reason="bling_lookup_http_"+r.status;
        }else{
          const rows=Array.isArray(r.data?.data)?r.data.data:[];
          const exact=rows.filter((p:any)=>[p?.gtin,p?.gtinEmbalagem].map((v:any)=>String(v??"").replace(/\D/g,"")).includes(gtin));
          if(exact.length===1){status="matched";blingId=Number(exact[0]?.id||0)||null;method="gtin_exact";}
          else if(exact.length>1){status="ambiguous";reason="multiple_exact_gtin";}
          else if(rows.length===1){status="matched";blingId=Number(rows[0]?.id||0)||null;method="gtin_single_result";}
        }
      }
      if(!blingId&&status==="not_found"&&sku){
        const h=await sb.from("bling_history_staging_items").select("bling_product_id").eq("sku",sku).not("bling_product_id","is",null).limit(20);
        if(h.error)throw h.error;
        const ids=[...new Set((h.data||[]).map((x:any)=>Number(x.bling_product_id)).filter((x:number)=>x>0))];
        if(ids.length===1){
          const detail=await blingHubGet(sb,token,"/produtos/"+encodeURIComponent(String(ids[0])));
          if(detail.ok){
            const p=detail.data?.data||{};
            const remoteSku=clean(p?.codigo,120);
            const remoteGtins=[p?.gtin,p?.gtinEmbalagem].map((v:any)=>String(v??"").replace(/\D/g,"")).filter(Boolean);
            if((gtin&&remoteGtins.includes(gtin))||(!gtin&&remoteSku===sku)){status="matched";blingId=ids[0];method=gtin?"history_sku_gtin_verified":"history_sku_verified";}
            else{status="review_required";reason="history_sku_mismatch";}
          }else{status="review_required";reason="history_product_verify_http_"+detail.status;}
        }else if(ids.length>1){status="ambiguous";reason="multiple_history_sku";}
      }
      const now=new Date().toISOString();
      const up=await sb.from("bling_hub_entity_links_v2").upsert({
        source_system:"vitrine_qx",entity_type:"product",source_id:sourceId,bling_id:blingId,
        identity_kind:gtin?"gtin":(sku?"sku":null),identity_value:gtin||sku||null,status,last_verified_at:now,
        metadata:{method:method||null,reason:reason||null,name,sku:sku||null,gtin:gtin||null,readonly:true},updated_at:now
      },{onConflict:"source_system,entity_type,source_id"});
      if(up.error)throw up.error;
      results.push({source_id:sourceId,status,bling_id:blingId,method:method||null,reason:reason||null});
    }catch(e){
      const msg=clean((e as Error)?.message||e,240);
      results.push({source_id:sourceId,status:"review_required",bling_id:null,reason:msg});
    }
  }
  const summary=results.reduce((a:any,r:any)=>{a[r.status]=(a[r.status]||0)+1;return a;},{});
  await sb.from("bling_hub_audit_v2").insert({event_type:"product_reconcile_readonly",severity:summary.review_required||summary.ambiguous?"warning":"info",domain:"product",details:{processed:results.length,summary,external_write:false,make_used:false}});
  return {ok:true,processed:results.length,summary,results,external_write:false};
}
async function blingHubProbeReadonly(sb:any){
  const runtime=await sb.from("bling_hub_runtime_v2").select("mode,legacy_queues_frozen").eq("id",1).maybeSingle();
  if(runtime.error||!runtime.data)throw new Error("runtime_unavailable");
  if(!["observe","homologation","live"].includes(String(runtime.data.mode)))throw new Error("hub_off");
  const now0=new Date().toISOString();
  await sb.from("bling_hub_runtime_v2").update({last_readonly_check_at:now0,last_readonly_error:null,updated_at:now0}).eq("id",1);
  const token=await blingHubOauth(sb);
  const probes=[
    {key:"products",path:"/produtos?pagina=1&limite=1"},
    {key:"contacts",path:"/contatos?pagina=1&limite=1"},
    {key:"sales_orders",path:"/pedidos/vendas?pagina=1&limite=1"},
    {key:"deposits",path:"/depositos?pagina=1&limite=100&situacao=1"},
    {key:"invoice",path:"/nfe?pagina=1&limite=1"}
  ];
  const results:any={};let allCore=true;let deposits:any[]=[];
  for(const probe of probes){
    const r=await blingHubGet(sb,token,probe.path);
    results[probe.key]={ok:r.ok,http_status:r.status,insufficient_scope:r.status===403};
    if(["products","contacts","sales_orders","deposits"].includes(probe.key)&&!r.ok)allCore=false;
    if(probe.key==="deposits"&&r.ok){
      const rows=Array.isArray(r.data?.data)?r.data.data:[];
      deposits=rows.slice(0,20).map((d:any)=>({id:Number(d?.id||0)||null,name:clean(d?.descricao||d?.nome,120)||null,default:d?.padrao===true||d?.padrao===1||d?.padrao==="true"})).filter((d:any)=>d.id);
    }
  }
  const now=new Date().toISOString();
  await sb.from("bling_hub_runtime_v2").update({
    last_readonly_ok_at:allCore?now:null,last_readonly_error:allCore?null:"one_or_more_core_probes_failed",
    metadata:{readonly_probe_version:1,probes:results,deposit_candidates:deposits,probed_at:now},updated_at:now
  }).eq("id",1);
  await sb.from("bling_hub_audit_v2").insert({event_type:"readonly_probe",severity:allCore?"info":"warning",details:{probes:results,deposit_candidates:deposits,external_write:false,make_used:false}});
  const readiness=await blingHubReadinessExtended(sb);
  return {ok:allCore,readonly:true,external_write:false,probes:results,deposit_candidates:deposits,readiness};
}

async function vitrineHistoryAuthorized(sb:any,req:Request){
  const supplied=clean(req.headers.get("x-vitrine-history-key"),200);
  if(!supplied)return false;
  const q=await sb.from("internal_integration_secrets").select("secret_value")
    .eq("integration_key","vitrine_history_bridge").maybeSingle();
  if(q.error||!q.data?.secret_value)return false;
  const a=new TextEncoder().encode(supplied),b=new TextEncoder().encode(String(q.data.secret_value));
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
function vitrineMoneyCents(v:any){const n=Number(v||0);return Number.isFinite(n)?Math.round(n*100):0}
async function vitrineCustomerHistory(sb:any,body:any){
  const customerId=uuid(body?.id);
  if(!customerId)return {ok:false,error:"invalid_customer",status:400};
  const limit=Math.max(1,Math.min(50,Number(body?.limit||20)||20));
  const offset=Math.max(0,Math.min(5000,Number(body?.offset||0)||0));

  const [customer,summary,history,topProducts]=await Promise.all([
    vitrineGetCustomer(sb,customerId),
    sb.from("customer_purchase_summary_v1").select("*").eq("customer_id",customerId).maybeSingle(),
    sb.rpc("get_customer_purchase_history_v1",{p_customer_id:customerId,p_limit:limit,p_offset:offset}),
    sb.rpc("get_customer_top_products_v1",{p_customer_id:customerId,p_limit:12})
  ]);
  if(!customer)return {ok:false,error:"customer_not_found",status:404};
  if(summary.error)throw summary.error;
  if(history.error)throw history.error;
  if(topProducts.error)throw topProducts.error;

  const sum=summary.data||{};
  const orders=(history.data||[]).map((o:any)=>({
    order_id:o.order_id,
    order_number:o.order_number,
    status:o.status,
    source:o.source,
    total_cents:vitrineMoneyCents(o.total),
    payment_method:o.payment_method||"",
    basket_id:o.basket_id||null,
    basket_name:o.basket_name||"",
    created_at:o.created_at,
    confirmed_at:o.confirmed_at,
    delivered_at:o.delivered_at,
    item_count:Number(o.item_count||0),
    counts_as_purchase:Boolean(o.counts_as_purchase)
  }));
  const products=(topProducts.data||[]).map((p:any)=>({
    product_id:p.product_id,
    name:p.name||"",
    sku:p.sku||"",
    gtin:p.gtin||"",
    purchase_count:Number(p.purchase_count||0),
    total_quantity:Number(p.total_quantity||0),
    total_spent_cents:vitrineMoneyCents(p.total_spent),
    first_purchase_at:p.first_purchase_at,
    last_purchase_at:p.last_purchase_at
  }));

  return {
    ok:true,
    customer,
    summary:{
      order_count:Number(sum.order_count||0),
      lifetime_value_cents:vitrineMoneyCents(sum.lifetime_value),
      average_ticket_cents:vitrineMoneyCents(sum.average_ticket),
      first_order_at:sum.first_order_at||null,
      last_order_at:sum.last_order_at||null,
      distinct_product_count:Number(sum.distinct_product_count||0),
      last_order_id:sum.last_order_id||null,
      last_order_number:sum.last_order_number||null,
      last_order_status:sum.last_order_status||null,
      last_basket_name:sum.last_basket_name||"",
      last_payment_method:sum.last_payment_method||""
    },
    orders,
    top_products:products,
    pagination:{limit,offset,next_offset:orders.length===limit?offset+limit:null}
  };
}
async function vitrineCustomerOrderDetail(sb:any,body:any){
  const customerId=uuid(body?.customer_id);
  const orderId=uuid(body?.order_id);
  if(!customerId||!orderId)return {ok:false,error:"invalid_order",status:400};
  const r=await sb.rpc("get_customer_order_detail_v1",{p_customer_id:customerId,p_order_id:orderId});
  if(r.error)throw r.error;
  const data=r.data||{};
  if(!data?.order?.id)return {ok:false,error:"order_not_found",status:404};
  const o=data.order;
  return {
    ok:true,
    order:{
      id:o.id,
      order_number:o.order_number,
      status:o.status,
      source:o.source,
      total_cents:vitrineMoneyCents(o.total),
      subtotal_cents:vitrineMoneyCents(o.subtotal),
      discount_cents:vitrineMoneyCents(o.discount),
      other_expenses_cents:vitrineMoneyCents(o.other_expenses),
      payment_method:o.payment_method||"",
      basket_id:o.basket_id||null,
      basket_name:o.basket_name||"",
      delivery_address:o.delivery_address||{},
      customer_snapshot:o.customer_snapshot||{},
      checkout_snapshot:o.checkout_snapshot||{},
      created_at:o.created_at,
      confirmed_at:o.confirmed_at,
      delivered_at:o.delivered_at,
      cancelled_at:o.cancelled_at,
      returned_at:o.returned_at,
      counts_as_purchase:Boolean(o.counts_as_purchase)
    },
    items:(data.items||[]).map((i:any)=>({
      id:i.id,
      product_id:i.product_id||null,
      sku:i.sku||"",
      name:i.name||"",
      quantity:Number(i.quantity||0),
      unit_price_cents:vitrineMoneyCents(i.unit_price),
      line_total_cents:vitrineMoneyCents(i.line_total),
      metadata:i.metadata||{}
    }))
  };
}

async function blingHubCustomerSnapshot(sb:any,customerId:string){
  const customer=await sb.from("customers")
    .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,bling_contact_id,updated_at")
    .eq("id",customerId).maybeSingle();
  if(customer.error)throw customer.error;
  if(!customer.data)return null;
  const [email,address]=await Promise.all([
    sb.from("customer_emails").select("email").eq("customer_id",customerId).eq("is_primary",true).order("updated_at",{ascending:false}).limit(1).maybeSingle(),
    sb.from("customer_addresses").select("street,number,complement,neighborhood,city,state,postal_code,reference")
      .eq("customer_id",customerId).eq("is_active",true).eq("is_default",true).order("updated_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  if(email.error)throw email.error;
  if(address.error)throw address.error;
  return {...customer.data,email:email.data?.email||"",address:address.data||null};
}
function blingHubCustomerPayload(current:any,local:any){
  const payload:any={};
  const preserve=[
    "codigo","tipoContato","fantasia","indicadorIe","ie","rg","orgaoEmissor","contribuinte","sexo",
    "dataNascimento","naturalidade","limiteCredito","pais","vendedor","dadosAdicionais",
    "nome","numeroDocumento","tipo","situacao","fone","celular","email","emailNotaFiscal","endereco"
  ];
  for(const key of preserve){
    if(current?.[key]!==undefined&&current?.[key]!==null)payload[key]=structuredClone(current[key]);
  }

  const name=clean(local?.name,220);if(name)payload.nome=name;
  const doc=blingHubDigits(local?.cpf_cnpj);
  if(doc){payload.numeroDocumento=doc;payload.tipo=doc.length===14?"J":"F";}
  payload.situacao=local?.is_active===false?"I":"A";
  const phone=blingHubDigits(local?.primary_whatsapp_e164);
  if(phone)payload.celular=phone;
  const email=clean(local?.email,220);
  if(email){payload.email=email;payload.emailNotaFiscal=email;}

  const a=local?.address&&typeof local.address==="object"?local.address:null;
  if(a){
    const geral:any={};
    if(clean(a.street,180))geral.endereco=clean(a.street,180);
    if(clean(a.number,40))geral.numero=clean(a.number,40);
    if(clean(a.complement,140)||clean(a.reference,220))geral.complemento=clean([a.complement,a.reference].filter(Boolean).join(" · "),220);
    if(clean(a.neighborhood,140))geral.bairro=clean(a.neighborhood,140);
    if(clean(a.city,120))geral.municipio=clean(a.city,120);
    if(clean(a.state,2))geral.uf=clean(a.state,2).toUpperCase();
    const cep=blingHubDigits(a.postal_code);if(cep)geral.cep=cep;
    if(Object.keys(geral).length)payload.endereco={...(payload.endereco||{}),geral:{...(payload.endereco?.geral||{}),...geral}};
  }
  return payload;
}
function blingHubManagedCustomerDiff(current:any,payload:any){
  const keys=["nome","numeroDocumento","tipo","situacao","celular","email","emailNotaFiscal"];
  const diff:any={};
  for(const key of keys){
    const a=current?.[key]??null,b=payload?.[key]??null;
    if(JSON.stringify(a)!==JSON.stringify(b))diff[key]={from:a,to:b};
  }
  const curAddr=current?.endereco?.geral||{},newAddr=payload?.endereco?.geral||{};
  for(const key of ["endereco","numero","complemento","bairro","municipio","uf","cep"]){
    const a=curAddr?.[key]??null,b=newAddr?.[key]??null;
    if(JSON.stringify(a)!==JSON.stringify(b))diff["endereco."+key]={from:a,to:b};
  }
  return diff;
}
async function blingHubFindContactByDocument(sb:any,token:string,docRaw:any){
  const doc=blingHubDigits(docRaw);
  if(![11,14].includes(doc.length))return {status:"review_required",reason:"document_required",bling_id:null,candidates:[]};
  const q=new URLSearchParams({pagina:"1",limite:"20",numeroDocumento:doc,criterio:"1"});
  const r=await blingHubGet(sb,token,"/contatos?"+q.toString());
  if(!r.ok)return {status:"review_required",reason:"contact_lookup_http_"+r.status,bling_id:null,candidates:[]};
  const rows=Array.isArray(r.data?.data)?r.data.data:[];
  if(!rows.length)return {status:"not_found",reason:"document_not_found",bling_id:null,candidates:[]};
  const exact:number[]=[];
  for(const row of rows.slice(0,10)){
    const id=Number(row?.id||0);if(!id)continue;
    const detail=await blingHubGet(sb,token,"/contatos/"+encodeURIComponent(String(id)));
    if(detail.ok&&blingHubDigits(detail.data?.data?.numeroDocumento)===doc)exact.push(id);
  }
  const ids=[...new Set(exact)];
  if(ids.length===1)return {status:"matched",reason:"cpf_cnpj_exact",bling_id:ids[0],candidates:ids};
  if(ids.length>1)return {status:"ambiguous",reason:"duplicate_document",bling_id:null,candidates:ids};
  return {status:"not_found",reason:"document_not_found",bling_id:null,candidates:[]};
}
async function blingHubReconcileCustomersReadonly(sb:any,limitRaw:any=650){
  const limit=Math.max(1,Math.min(1000,Number(limitRaw||650)||650));
  const rows=await sb.from("customers")
    .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,bling_contact_id,updated_at")
    .order("updated_at",{ascending:false}).limit(limit);
  if(rows.error)throw rows.error;
  const customers=rows.data||[];
  if(!customers.length)return {ok:true,processed:0,summary:{},exceptions:[],external_write:false};

  const token=await blingHubOauth(sb);
  const now=new Date().toISOString();
  const summary:any={matched:0,not_found:0,ambiguous:0,review_required:0};
  const exceptions:any[]=[];
  for(const c of customers){
    let status="review_required",reason="",blingId=Number(c.bling_contact_id||0)||null,method="";
    let candidates:number[]=[];
    if(blingId){
      const detail=await blingHubGet(sb,token,"/contatos/"+encodeURIComponent(String(blingId)));
      if(detail.ok){status="matched";method="existing_bling_contact_id";reason="";}
      else{status="review_required";reason="existing_bling_contact_http_"+detail.status;blingId=null;}
    }else{
      const found=await blingHubFindContactByDocument(sb,token,c.cpf_cnpj);
      status=found.status;reason=found.reason;blingId=found.bling_id;candidates=found.candidates;
      if(status==="matched"&&blingId){
        method="cpf_cnpj_exact";
        const bind=await sb.from("customers").update({bling_contact_id:blingId,last_bling_sync_at:now,updated_at:c.updated_at}).eq("id",c.id).is("bling_contact_id",null);
        if(bind.error)throw bind.error;
      }
    }
    summary[status]=(summary[status]||0)+1;
    if(status!=="matched"&&exceptions.length<200)exceptions.push({source_id:c.id,name:c.name||"",document:blingHubDigits(c.cpf_cnpj)||null,status,reason,candidate_ids:candidates.slice(0,5)});
    const up=await sb.from("bling_hub_entity_links_v2").upsert({
      source_system:"canonical_ssbes",entity_type:"customer",source_id:c.id,bling_id:blingId,
      identity_kind:blingHubDigits(c.cpf_cnpj)?"cpf_cnpj":null,identity_value:blingHubDigits(c.cpf_cnpj)||null,
      status,last_verified_at:now,updated_at:now,
      metadata:{method:method||null,reason:reason||null,name:c.name||"",candidate_ids:candidates.slice(0,10),readonly:true}
    },{onConflict:"source_system,entity_type,source_id"});
    if(up.error)throw up.error;
  }
  await sb.from("bling_hub_audit_v2").insert({event_type:"customer_reconcile_readonly",severity:summary.ambiguous||summary.review_required?"warning":"info",domain:"customer",details:{processed:customers.length,summary,external_write:false,make_used:false}});
  return {ok:true,processed:customers.length,summary,exceptions,external_write:false};
}
async function blingHubPreviewCustomerSync(sb:any,customerIdRaw:any){
  const customerId=uuid(customerIdRaw);if(!customerId)return {ok:false,error:"invalid_customer"};
  const local=await blingHubCustomerSnapshot(sb,customerId);
  if(!local)return {ok:false,error:"customer_not_found"};
  let blingId=Number(local.bling_contact_id||0)||null;
  if(!blingId){
    const link=await sb.from("bling_hub_entity_links_v2").select("bling_id,status").eq("source_system","canonical_ssbes").eq("entity_type","customer").eq("source_id",customerId).maybeSingle();
    if(link.error)throw link.error;
    if(link.data?.status==="matched")blingId=Number(link.data.bling_id||0)||null;
  }
  if(!blingId)return {ok:false,error:"customer_not_linked"};
  const token=await blingHubOauth(sb);
  const detail=await blingHubGet(sb,token,"/contatos/"+encodeURIComponent(String(blingId)));
  if(!detail.ok)return {ok:false,error:"bling_contact_http_"+detail.status};
  const current=detail.data?.data||{};
  const payload=blingHubCustomerPayload(current,local);
  const changes=blingHubManagedCustomerDiff(current,payload);
  const current_shape=Object.fromEntries(Object.entries(current).map(([k,v])=>[k,Array.isArray(v)?"array":(v===null?"null":typeof v)]));
  return {
    ok:true,readonly:true,external_write:false,source_id:customerId,bling_id:blingId,
    change_count:Object.keys(changes).length,changes,
    current_shape,
    desired_keys:Object.keys(payload).sort()
  };
}
async function blingHubProcessCustomerJobs(sb:any,limitRaw:any){
  const worker="bling-customer-edge-"+crypto.randomUUID();
  const limit=Math.max(1,Math.min(10,Number(limitRaw||1)||1));
  const claim=await sb.rpc("claim_bling_hub_jobs_v2",{p_worker:worker,p_domains:["customer"],p_limit:limit,p_lease_seconds:300});
  if(claim.error)throw claim.error;
  const jobs=claim.data||[];
  const summary:any={ok:true,claimed:jobs.length,processed:0,synced:0,review_required:0,retry:0,failed:0};
  if(!jobs.length)return summary;
  const token=await blingHubOauth(sb);

  for(const job of jobs){
    summary.processed++;
    try{
      if(job.operation!=="sync_customer"){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"unsupported_operation",p_error_message:"Unsupported customer operation",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
        summary.review_required++;continue;
      }
      const local=await blingHubCustomerSnapshot(sb,job.source_id);
      if(!local){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"customer_not_found",p_error_message:"Customer no longer exists",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
        summary.review_required++;continue;
      }
      const blingId=Number(local.bling_contact_id||0);
      if(!blingId){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"customer_not_linked",p_error_message:"Customer is not safely linked to Bling",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
        summary.review_required++;continue;
      }
      const before=await blingHubGet(sb,token,"/contatos/"+encodeURIComponent(String(blingId)));
      if(!before.ok){
        const status=before.status===429||before.status>=500?"retry":"review_required";
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:status,p_result:{},p_error_code:"contact_read_http_"+before.status,p_error_message:"Could not read Bling contact",p_http_status:before.status,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary[status]++;continue;
      }
      const current=before.data?.data||{};
      const desired=blingHubCustomerPayload(current,local);
      const changes=blingHubManagedCustomerDiff(current,desired);
      if(!Object.keys(changes).length){
        await sb.from("customers").update({last_bling_sync_at:new Date().toISOString()}).eq("id",local.id);
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"synced",p_result:{bling_id:blingId,changed:false,verified:true},p_error_code:null,p_error_message:null,p_http_status:200,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary.synced++;continue;
      }
      const write=await blingHubWriteIdempotent(sb,token,"/contatos/"+encodeURIComponent(String(blingId)),"PUT",desired);
      if(!write.ok){
        const status=write.status===429||write.status>=500||write.status===0?"retry":"review_required";
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:status,p_result:{changes,provider_details:write.provider_details||[]},p_error_code:"contact_put_http_"+write.status,p_error_message:write.error||"Bling contact update failed",p_http_status:write.status||null,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary[status]++;continue;
      }
      const after=await blingHubGet(sb,token,"/contatos/"+encodeURIComponent(String(blingId)));
      if(!after.ok){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{changes,write_ok:true},p_error_code:"post_write_verify_failed",p_error_message:"Contact write succeeded but verification failed",p_http_status:after.status,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary.review_required++;continue;
      }
      const verifyPayload=blingHubCustomerPayload(after.data?.data||{},local);
      const remaining=blingHubManagedCustomerDiff(after.data?.data||{},verifyPayload);
      if(Object.keys(remaining).length){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{changes,remaining},p_error_code:"post_write_mismatch",p_error_message:"Bling contact differs after update",p_http_status:200,p_retry_seconds:120,p_provider_id:String(blingId)});
        summary.review_required++;continue;
      }
      await sb.from("customers").update({last_bling_sync_at:new Date().toISOString()}).eq("id",local.id);
      await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"synced",p_result:{bling_id:blingId,changed:true,changes,verified:true},p_error_code:null,p_error_message:null,p_http_status:write.status,p_retry_seconds:120,p_provider_id:String(blingId)});
      summary.synced++;
    }catch(e){
      const msg=clean((e as Error)?.message||e,500);
      await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"retry",p_result:{},p_error_code:"worker_exception",p_error_message:msg,p_http_status:null,p_retry_seconds:120,p_provider_id:null});
      summary.retry++;
    }
  }
  return summary;
}

async function vitrineSaveCustomer(sb:any,body:any){
  const id=uuid(body?.id);
  const name=clean(body?.display_name,180);
  if(!name)return {ok:false,error:"name_required",status:400};
  const phone=vitrinePhone(body?.phone);
  const cpf=vitrineDigits(body?.cpf,14);
  const email=clean(body?.email,180).toLowerCase();
  const birthdayDay=vitrineDay(body?.birthday_day);
  const birthdayMonth=vitrineMonth(body?.birthday_month);
  const isActive=!["inactive","blocked"].includes(clean(body?.status,20));

  if(phone){
    const r=await sb.from("customers").select("id").eq("primary_whatsapp_e164",phone).maybeSingle();
    if(r.error)throw r.error;
    if(r.data&&r.data.id!==id)return {ok:false,error:"phone_already_in_use",status:409};
  }
  if(cpf){
    const r=await sb.from("customers").select("id").eq("cpf_cnpj",cpf).maybeSingle();
    if(r.error)throw r.error;
    if(r.data&&r.data.id!==id)return {ok:false,error:"cpf_already_in_use",status:409};
  }

  let customerId=id;
  const mainRow:any={
    name,cpf_cnpj:cpf||null,primary_whatsapp_e164:phone||null,is_active:isActive,
    birthday_day:birthdayDay,birthday_month:birthdayMonth,updated_at:new Date().toISOString()
  };
  if(id){
    const r=await sb.from("customers").update(mainRow).eq("id",id).select("id").maybeSingle();
    if(r.error)throw r.error;
    if(!r.data)return {ok:false,error:"customer_not_found",status:404};
  }else{
    const r=await sb.from("customers").insert(mainRow).select("id").single();
    if(r.error)throw r.error;
    customerId=r.data.id;
  }

  const currentPhones=await sb.from("customer_phones").select("id,phone_e164").eq("customer_id",customerId).eq("is_primary",true).limit(1);
  if(currentPhones.error)throw currentPhones.error;
  if(phone){
    const existing=await sb.from("customer_phones").select("id,customer_id").eq("phone_e164",phone).maybeSingle();
    if(existing.error)throw existing.error;
    if(existing.data&&existing.data.customer_id!==customerId)return {ok:false,error:"phone_already_in_use",status:409};
    const clear=await sb.from("customer_phones").update({is_primary:false}).eq("customer_id",customerId);
    if(clear.error)throw clear.error;
    if(existing.data){
      const up=await sb.from("customer_phones").update({is_primary:true,source:"vitrine_admin"}).eq("id",existing.data.id);
      if(up.error)throw up.error;
    }else{
      const ins=await sb.from("customer_phones").insert({customer_id:customerId,phone_e164:phone,source:"vitrine_admin",is_primary:true});
      if(ins.error)throw ins.error;
    }
  }else if((currentPhones.data||[]).length){
    const clear=await sb.from("customer_phones").update({is_primary:false}).eq("customer_id",customerId);
    if(clear.error)throw clear.error;
  }

  const currentEmail=await sb.from("customer_emails").select("id")
    .eq("customer_id",customerId).order("is_primary",{ascending:false}).order("created_at",{ascending:false}).limit(1);
  if(currentEmail.error)throw currentEmail.error;
  const emailId=currentEmail.data?.[0]?.id||null;
  if(email){
    const emailRow:any={email,email_normalized:email,is_primary:true,source:"vitrine_admin",updated_at:new Date().toISOString()};
    if(emailId){
      const up=await sb.from("customer_emails").update(emailRow).eq("id",emailId);
      if(up.error)throw up.error;
    }else{
      const ins=await sb.from("customer_emails").insert({customer_id:customerId,...emailRow});
      if(ins.error)throw ins.error;
    }
  }else if(emailId){
    const up=await sb.from("customer_emails").update({is_primary:false,updated_at:new Date().toISOString()}).eq("id",emailId);
    if(up.error)throw up.error;
  }

  const a=obj(body?.address);
  const hasAddress=[a.street,a.number,a.district,a.city,a.postal_code,a.raw_text].some(Boolean);
  const currentAddress=await sb.from("customer_addresses").select("id")
    .eq("customer_id",customerId).eq("is_default",true).eq("is_active",true)
    .order("updated_at",{ascending:false}).limit(1);
  if(currentAddress.error)throw currentAddress.error;
  const addressId=currentAddress.data?.[0]?.id||null;
  if(hasAddress){
    const addressRow:any={
      customer_id:customerId,label:"Entrega",street:clean(a.street,180)||null,number:clean(a.number,40)||null,
      complement:clean(a.complement,140)||null,neighborhood:clean(a.district,140)||null,
      city:clean(a.city,120)||"Cuiabá",state:clean(a.state,2)||"MT",postal_code:clean(a.postal_code,20)||null,
      reference:clean(a.raw_text,400)||null,is_default:true,is_active:true,updated_at:new Date().toISOString()
    };
    if(addressId){
      const up=await sb.from("customer_addresses").update(addressRow).eq("id",addressId);
      if(up.error)throw up.error;
    }else{
      const ins=await sb.from("customer_addresses").insert(addressRow);
      if(ins.error)throw ins.error;
    }
  }

  const savedCustomer=await vitrineGetCustomer(sb,customerId);
  try{
    const snapshot=await blingHubCustomerSnapshot(sb,customerId);
    const q=await sb.rpc("enqueue_bling_hub_job_v2",{
      p_domain:"customer",p_operation:"sync_customer",p_source_system:"canonical_ssbes",p_source_id:customerId,
      p_idempotency_key:"canonical_ssbes:customer:"+customerId+":"+String(snapshot?.updated_at||new Date().toISOString()),
      p_payload:{customer_id:customerId},p_payload_version:1
    });
    if(q.error)throw q.error;
  }catch(e){
    console.error("bling_customer_enqueue_failed",clean((e as Error)?.message||e,300));
  }
  return {ok:true,customer_id:customerId,customer:savedCustomer};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method==="GET")return Response.redirect("https://donaantonia.com.br/admin/commerce-os/",302);
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return json({ok:false,error:"server_config"},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action||"dashboard",60).toLowerCase();

  if(action==="vitrine_product_extra"){
    const id=uuid(body?.id);
    if(!id)return json({ok:false,error:"invalid_product"},400);
    try{
      const r=await sb.from("products")
        .select("id,validity_date,brand,packaging")
        .eq("id",id)
        .maybeSingle();
      if(r.error)throw r.error;
      if(!r.data)return json({ok:true,product:null});
      return json({ok:true,product:{
        id:r.data.id,
        validity_date:r.data.validity_date??null,
        brand:r.data.brand??null,
        packaging:r.data.packaging??null
      }});
    }catch(e){
      return json({ok:false,error:"product_extra_unavailable",detail:clean((e as Error)?.message,300)},500);
    }
  }

  if(action==="vitrine_bling_hub_internal"){
    if(!(await blingHubAuthorized(sb,req)))return json({ok:false,error:"unauthorized"},401);
    const subaction=clean(body?.subaction||"readiness",60).toLowerCase();
    try{
      if(subaction==="readiness"){
        return json({ok:true,readiness:await blingHubReadinessExtended(sb)});
      }
      if(subaction==="probe_readonly"){
        const result=await blingHubProbeReadonly(sb);
        return json(result,result.ok?200:207);
      }
      if(subaction==="reconcile_products_readonly"){
        const result=await blingHubReconcileProductsReadonly(sb,body?.items);
        return json(result,200);
      }
      if(subaction==="reconcile_product_catalog_readonly"){
        const result=await blingHubReconcileProductCatalogReadonly(sb,body?.items);
        return json(result,200);
      }
      if(subaction==="preview_product_sync"){
        const result=await blingHubPreviewProductSync(sb,body);
        return json(result,result.ok?200:409);
      }
      if(subaction==="process_product_jobs"){
        const result=await blingHubProcessProductJobs(sb,body?.limit);
        return json(result,200);
      }
      if(subaction==="reconcile_customers_readonly"){
        const result=await blingHubReconcileCustomersReadonly(sb,body?.limit);
        return json(result,200);
      }
      if(subaction==="preview_customer_sync"){
        const result=await blingHubPreviewCustomerSync(sb,body?.customer_id);
        return json(result,result.ok?200:409);
      }
      if(subaction==="process_customer_jobs"){
        const result=await blingHubProcessCustomerJobs(sb,body?.limit);
        return json(result,200);
      }
      if(subaction==="preview_stock_sync"){
        const result=await blingHubPreviewStockSync(sb,body);
        return json(result,result.ok?200:409);
      }
      if(subaction==="process_stock_jobs"){
        const result=await blingHubProcessStockJobs(sb,body?.limit);
        return json(result,200);
      }
      if(subaction==="enqueue_job"){
        const domain=clean(body?.domain,40),operation=clean(body?.operation,80),sourceId=clean(body?.source_id,160),key=clean(body?.idempotency_key,240);
        const allowedDomains=new Set(["product","stock","customer","order","fiscal"]);
        const allowedOperations=new Set(["sync_product","set_stock","sync_customer","sync_order","sync_order_status","prepare_fiscal"]);
        if(!allowedDomains.has(domain)||!allowedOperations.has(operation)||!sourceId||!key)return json({ok:false,error:"invalid_job"},400);
        const q=await sb.rpc("enqueue_bling_hub_job_v2",{
          p_domain:domain,p_operation:operation,p_source_system:"vitrine_qx",p_source_id:sourceId,
          p_idempotency_key:key,p_payload:obj(body?.payload),p_payload_version:1
        });
        if(q.error)throw q.error;
        return json({ok:true,job_id:q.data,queued:true,external_write:false});
      }
      if(subaction==="enqueue_jobs"){
        const jobs=(Array.isArray(body?.jobs)?body.jobs:[]).slice(0,250);
        if(!jobs.length)return json({ok:true,queued:0,job_ids:[],external_write:false});
        const allowedDomains=new Set(["product","stock","customer","order","fiscal"]);
        const allowedOperations=new Set(["sync_product","set_stock","sync_customer","sync_order","sync_order_status","prepare_fiscal"]);
        const ids:any[]=[];
        for(const job of jobs){
          const domain=clean(job?.domain,40),operation=clean(job?.operation,80),sourceId=clean(job?.source_id,160),key=clean(job?.idempotency_key,240);
          if(!allowedDomains.has(domain)||!allowedOperations.has(operation)||!sourceId||!key)return json({ok:false,error:"invalid_job_batch"},400);
          const q=await sb.rpc("enqueue_bling_hub_job_v2",{
            p_domain:domain,p_operation:operation,p_source_system:"vitrine_qx",p_source_id:sourceId,
            p_idempotency_key:key,p_payload:obj(job?.payload),p_payload_version:1
          });
          if(q.error)throw q.error;
          ids.push(q.data);
        }
        return json({ok:true,queued:ids.length,job_ids:ids,external_write:false});
      }
      return json({ok:false,error:"writes_disabled",mode:"observe"},409);
    }catch(e){
      const message=clean((e as Error)?.message||e,300);
      await sb.from("bling_hub_runtime_v2").update({last_readonly_error:message,updated_at:new Date().toISOString()}).eq("id",1);
      return json({ok:false,error:message,readonly:true,external_write:false},502);
    }
  }

  if(action==="vitrine_history_ingest"){
    if(!(await vitrineHistoryAuthorized(sb,req)))return json({ok:false,error:"unauthorized"},401);
    const payload=body?.payload;
    if(!payload||typeof payload!=="object"||Array.isArray(payload))return json({ok:false,error:"payload_required"},400);
    try{
      const result=await sb.rpc("ingest_vitrine_order_history_v1",{p_payload:payload});
      if(result.error)return json({ok:false,error:"ingest_failed",detail:clean(result.error.message,400)},500);
      return json(result.data||{ok:false,error:"ingest_failed"},result.data?.ok===true?200:400);
    }catch(e){
      return json({ok:false,error:"ingest_failed",detail:clean((e as Error)?.message,400)},500);
    }
  }

  if(action==="vitrine_customer_lookup_phone"){
    const suffix=vitrineDigits(body?.phone_suffix,8).slice(-8);
    if(suffix.length!==8)return json({ok:false,error:"phone_suffix_required"},400);
    try{
      const q=await sb.from("customers")
        .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
        .ilike("primary_whatsapp_e164","%"+suffix)
        .order("is_active",{ascending:false})
        .order("updated_at",{ascending:false})
        .limit(3);
      if(q.error)throw q.error;
      const rows=q.data||[];
      if(!rows.length)return json({ok:true,found:false,customer:null});
      const chosen=rows[0];
      const bundles=await vitrineCustomerBundles(sb,[chosen.id]);
      const full=vitrinePublicCustomer(chosen,bundles.get(chosen.id));
      return json({ok:true,found:true,customer:{
        id:full.id,
        display_name:full.display_name,
        phone:full.phone,
        address:full.address
      },matches:rows.length});
    }catch(e){
      return json({ok:false,error:"customer_lookup_failed",detail:clean((e as Error)?.message,300)},500);
    }
  }

  if(action==="vitrine_customers_list"){
    try{return json({ok:true,customers:await vitrineListCustomers(sb,body)})}
    catch(e){return json({ok:false,error:"customers_unavailable",detail:clean((e as Error)?.message,300)},500)}
  }
  if(action==="vitrine_customer_get"){
    const id=uuid(body?.id);if(!id)return json({ok:false,error:"invalid_customer"},400);
    try{const customer=await vitrineGetCustomer(sb,id);return customer?json({ok:true,customer}):json({ok:false,error:"customer_not_found"},404)}
    catch(e){return json({ok:false,error:"customer_unavailable",detail:clean((e as Error)?.message,300)},500)}
  }
  if(action==="vitrine_customer_save"){
    try{
      const result=await vitrineSaveCustomer(sb,body);
      return json(result,result.ok?200:Number(result.status||400));
    }catch(e){
      const msg=clean((e as Error)?.message,300);
      return json({ok:false,error:msg.includes("duplicate key")?"duplicate_value":"customer_save_failed",detail:msg},msg.includes("duplicate key")?409:500);
    }
  }

  if(action==="vitrine_customer_history"){
    try{
      const result=await vitrineCustomerHistory(sb,body);
      return json(result,result.ok?200:Number(result.status||400));
    }catch(e){
      return json({ok:false,error:"customer_history_unavailable",detail:clean((e as Error)?.message,300)},500);
    }
  }
  if(action==="vitrine_customer_order_detail"){
    try{
      const result=await vitrineCustomerOrderDetail(sb,body);
      return json(result,result.ok?200:Number(result.status||400));
    }catch(e){
      return json({ok:false,error:"customer_order_unavailable",detail:clean((e as Error)?.message,300)},500);
    }
  }

  if(action==="r8_eval_chunk_internal"){
    const supplied=req.headers.get("x-papoai-brain-eval-key")||"";
    if(!(await r8VerifyEvalKey(sb,supplied)))return json({ok:false,error:"eval_unauthorized"},401);
    const runId=uuid(body?.run_id);if(!runId)return json({ok:false,error:"run_id_required"},400);
    const r=await r8RunEvalChunk(sb,runId,Number(body?.limit||4));
    return json(r,r.ok?200:500);
  }

  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return json({ok:false,error:"missing_token"},401);
  const {data:userData,error:userError}=await sb.auth.getUser(token);if(userError||!userData?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",userData.user.id).maybeSingle();if(adminError)return json({ok:false,error:"admin_lookup_failed"},500);if(!admin?.is_active)return json({ok:false,error:"admin_not_authorized"},403);
  const isOwner=admin.role==="owner";const canEdit=isOwner||["admin","manager"].includes(admin.role);

  if(action==="r8_overview")return json({ok:true,...await r8Overview(sb)});
  if(action==="r8_health")return json({ok:true,...await r8Health(sb)});
  if(action==="r8_intelligence")return json({ok:true,configs:await r8Configs(sb)});
  if(action==="r8_save_config"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);
    const area=clean(body?.area,40),cfg=R8_CONFIGS[area];if(!cfg)return json({ok:false,error:"invalid_area"},400);
    const before=await sb.from(cfg.table).select("*").eq("id",1).maybeSingle();if(!before.data)return json({ok:false,error:"config_missing"},404);
    const patch=r8Patch(area,body?.patch||{});if(Object.keys(patch).length<=1)return json({ok:false,error:"no_editable_fields"},400);
    await r8Snapshot(sb,"config:"+area,"1",before.data,userData.user.id,"update",body?.note||"");
    const saved=await sb.from(cfg.table).update(patch).eq("id",1).select("*").single();if(saved.error)return json({ok:false,error:"config_save_failed",detail:saved.error.message},400);
    return json({ok:true,config:saved.data});
  }
  if(action==="r8_versions"){
    const et=clean(body?.entity_type,80),ek=clean(body?.entity_key,120);let q=sb.from("papoai_admin_config_versions").select("*").order("created_at",{ascending:false}).limit(100);if(et)q=q.eq("entity_type",et);if(ek)q=q.eq("entity_key",ek);const r=await q;return json({ok:!r.error,versions:r.data||[],error:r.error?.message||null},r.error?400:200);
  }
  if(action==="r8_rollback_config"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);const vid=Number(body?.version_id||0),v=await sb.from("papoai_admin_config_versions").select("*").eq("id",vid).maybeSingle();if(!v.data)return json({ok:false,error:"version_not_found"},404);const ent=String(v.data.entity_type||"");if(!ent.startsWith("config:"))return json({ok:false,error:"unsupported_rollback_entity"},400);const area=ent.slice(7),cfg=R8_CONFIGS[area];if(!cfg)return json({ok:false,error:"invalid_area"},400);const current=await sb.from(cfg.table).select("*").eq("id",1).maybeSingle();if(current.data)await r8Snapshot(sb,ent,"1",current.data,userData.user.id,"rollback","rollback to version "+vid);const patch=r8Patch(area,v.data.snapshot||{}),saved=await sb.from(cfg.table).update(patch).eq("id",1).select("*").single();if(saved.error)return json({ok:false,error:"rollback_failed",detail:saved.error.message},400);return json({ok:true,config:saved.data});
  }
  if(action==="r8_save_model_price"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);const model=clean(body?.model,120);if(!model)return json({ok:false,error:"model_required"},400);const before=await sb.from("papoai_model_price_profiles").select("*").eq("model",model).maybeSingle();if(before.data)await r8Snapshot(sb,"model_price",model,before.data,userData.user.id,"update",body?.note||"");const row:any={model,input_usd_per_million:Number(body?.input_usd_per_million),cached_input_usd_per_million:Number(body?.cached_input_usd_per_million),output_usd_per_million:Number(body?.output_usd_per_million),source_note:clean(body?.source_note,500)||null,updated_by:userData.user.id,updated_at:new Date().toISOString()};if([row.input_usd_per_million,row.cached_input_usd_per_million,row.output_usd_per_million].some((n:any)=>!Number.isFinite(n)||n<0))return json({ok:false,error:"invalid_price"},400);const saved=await sb.from("papoai_model_price_profiles").upsert(row,{onConflict:"model"}).select("*").single();return json({ok:!saved.error,price:saved.data,error:saved.error?.message||null},saved.error?400:200);
  }

  if(action==="r8_knowledge_save"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);
    const type=clean(body?.type,40),table=entityTable(type),id=uuid(body?.id);
    if(!["knowledge","guidance","procedure"].includes(type)||!table)return json({ok:false,error:"invalid_entity_type"},400);
    let row:any={updated_by:userData.user.id,updated_at:new Date().toISOString()};
    if(type==="knowledge")row={...row,knowledge_key:clean(body?.knowledge_key,100).toLowerCase(),category:clean(body?.category,80),title:clean(body?.title,180),content:clean(body?.content,12000),keywords:strArray(body?.keywords),channel_scope:strArray(body?.channel_scope).length?strArray(body?.channel_scope):["whatsapp"],priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),source_note:clean(body?.source_note,500)||null,status:["draft","published","archived"].includes(body?.status)?body.status:"draft"};
    if(type==="guidance")row={...row,rule_key:clean(body?.rule_key,100).toLowerCase(),title:clean(body?.title,180),instruction:clean(body?.instruction,8000),intent_scope:strArray(body?.intent_scope),stage_scope:strArray(body?.stage_scope),channel_scope:strArray(body?.channel_scope).length?strArray(body?.channel_scope):["whatsapp"],behavior_tags:strArray(body?.behavior_tags),priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),status:["draft","published","archived"].includes(body?.status)?body.status:"draft"};
    if(type==="procedure")row={...row,procedure_key:clean(body?.procedure_key,100).toLowerCase(),title:clean(body?.title,180),trigger_description:clean(body?.trigger_description,2000),steps:Array.isArray(body?.steps)?body.steps.slice(0,30):[],allowed_actions:strArray(body?.allowed_actions),confirmation_actions:strArray(body?.confirmation_actions),fallback:clean(body?.fallback,2000)||null,priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),status:["draft","published","archived"].includes(body?.status)?body.status:"draft"};
    const keyValue=type==="knowledge"?row.knowledge_key:type==="guidance"?row.rule_key:row.procedure_key;
    const mainValue=type==="knowledge"?row.content:type==="guidance"?row.instruction:row.trigger_description;
    if(!keyValue||!row.title||!mainValue)return json({ok:false,error:"required_fields_missing"},400);
    if(id){
      const before=await sb.from(table).select("*").eq("id",id).maybeSingle();
      if(!before.data)return json({ok:false,error:"entity_not_found"},404);
      await r8Snapshot(sb,"knowledge:"+type,id,before.data,userData.user.id,"update",body?.note||"");
      const saved=await sb.from(table).update(row).eq("id",id).select("*").single();
      if(saved.error)return json({ok:false,error:"save_failed",detail:saved.error.message},400);
      return json({ok:true,item:saved.data});
    }
    row.created_by=userData.user.id;
    const saved=await sb.from(table).insert(row).select("*").single();
    if(saved.error)return json({ok:false,error:"save_failed",detail:saved.error.message},400);
    await r8Snapshot(sb,"knowledge:"+type,String(saved.data.id),saved.data,userData.user.id,"create",body?.note||"");
    return json({ok:true,item:saved.data});
  }
  if(action==="r8_restore_version"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);
    const versionId=Number(body?.version_id||0);
    const v=await sb.from("papoai_admin_config_versions").select("*").eq("id",versionId).maybeSingle();
    if(!v.data)return json({ok:false,error:"version_not_found"},404);
    const entity=String(v.data.entity_type||""),key=String(v.data.entity_key||""),snap=v.data.snapshot||{};
    if(entity.startsWith("config:")){
      const area=entity.slice(7),cfg=R8_CONFIGS[area];if(!cfg)return json({ok:false,error:"invalid_area"},400);
      const current=await sb.from(cfg.table).select("*").eq("id",1).maybeSingle();
      if(current.data)await r8Snapshot(sb,entity,"1",current.data,userData.user.id,"rollback","rollback to version "+versionId);
      const patch=r8Patch(area,snap),saved=await sb.from(cfg.table).update(patch).eq("id",1).select("*").single();
      if(saved.error)return json({ok:false,error:"rollback_failed",detail:saved.error.message},400);
      return json({ok:true,item:saved.data});
    }
    let table="",idColumn="id",idValue=key;
    if(entity==="product_sales_knowledge"){table="product_sales_knowledge";idColumn="product_id"}
    else if(entity==="customer_memory"){table="customer_service_memory"}
    else if(entity==="knowledge:knowledge"){table="service_knowledge_items"}
    else if(entity==="knowledge:guidance"){table="service_guidance_rules"}
    else if(entity==="knowledge:procedure"){table="service_procedures"}
    else return json({ok:false,error:"unsupported_rollback_entity"},400);
    const current=await sb.from(table).select("*").eq(idColumn,idValue).maybeSingle();
    if(current.data)await r8Snapshot(sb,entity,key,current.data,userData.user.id,"rollback","rollback to version "+versionId);
    const restored=await sb.from(table).upsert(snap,{onConflict:idColumn}).select("*").single();
    if(restored.error)return json({ok:false,error:"rollback_failed",detail:restored.error.message},400);
    return json({ok:true,item:restored.data});
  }

  if(action==="r8_products"){
    const search=clean(body?.q,120),limit=Math.max(1,Math.min(50,Number(body?.limit||20)));let q=sb.from("products").select("id,name,sku,gtin,brand,category,subcategory,price,offer_price,stock,image_url,is_active,physically_verified,updated_at").eq("is_active",true).order("name").limit(limit);if(search){const s=search.replace(/[,%()]/g," ");q=q.or("name.ilike.%"+s+"%,gtin.ilike.%"+s+"%,brand.ilike.%"+s+"%")}const r=await q;if(r.error)return json({ok:false,error:"products_failed",detail:r.error.message},400);const ids=(r.data||[]).map((p:any)=>p.id),k=ids.length?await sb.from("product_sales_knowledge").select("*").in("product_id",ids):{data:[]},km=new Map((k.data||[]).map((p:any)=>[p.product_id,p]));return json({ok:true,products:(r.data||[]).map((p:any)=>({...p,sales_knowledge:km.get(p.id)||null}))});
  }
  if(action==="r8_product_knowledge_save"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);const pid=uuid(body?.product_id);if(!pid)return json({ok:false,error:"product_id_required"},400);const before=await sb.from("product_sales_knowledge").select("*").eq("product_id",pid).maybeSingle();if(before.data)await r8Snapshot(sb,"product_sales_knowledge",pid,before.data,userData.user.id,"update",body?.note||"");const row:any={product_id:pid,aliases:strArray(body?.aliases,40),use_cases:strArray(body?.use_cases,40),audiences:strArray(body?.audiences,40),search_terms:strArray(body?.search_terms,80),cautions:strArray(body?.cautions,40),attributes:obj(body?.attributes),confidence:Math.max(0,Math.min(1,Number(body?.confidence??1))),enrichment_status:clean(body?.enrichment_status||"manual",40),enrichment_model:before.data?.enrichment_model||null,evidence:before.data?.evidence||{},source_urls:before.data?.source_urls||[],catalog_search_text:clean(body?.catalog_search_text||before.data?.catalog_search_text||"",8000),updated_at:new Date().toISOString()};const saved=await sb.from("product_sales_knowledge").upsert(row,{onConflict:"product_id"}).select("*").single();return json({ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200);
  }
  if(action==="r8_customers"){
    const search=clean(body?.q,120).replace(/[,%()]/g," ");let q=sb.from("customers").select("id,name,primary_whatsapp_e164,preferred_reply,shopping_mode,order_count,lifetime_value,last_order_at,last_inbound_message_type,updated_at").eq("is_active",true).order("updated_at",{ascending:false}).limit(50);if(search)q=q.or("name.ilike.%"+search+"%,primary_whatsapp_e164.ilike.%"+search+"%");const r=await q;return json({ok:!r.error,customers:r.data||[],error:r.error?.message||null},r.error?400:200);
  }
  if(action==="r8_customer_detail"){
    const cid=uuid(body?.customer_id);if(!cid)return json({ok:false,error:"customer_id_required"},400);const [c,m,cv]=await Promise.all([sb.from("customers").select("id,name,primary_whatsapp_e164,preferred_reply,shopping_mode,order_count,lifetime_value,last_order_at,last_inbound_message_type,marketing_opt_in,updated_at").eq("id",cid).maybeSingle(),sb.from("customer_service_memory").select("id,memory_key,memory_value,confidence,status,source_kind,evidence_count,last_evidence_at,expires_at,updated_at").eq("customer_id",cid).order("updated_at",{ascending:false}).limit(100),sb.from("conversations").select("id,status,stage,mode,human_required,context_summary,updated_at").eq("customer_id",cid).order("updated_at",{ascending:false}).limit(10)]);return json({ok:true,customer:c.data||null,memories:m.data||[],conversations:cv.data||[]});
  }
  if(action==="r8_customer_memory_save"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);const cid=uuid(body?.customer_id),id=uuid(body?.id);if(!cid)return json({ok:false,error:"customer_id_required"},400);const key=clean(body?.memory_key,100).toLowerCase().replace(/[^a-z0-9_.-]/g,"_"),value=clean(body?.memory_value,1000);if(!key||!value)return json({ok:false,error:"memory_key_value_required"},400);if(/cpf|cnpj|password|senha|health|saude|relig|politic|sexual|criminal/.test(key))return json({ok:false,error:"sensitive_memory_key_blocked"},400);const row:any={customer_id:cid,memory_key:key,memory_value:value,confidence:1,status:["active","inactive","rejected"].includes(body?.status)?body.status:"active",source_kind:"declared",evidence_count:1,last_evidence_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata:{source:"r8_admin_manual"}};if(id){const before=await sb.from("customer_service_memory").select("*").eq("id",id).maybeSingle();if(!before.data)return json({ok:false,error:"memory_not_found"},404);await r8Snapshot(sb,"customer_memory",id,before.data,userData.user.id,"update",body?.note||"");const saved=await sb.from("customer_service_memory").update(row).eq("id",id).select("*").single();return json({ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200)}const saved=await sb.from("customer_service_memory").insert(row).select("*").single();return json({ok:!saved.error,item:saved.data,error:saved.error?.message||null},saved.error?400:200);
  }
  if(action==="r8_orders"){const r=await sb.from("orders").select("id,order_number,status,total,payment_method,source,bling_order_id,sync_status,sync_error,created_at,confirmed_at,customer:customers(name,primary_whatsapp_e164)").order("created_at",{ascending:false}).limit(100);return json({ok:!r.error,orders:r.data||[],error:r.error?.message||null},r.error?400:200)}
  if(action==="r8_handoff_queue"){const q=await sb.rpc("get_papoai_assisted_handoff_queue_v1");return json({ok:!q.error,queue:q.data||{ok:true,count:0,items:[]},error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_handoff_claim"){if(!canEdit)return json({ok:false,error:"editor_required"},403);const id=uuid(body?.handoff_id);if(!id)return json({ok:false,error:"handoff_id_required"},400);const q=await sb.rpc("claim_human_handoff_admin_v1",{p_handoff_id:id,p_admin_user_id:userData.user.id});return json({ok:!q.error,result:q.data,error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_handoff_complete"){if(!canEdit)return json({ok:false,error:"editor_required"},403);const id=uuid(body?.handoff_id);if(!id)return json({ok:false,error:"handoff_id_required"},400);const q=await sb.rpc("complete_papoai_assisted_handoff_v1",{p_handoff_id:id,p_admin_user_id:userData.user.id,p_notes:clean(body?.notes,1000)||null});return json({ok:!q.error,result:q.data,error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_eval_dashboard"){const q=await sb.rpc("get_papoai_brain_eval_dashboard_v1");return json({ok:!q.error,dashboard:q.data||null,error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_eval_scenarios"){const q=await sb.from("papoai_brain_eval_scenarios").select("scenario_key,category,message_text,expected,priority,source,active,updated_at").order("priority").order("category").order("scenario_key").limit(300);return json({ok:!q.error,scenarios:q.data||[],error:q.error?.message||null},q.error?400:200)}
  if(action==="r8_eval_start"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);
    const suite=["full","smoke","category"].includes(body?.suite)?body.suite:"full";
    const category=clean(body?.category,80)||null;
    const cr=await sb.rpc("create_papoai_brain_eval_run_v1",{p_suite:suite,p_category:category,p_limit:Math.max(1,Math.min(300,Number(body?.limit||300)))});
    if(cr.error||cr.data?.ok!==true)return json({ok:false,error:cr.error?.message||cr.data?.reason||"eval_create_failed"},400);
    const ds=await sb.rpc("dispatch_papoai_brain_eval_run_v1",{p_run_id:cr.data.run_id});
    return json({ok:!ds.error&&ds.data?.ok!==false,run:cr.data,dispatch:ds.data||null,error:ds.error?.message||null},ds.error?500:200);
  }
  if(action==="r8_simulator"){const r=await r8Simulator(sb,userData.user.id,body);return json(r.body,r.status)}
  if(action==="r8_simulator_history"){const r=await sb.from("papoai_admin_simulator_runs").select("id,input_text,model,decision,commercial_opportunity,response_text,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd,latency_ms,success,error_code,created_at").order("created_at",{ascending:false}).limit(50);return json({ok:!r.error,runs:r.data||[],error:r.error?.message||null},r.error?400:200)}

  if(action==="dashboard"){
    const [{data:runtime},{count:knowledge},{count:guidance},{count:procedures},{count:tests},{count:verified},{count:sellable}]=await Promise.all([
      sb.from("service_intelligence_runtime_config").select("*").eq("id",1).maybeSingle(),sb.from("service_knowledge_items").select("id",{count:"exact",head:true}),sb.from("service_guidance_rules").select("id",{count:"exact",head:true}),sb.from("service_procedures").select("id",{count:"exact",head:true}),sb.from("service_regression_cases").select("id",{count:"exact",head:true}).eq("status","active"),sb.from("products").select("id",{count:"exact",head:true}).eq("physically_verified",true).eq("is_active",true),sb.from("products").select("id",{count:"exact",head:true}).eq("physically_verified",true).eq("is_active",true).gt("stock",0).gte("price",0)]);
    const {data:cfg}=await sb.from("automation_config").select("whatsapp_sales_mvp_enabled,whatsapp_sales_catalog_source,whatsapp_sales_images_enabled,whatsapp_sales_interactive_enabled,whatsapp_sales_order_submit_enabled,whatsapp_sales_bling_submit_enabled,whatsapp_live_canary_percent,bling_order_sync_enabled,bling_order_homologation_only").eq("id",1).maybeSingle();
    return json({ok:true,user:{role:admin.role,display_name:admin.display_name||null},runtime,whatsapp:cfg,counts:{knowledge:knowledge||0,guidance:guidance||0,procedures:procedures||0,tests:tests||0,verified_products:verified||0,sellable_products:sellable||0},catalog_source:"counter_verified"});
  }
  if(action==="list"){
    const type=clean(body?.type,40),table=entityTable(type);if(!table)return json({ok:false,error:"invalid_entity_type"},400);const status=clean(body?.status,30),q=clean(body?.q,120);let query:any=sb.from(table).select("*").order("updated_at",{ascending:false}).limit(200);if(status)query=query.eq("status",status);if(q)query=query.ilike("title",`%${q.replace(/[%_,()]/g,'')}%`);const {data,error}=await query;if(error)return json({ok:false,error:"list_failed",detail:error.message},500);return json({ok:true,items:data||[]});
  }
  if(action==="save"){
    if(!canEdit)return json({ok:false,error:"editor_required"},403);const type=clean(body?.type,40),table=entityTable(type);if(!table)return json({ok:false,error:"invalid_entity_type"},400);const id=uuid(body?.id);let row:any={updated_by:userData.user.id,updated_at:new Date().toISOString()};
    if(type==="knowledge")row={...row,knowledge_key:clean(body?.knowledge_key,100).toLowerCase(),category:clean(body?.category,80),title:clean(body?.title,180),content:clean(body?.content,12000),keywords:strArray(body?.keywords),channel_scope:strArray(body?.channel_scope).length?strArray(body?.channel_scope):["whatsapp"],priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50)),source_note:clean(body?.source_note,500)||null};
    if(type==="guidance")row={...row,rule_key:clean(body?.rule_key,100).toLowerCase(),title:clean(body?.title,180),instruction:clean(body?.instruction,8000),intent_scope:strArray(body?.intent_scope),stage_scope:strArray(body?.stage_scope),channel_scope:strArray(body?.channel_scope).length?strArray(body?.channel_scope):["whatsapp"],behavior_tags:strArray(body?.behavior_tags),priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50))};
    if(type==="procedure")row={...row,procedure_key:clean(body?.procedure_key,100).toLowerCase(),title:clean(body?.title,180),trigger_description:clean(body?.trigger_description,2000),steps:Array.isArray(body?.steps)?body.steps.slice(0,30):[],allowed_actions:strArray(body?.allowed_actions),confirmation_actions:strArray(body?.confirmation_actions),fallback:clean(body?.fallback,2000)||null,priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50))};
    if(type==="media")row={...row,media_key:clean(body?.media_key,100).toLowerCase(),media_type:clean(body?.media_type,40),title:clean(body?.title,180),product_id:uuid(body?.product_id)||null,basket_id:uuid(body?.basket_id)||null,media_url:clean(body?.media_url,1000)||null,caption_template:clean(body?.caption_template,1000)||null,use_when:clean(body?.use_when,2000)||null};
    if(type==="regression_case")row={...row,case_key:clean(body?.case_key,100).toLowerCase(),title:clean(body?.title,180),customer_message:clean(body?.customer_message,4000),setup:obj(body?.setup),expected_intent:clean(body?.expected_intent,80)||null,expected_action:clean(body?.expected_action,80)||null,expected_assertions:obj(body?.expected_assertions),priority:Math.max(0,Math.min(100,Number(body?.priority??50)||50))};
    const required=type==="knowledge"?[row.knowledge_key,row.category,row.title,row.content]:type==="guidance"?[row.rule_key,row.title,row.instruction]:type==="procedure"?[row.procedure_key,row.title,row.trigger_description]:type==="media"?[row.media_key,row.media_type,row.title]:[row.case_key,row.title,row.customer_message];if(required.some((x:any)=>!x))return json({ok:false,error:"required_fields_missing"},400);
    let result:any,error:any;if(id){({data:result,error}=await sb.from(table).update(row).eq("id",id).select("*").single())}else{row.created_by=userData.user.id;({data:result,error}=await sb.from(table).insert(row).select("*").single())}if(error)return json({ok:false,error:"save_failed",detail:error.message},400);return json({ok:true,item:result});
  }
  if(action==="set_status"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);const type=clean(body?.type,40),table=entityTable(type),id=uuid(body?.id),status=clean(body?.status,30);if(!table||!id)return json({ok:false,error:"invalid_entity"},400);const allowed=type==="regression_case"?["active","disabled","archived"]:["draft","published","archived"];if(!allowed.includes(status))return json({ok:false,error:"invalid_status"},400);const {data:before}=await sb.from(table).select("status").eq("id",id).maybeSingle();if(!before)return json({ok:false,error:"entity_not_found"},404);const {data:item,error}=await sb.from(table).update({status,updated_by:userData.user.id,updated_at:new Date().toISOString()}).eq("id",id).select("*").single();if(error)return json({ok:false,error:"status_update_failed",detail:error.message},400);await sb.from("service_intelligence_publication_events").insert({entity_type:type,entity_id:id,from_status:before.status,to_status:status,actor_user_id:userData.user.id,note:clean(body?.note,500)||null});return json({ok:true,item});
  }
  if(action==="runtime"){
    if(!isOwner)return json({ok:false,error:"owner_required"},403);const patch:any={updated_at:new Date().toISOString()};for(const k of ["enabled","knowledge_enabled","guidance_enabled","procedures_enabled","media_enabled","regression_suite_enabled"])if(typeof body?.[k]==="boolean")patch[k]=body[k];if(["off","homologation","live"].includes(body?.execution_mode))patch.execution_mode=body.execution_mode;const {data,error}=await sb.from("service_intelligence_runtime_config").update(patch).eq("id",1).select("*").single();if(error)return json({ok:false,error:"runtime_update_failed",detail:error.message},400);return json({ok:true,runtime:data});
  }
  if(action==="preview_bundle"){const {data,error}=await sb.rpc("get_service_intelligence_bundle_v1",{p_channel:"whatsapp",p_intent:clean(body?.intent,80)||null,p_stage:clean(body?.stage,80)||null});if(error)return json({ok:false,error:"preview_failed",detail:error.message},400);return json({ok:true,bundle:data});}
  if(action==="product_search"){const {data,error}=await sb.rpc("search_whatsapp_sellable_products_v1",{p_query:clean(body?.q,120),p_limit:Math.max(1,Math.min(20,Number(body?.limit||10)))});if(error)return json({ok:false,error:"product_search_failed",detail:error.message},400);return json({ok:true,products:data||[],source:"counter_verified"});}
  return json({ok:false,error:"unknown_action"},400);
});