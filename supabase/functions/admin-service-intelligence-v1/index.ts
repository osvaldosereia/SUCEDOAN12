import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { planPapoAiTurn } from "../_shared/papoai-ai-planner-v1.mjs";
import { deterministicCommerceIntent, contextualCommerceIntent } from "../_shared/papoai-commerce-intent-v1.mjs";
import { handlePurchaseXmlRequest } from "../purchase-xml-v1/index.ts";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type,x-dona-antonia-bling-hub-key,x-bling-signature-256","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
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

async function blingOauthCallback(sb:any,req:Request){
  const ADMIN_URL="https://donaantonia.com.br/vitrine/admin/";
  const redirect=(status:string,detail="")=>{const u=new URL(ADMIN_URL);u.searchParams.set("bling_oauth",status);if(detail)u.searchParams.set("detail",detail.slice(0,80));u.hash="today";return Response.redirect(u.toString(),302)};
  const u=new URL(req.url),code=clean(u.searchParams.get("code"),2000),state=clean(u.searchParams.get("state"),500),oauthError=clean(u.searchParams.get("error"),120);
  if(oauthError)return redirect("error","authorization_denied");
  if(!code||!state)return redirect("error","missing_code_or_state");
  const runtime=await sb.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();
  if(runtime.error)throw runtime.error;
  const exchange=runtime.data?.metadata?.oauth_exchange_v1||{},expected=clean(exchange?.nonce_sha256,128),expiresAt=clean(exchange?.expires_at,80);
  if(!expected||!expiresAt)return redirect("error","oauth_not_started");
  if(Date.parse(expiresAt)<Date.now())return redirect("error","oauth_expired");
  if(await r8Sha256Hex(state)!==expected)return redirect("error","oauth_state_mismatch");
  const creds=await sb.rpc("get_bling_api_credentials_v1");
  if(creds.error)throw creds.error;
  const clientId=clean(creds.data?.client_id,500),clientSecret=clean(creds.data?.client_secret,1000);
  if(!clientId||!clientSecret)return redirect("error","credentials_missing");
  const basic=btoa(clientId+":"+clientSecret);let response:Response|null=null,data:any={};
  for(const endpoint of BLING_OAUTH_URLS){
    const body=new URLSearchParams({grant_type:"authorization_code",code});
    const attempt=await fetch(endpoint,{method:"POST",headers:{Authorization:"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded",Accept:"1.0","enable-jwt":"1"},body,signal:AbortSignal.timeout(12000)});
    const raw=await attempt.text();let parsed:any={};try{parsed=raw?JSON.parse(raw):{}}catch{}response=attempt;data=parsed;
    if(attempt.ok&&clean(parsed?.refresh_token,5000))break;
    if(![403,404,405].includes(attempt.status))break;
  }
  const refresh=clean(data?.refresh_token,5000);
  if(!response?.ok||!refresh){
    await sb.rpc("merge_bling_hub_runtime_metadata_v2",{p_patch:{oauth_exchange_v1:{expires_at:null,consumed_at:new Date().toISOString(),last_result:"token_exchange_failed",nonce_sha256:null,http_status:response?.status||0}}});
    return redirect("error","token_exchange_failed");
  }
  const saved=await sb.rpc("set_bling_api_refresh_token_v1",{p_refresh_token:refresh});if(saved.error)throw saved.error;
  const now=new Date().toISOString();
  await sb.rpc("merge_bling_hub_runtime_metadata_v2",{p_patch:{oauth_exchange_v1:{expires_at:null,consumed_at:now,last_result:"success",nonce_sha256:null}}});
  await sb.from("bling_hub_runtime_v2").update({last_oauth_check_at:now,last_oauth_ok_at:now,last_oauth_error:null,updated_at:now}).eq("id",1);
  try{await sb.rpc("ops_record_event_v1",{p_domain:"integration",p_event_type:"bling.oauth_reauthorized",p_summary:"Bling reautorizado com novo token OAuth.",p_actor_type:"human",p_entity_type:"integration",p_entity_id:"bling",p_correlation_id:null,p_actor_id:null,p_actor_label:"Owner",p_source_system:"bling",p_severity:"info",p_payload:{oauth:true},p_external_ref:null,p_idempotency_key:"bling-oauth:"+now.slice(0,16),p_occurred_at:now})}catch{}

  // Immediately verify the one remaining Operations 2.0 scope after OAuth.
  // This is read-only and never enables Hub/Webhooks or writes orders.
  let statusCatalogVerified=false;
  try{
    const catalog:any=await blingHubOrderStatusCatalog(sb);
    if(catalog?.ok===true){
      statusCatalogVerified=true;
      const a=await sb.from("ops_attention").select("id").eq("idempotency_key","ops2:attention:bling_status_scope").in("status",["open","acknowledged"]).maybeSingle();
      if(!a.error&&a.data?.id){
        await sb.rpc("ops_resolve_attention_v1",{p_attention_id:a.data.id,p_resolution:"Permissão Situações/Módulos homologada automaticamente após reautorização.",p_resolution_ref:"bling:oauth:status_catalog"});
      }
      try{await sb.rpc("ops_record_event_v1",{p_domain:"integration",p_event_type:"bling.order_status_catalog_verified",p_summary:"Situações/Módulos do Bling homologadas após OAuth.",p_actor_type:"automation",p_entity_type:"integration",p_entity_id:"bling",p_correlation_id:null,p_actor_id:null,p_actor_label:"OAuth pós-validação",p_source_system:"bling",p_severity:"info",p_payload:{module:catalog.module||null,status_count:Array.isArray(catalog.statuses)?catalog.statuses.length:0,transition_count:Array.isArray(catalog.transitions)?catalog.transitions.length:0},p_external_ref:null,p_idempotency_key:"bling-status-catalog:"+now.slice(0,16),p_occurred_at:new Date().toISOString()})}catch{}
    }else{
      await sb.rpc("merge_bling_hub_runtime_metadata_v2",{p_patch:{order_status_catalog:{state:"scope_missing",checked_at:new Date().toISOString(),http_status:Number(catalog?.status||0)||null,required_resource:"situacoes/modulos",status_updates_enabled:false}}});
    }
  }catch(e){
    console.error("bling_status_catalog_post_oauth",clean((e as Error)?.message||e,300));
  }
  return redirect("success",statusCatalogVerified?"status_catalog_ok":"status_catalog_pending");
}

async function blingWebhookHmacHex(secret:string,raw:string){
  const key=await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));
  return [...new Uint8Array(signature)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function blingWebhookConstantTimeEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function blingWebhookProviderEntityId(resource:string,data:any){
  const candidates=[
    data?.id,
    data?.produto?.id,
    data?.product?.id,
    data?.pedido?.id,
    data?.order?.id,
    data?.notaFiscal?.id,
    data?.invoice?.id
  ];
  for(const value of candidates){
    const v=clean(value,120);
    if(v)return v;
  }
  return "";
}
async function blingWebhookReceive(sb:any,req:Request,rawBody:string){
  const supplied=clean(req.headers.get("x-bling-signature-256"),100).toLowerCase();
  if(!/^sha256=[0-9a-f]{64}$/.test(supplied)){
    return json({ok:false,error:"invalid_signature"},401);
  }

  const credentials=await sb.rpc("get_bling_api_credentials_v1");
  if(credentials.error)throw credentials.error;
  const clientSecret=clean(credentials.data?.client_secret,1000);
  if(!clientSecret)return json({ok:false,error:"webhook_secret_unavailable"},503);

  const expected="sha256="+await blingWebhookHmacHex(clientSecret,rawBody);
  if(!blingWebhookConstantTimeEqual(supplied,expected)){
    return json({ok:false,error:"invalid_signature"},401);
  }

  let event:any={};
  try{event=JSON.parse(rawBody)}catch{return json({ok:false,error:"invalid_json"},400)}

  const rawHash=await r8Sha256Hex(rawBody);
  const eventId=clean(event?.eventId,180)||("hash-"+rawHash);
  const eventName=clean(event?.event,100).toLowerCase();
  const [resource="",action=""]=eventName.split(".");
  const supportedResources=new Set(["order","product","stock","virtual_stock","invoice","consumer_invoice"]);
  const supportedActions=new Set(["created","updated","deleted"]);
  const recognized=supportedResources.has(resource)&&supportedActions.has(action);
  const eventAtRaw=clean(event?.date,80);
  const eventAt=eventAtRaw&&!Number.isNaN(Date.parse(eventAtRaw))?new Date(eventAtRaw).toISOString():null;
  const companyId=clean(event?.companyId,180)||null;
  const version=clean(event?.version,40)||null;
  const providerEntityId=blingWebhookProviderEntityId(resource,event?.data)||null;

  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("mode,hub_enabled,webhooks_enabled")
    .eq("id",1).maybeSingle();
  if(runtime.error)throw runtime.error;
  const processingEnabled=runtime.data?.hub_enabled===true
    && runtime.data?.webhooks_enabled===true
    && ["homologation","live"].includes(String(runtime.data?.mode||""));
  const initialStatus=recognized?(processingEnabled?"received":"held"):"ignored";

  const row={
    event_id:eventId,
    event_hash:rawHash,
    event_name:eventName||"unknown",
    resource:resource||"unknown",
    action:action||"unknown",
    company_id:companyId,
    event_version:version,
    event_at:eventAt,
    provider_entity_id:providerEntityId,
    payload:event,
    signature_verified:true,
    status:initialStatus,
    updated_at:new Date().toISOString()
  };
  const inserted=await sb.from("bling_webhook_inbox_v2").insert(row).select("event_id,status").single();
  if(inserted.error){
    if(String(inserted.error.code)==="23505"){
      const existing=await sb.from("bling_webhook_inbox_v2")
        .select("event_hash,status")
        .eq("event_id",eventId).maybeSingle();
      if(existing.error)throw existing.error;
      if(existing.data&&existing.data.event_hash!==rawHash){
        await sb.from("bling_webhook_inbox_v2")
          .update({status:"review_required",last_error:"event_id_payload_hash_mismatch",updated_at:new Date().toISOString()})
          .eq("event_id",eventId);
        return json({ok:true,duplicate:true,review_required:true},200);
      }
      return json({ok:true,duplicate:true,status:existing.data?.status||initialStatus},200);
    }
    throw inserted.error;
  }

  return json({
    ok:true,
    accepted:true,
    duplicate:false,
    status:initialStatus,
    processing_enabled:processingEnabled
  },200);
}
async function blingHubReconcileOrderWebhookEvent(sb:any,event:any){
  const providerId=clean(event?.provider_entity_id,120);
  if(!providerId||!/^[0-9]+$/.test(providerId)){
    return {
      finish_status:"review_required",
      result:{classification:"order_event_without_provider_id",local_mutation:false},
      error:"order_provider_id_missing"
    };
  }

  const links=await sb.from("bling_hub_entity_links_v2")
    .select("source_id,status")
    .eq("entity_type","order")
    .eq("bling_id",Number(providerId))
    .eq("status","matched")
    .limit(2);
  if(links.error)throw links.error;
  if((links.data||[]).length!==1){
    return {
      finish_status:"review_required",
      result:{
        classification:"order_event_link_ambiguous",
        provider_entity_id:providerId,
        match_count:(links.data||[]).length,
        local_mutation:false
      },
      error:"provider_entity_not_linked"
    };
  }

  const sourceId=String(links.data![0].source_id);
  const local=await blingHubResolveVitrineFiscalOrder(sb,sourceId);
  if(!local.ok){
    return {
      finish_status:"review_required",
      result:{
        classification:"canonical_order_not_resolved",
        provider_entity_id:providerId,
        source_id:sourceId,
        local_mutation:false
      },
      error:local.error||"canonical_order_not_resolved"
    };
  }

  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("metadata")
    .eq("id",1)
    .maybeSingle();
  if(runtime.error)throw runtime.error;
  const mapping=runtime.data?.metadata?.ops2_order_status_mapping||{};
  const localStatus=clean(local.order?.status,80);
  const expectedStatusId=Number(mapping?.local_to_bling?.[localStatus]||0)||0;
  if(!expectedStatusId){
    return {
      finish_status:"review_required",
      result:{
        classification:"local_status_without_bling_mapping",
        provider_entity_id:providerId,
        source_id:sourceId,
        local_status:localStatus||null,
        local_mutation:false
      },
      error:"local_status_mapping_missing"
    };
  }

  const token=await blingHubOauth(sb);
  const remote=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(providerId));
  if(!remote.ok){
    const retry=remote.status===429||remote.status>=500||remote.status===0;
    return {
      finish_status:retry?"retry":"review_required",
      result:{
        classification:"remote_order_read_failed",
        provider_entity_id:providerId,
        source_id:sourceId,
        local_status:localStatus,
        expected_status_id:expectedStatusId,
        http_status:remote.status,
        local_mutation:false
      },
      error:"order_detail_http_"+remote.status
    };
  }

  const order=remote.data?.data||{};
  const observedStatusId=Number(order?.situacao?.id||order?.situacao||0)||0;
  if(observedStatusId===expectedStatusId){
    return {
      finish_status:"processed",
      result:{
        classification:"order_reconciled_noop",
        provider_entity_id:providerId,
        source_id:sourceId,
        canonical_order_id:local.order?.id||null,
        local_status:localStatus,
        expected_status_id:expectedStatusId,
        observed_status_id:observedStatusId,
        local_mutation:false,
        anti_loop:true
      },
      error:null
    };
  }

  return {
    finish_status:"review_required",
    result:{
      classification:"order_status_drift",
      provider_entity_id:providerId,
      source_id:sourceId,
      canonical_order_id:local.order?.id||null,
      local_status:localStatus,
      expected_status_id:expectedStatusId,
      observed_status_id:observedStatusId,
      local_mutation:false
    },
    error:"order_status_drift"
  };
}

async function blingHubOps2WebhookReconcileCanary(sb:any,eventIdRaw:any){
  const eventId=clean(eventIdRaw,180);
  if(!eventId)return {ok:false,error:"event_id_required",status:400};
  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("mode,hub_enabled,webhooks_enabled")
    .eq("id",1)
    .maybeSingle();
  if(runtime.error)throw runtime.error;
  if(runtime.data?.mode!=="homologation")return {ok:false,error:"homologation_required",status:409};
  if(runtime.data?.hub_enabled===true||runtime.data?.webhooks_enabled===true){
    return {ok:false,error:"safe_mode_required",status:409};
  }

  const event=await sb.from("bling_webhook_inbox_v2")
    .select("*")
    .eq("event_id",eventId)
    .maybeSingle();
  if(event.error)throw event.error;
  if(!event.data)return {ok:false,error:"webhook_event_not_found",status:404};
  if(event.data.resource!=="order")return {ok:false,error:"order_event_required",status:409};
  if(event.data.status!=="held")return {ok:false,error:"held_event_required",status:409,current_status:event.data.status};

  const rec=await blingHubReconcileOrderWebhookEvent(sb,event.data);
  const finishStatus=String(rec.finish_status||"review_required");
  const done=await sb.rpc("finish_bling_webhook_inbox_v2",{
    p_event_id:eventId,
    p_status:finishStatus,
    p_result:rec.result||{},
    p_error:rec.error||null,
    p_retry_seconds:120,
    p_self_generated:false
  });
  if(done.error)throw done.error;

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"ops2_webhook_reconcile_canary",
    severity:finishStatus==="processed"?"info":"warning",
    domain:"webhook",
    source_system:"bling",
    source_id:eventId,
    details:{
      finish_status:finishStatus,
      result:rec.result||{},
      error:rec.error||null,
      safe_mode:true,
      external_write:false,
      make_used:false
    }
  });

  return {
    ok:finishStatus==="processed",
    event_id:eventId,
    finish_status:finishStatus,
    result:rec.result||{},
    error:rec.error||null,
    external_write:false
  };
}


function blingHubStockDepositObject(rows:any[]){
  const out:any={};
  for(const dep of Array.isArray(rows)?rows:[]){
    const id=Number(dep?.id||0);
    if(!Number.isFinite(id)||id<=0)continue;
    const physical=Number(dep?.saldoFisico);
    const virtual=Number(dep?.saldoVirtual);
    out[String(id)]={
      physical:Number.isFinite(physical)?physical:0,
      virtual:Number.isFinite(virtual)?virtual:0
    };
  }
  return out;
}

async function blingHubReadStockSnapshotFull(sb:any,blingProductId:number){
  const token=await blingHubOauth(sb);
  const q=new URLSearchParams();
  q.append("idsProdutos[]",String(blingProductId));
  const r=await blingHubGet(sb,token,"/estoques/saldos?"+q.toString());
  if(!r.ok)return {ok:false,status:r.status,error:"stock_snapshot_http_"+r.status};
  const rows=Array.isArray(r.data?.data)?r.data.data:[];
  const row=rows.find((x:any)=>Number(x?.produto?.id||0)===blingProductId)||rows[0]||null;
  if(!row)return {ok:false,status:404,error:"stock_snapshot_missing"};
  const physicalTotal=Number(row?.saldoFisicoTotal);
  const virtualTotal=Number(row?.saldoVirtualTotal);
  if(!Number.isFinite(physicalTotal)||!Number.isFinite(virtualTotal)){
    return {ok:false,status:502,error:"stock_snapshot_invalid"};
  }
  return {
    ok:true,
    status:r.status,
    physical_total:physicalTotal,
    virtual_total:virtualTotal,
    deposit_balances:blingHubStockDepositObject(row?.depositos),
    via:"api"
  };
}

async function blingHubReconcileStockWebhookEvent(sb:any,event:any){
  const resource=clean(event?.resource,40).toLowerCase();
  if(!["stock","virtual_stock"].includes(resource)){
    return {
      finish_status:"review_required",
      result:{classification:"stock_resource_required",local_mutation:false},
      error:"stock_resource_required"
    };
  }

  const providerId=clean(event?.provider_entity_id,120);
  if(!providerId||!/^[0-9]+$/.test(providerId)){
    return {
      finish_status:"review_required",
      result:{classification:"stock_event_without_provider_id",local_mutation:false},
      error:"stock_provider_id_missing"
    };
  }
  const blingProductId=Number(providerId);

  const links=await sb.from("bling_hub_entity_links_v2")
    .select("source_id,status")
    .eq("source_system","vitrine_qx")
    .eq("entity_type","product")
    .eq("bling_id",blingProductId)
    .eq("status","matched")
    .limit(2);
  if(links.error)throw links.error;
  if((links.data||[]).length!==1){
    return {
      finish_status:"review_required",
      result:{
        classification:"stock_event_product_unlinked",
        provider_entity_id:providerId,
        match_count:(links.data||[]).length,
        local_mutation:false
      },
      error:"provider_product_not_linked"
    };
  }
  const sourceId=String(links.data![0].source_id);

  const current=await sb.from("bling_stock_mirror_v2")
    .select("observed_at")
    .eq("product_id",sourceId)
    .maybeSingle();
  if(current.error)throw current.error;

  const data=event?.payload?.data||{};
  let physicalTotal=Number(data?.saldoFisicoTotal);
  let virtualTotal=Number(data?.saldoVirtualTotal);
  let depositBalances:any={};
  let replaceDeposits=false;
  let snapshotVia="webhook";

  const needsApiSnapshot=
    (resource==="virtual_stock"&&data?.vinculoComplexo===true)
    || (resource==="stock"&&!current.data);

  if(needsApiSnapshot){
    const snapshot=await blingHubReadStockSnapshotFull(sb,blingProductId);
    if(!snapshot.ok){
      const retry=snapshot.status===0||snapshot.status===429||snapshot.status>=500;
      return {
        finish_status:retry?"retry":"review_required",
        result:{
          classification:"stock_snapshot_read_failed",
          provider_entity_id:providerId,
          source_id:sourceId,
          http_status:snapshot.status,
          local_mutation:false
        },
        error:snapshot.error||"stock_snapshot_read_failed"
      };
    }
    physicalTotal=Number(snapshot.physical_total);
    virtualTotal=Number(snapshot.virtual_total);
    depositBalances=snapshot.deposit_balances||{};
    replaceDeposits=true;
    snapshotVia="api";
  }else if(resource==="virtual_stock"){
    depositBalances=blingHubStockDepositObject(data?.depositos);
    replaceDeposits=true;
  }else{
    depositBalances=blingHubStockDepositObject(data?.deposito?[data.deposito]:[]);
    replaceDeposits=false;
  }

  if(!Number.isFinite(physicalTotal)||!Number.isFinite(virtualTotal)){
    return {
      finish_status:"review_required",
      result:{
        classification:"stock_event_invalid_totals",
        provider_entity_id:providerId,
        source_id:sourceId,
        local_mutation:false
      },
      error:"stock_totals_invalid"
    };
  }

  const observedAtRaw=event?.event_at||event?.received_at||new Date().toISOString();
  const observedAt=Number.isNaN(Date.parse(String(observedAtRaw)))
    ?new Date().toISOString()
    :new Date(observedAtRaw).toISOString();

  const apply=await sb.rpc("apply_bling_stock_mirror_event_v2",{
    p_product_id:sourceId,
    p_bling_product_id:blingProductId,
    p_physical_total:physicalTotal,
    p_virtual_total:virtualTotal,
    p_deposit_balances:depositBalances,
    p_observed_at:observedAt,
    p_source_event_id:clean(event?.event_id,200)||null,
    p_source_resource:resource,
    p_replace_deposits:replaceDeposits
  });
  if(apply.error)throw apply.error;

  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("metadata")
    .eq("id",1)
    .maybeSingle();
  if(runtime.error)throw runtime.error;
  const selectedDepositId=Number(runtime.data?.metadata?.selected_deposit_id||0)||null;
  const selected=selectedDepositId
    ?(apply.data?.deposit_balances?.[String(selectedDepositId)]||null)
    :null;

  return {
    finish_status:"processed",
    result:{
      classification:apply.data?.applied===true?"stock_mirror_applied":"stock_mirror_stale_ignored",
      provider_entity_id:providerId,
      source_id:sourceId,
      physical_total:Number(apply.data?.physical_total??physicalTotal),
      virtual_total:Number(apply.data?.virtual_total??virtualTotal),
      selected_deposit_id:selectedDepositId,
      sellable_physical:selected?Number(selected.physical||0):null,
      sellable_virtual:selected?Number(selected.virtual||0):null,
      observed_at:apply.data?.observed_at||observedAt,
      source_event_id:apply.data?.source_event_id||null,
      source_resource:apply.data?.source_resource||resource,
      stale_ignored:apply.data?.stale_ignored===true,
      snapshot_via:snapshotVia,
      shadow_only:true,
      local_product_stock_mutation:false,
      external_write:false
    },
    error:null
  };
}

async function blingHubOps2StockMirrorEventCanary(sb:any,eventIdRaw:any){
  const eventId=clean(eventIdRaw,180);
  if(!eventId)return {ok:false,error:"event_id_required",status:400};

  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("mode,hub_enabled,webhooks_enabled")
    .eq("id",1)
    .maybeSingle();
  if(runtime.error)throw runtime.error;
  if(runtime.data?.mode!=="homologation")return {ok:false,error:"homologation_required",status:409};
  if(runtime.data?.hub_enabled===true||runtime.data?.webhooks_enabled===true){
    return {ok:false,error:"safe_mode_required",status:409};
  }

  const event=await sb.from("bling_webhook_inbox_v2")
    .select("*")
    .eq("event_id",eventId)
    .maybeSingle();
  if(event.error)throw event.error;
  if(!event.data)return {ok:false,error:"webhook_event_not_found",status:404};
  if(!["stock","virtual_stock"].includes(String(event.data.resource||""))){
    return {ok:false,error:"stock_event_required",status:409};
  }
  if(event.data.status!=="held"){
    return {ok:false,error:"held_event_required",status:409,current_status:event.data.status};
  }

  const rec=await blingHubReconcileStockWebhookEvent(sb,event.data);
  const finishStatus=String(rec.finish_status||"review_required");
  const done=await sb.rpc("finish_bling_webhook_inbox_v2",{
    p_event_id:eventId,
    p_status:finishStatus,
    p_result:rec.result||{},
    p_error:rec.error||null,
    p_retry_seconds:120,
    p_self_generated:false
  });
  if(done.error)throw done.error;

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"ops2_stock_mirror_event_canary",
    severity:finishStatus==="processed"?"info":"warning",
    domain:"stock",
    source_system:"bling",
    source_id:eventId,
    details:{
      finish_status:finishStatus,
      result:rec.result||{},
      error:rec.error||null,
      safe_mode:true,
      shadow_only:true,
      external_write:false,
      make_used:false
    }
  });

  return {
    ok:finishStatus==="processed",
    event_id:eventId,
    finish_status:finishStatus,
    result:rec.result||{},
    error:rec.error||null,
    external_write:false
  };
}


async function blingHubOps2StockMirrorBackfillBatch(sb:any,afterRaw:any,limitRaw:any){
  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("mode,hub_enabled,webhooks_enabled,metadata")
    .eq("id",1)
    .maybeSingle();
  if(runtime.error)throw runtime.error;
  if(runtime.data?.mode!=="homologation")return {ok:false,error:"homologation_required",status:409};
  if(runtime.data?.hub_enabled===true||runtime.data?.webhooks_enabled===true){
    return {ok:false,error:"safe_mode_required",status:409};
  }

  const after=Math.max(0,Number(afterRaw||0)||0);
  const limit=Math.max(1,Math.min(100,Number(limitRaw||20)||20));
  let q=sb.from("bling_hub_entity_links_v2")
    .select("source_id,bling_id,status")
    .eq("source_system","vitrine_qx")
    .eq("entity_type","product")
    .eq("status","matched")
    .order("bling_id",{ascending:true})
    .limit(limit);
  if(after>0)q=q.gt("bling_id",after);
  const links=await q;
  if(links.error)throw links.error;
  const page=links.data||[];
  if(!page.length){
    return {ok:true,done:true,after,limit,scanned:0,active_targets:0,applied:0,stale_ignored:0,missing:0,invalid:0,external_write:false};
  }

  const nextAfter=Math.max(...page.map((x:any)=>Number(x.bling_id||0)).filter((x:number)=>Number.isFinite(x)&&x>0));
  const sourceIds=page.map((x:any)=>String(x.source_id||"")).filter(Boolean);
  const products=await sb.from("products")
    .select("id,name,stock,is_active")
    .in("id",sourceIds);
  if(products.error)throw products.error;
  const productMap=new Map<string,any>((products.data||[]).map((x:any)=>[String(x.id),x]));
  const targets=page.filter((x:any)=>productMap.get(String(x.source_id))?.is_active===true&&Number(x.bling_id)>0);

  if(!targets.length){
    return {
      ok:true,done:page.length<limit,after,next_after_bling_id:nextAfter,limit,
      scanned:page.length,active_targets:0,applied:0,stale_ignored:0,missing:0,invalid:0,
      external_write:false
    };
  }

  const token=await blingHubOauth(sb);
  const params=new URLSearchParams();
  for(const t of targets)params.append("idsProdutos[]",String(t.bling_id));
  const remote=await blingHubGet(sb,token,"/estoques/saldos?"+params.toString());
  if(!remote.ok){
    return {
      ok:false,error:"stock_backfill_http_"+remote.status,status:remote.status,
      after,next_after_bling_id:nextAfter,limit,scanned:page.length,active_targets:targets.length,
      external_write:false
    };
  }

  const rows=Array.isArray(remote.data?.data)?remote.data.data:[];
  const byBling=new Map<number,any>();
  for(const row of rows){
    const id=Number(row?.produto?.id||0);
    if(id>0)byBling.set(id,row);
  }

  const selectedDepositId=Number(runtime.data?.metadata?.selected_deposit_id||0)||null;
  const observedAt=new Date().toISOString();
  let applied=0,staleIgnored=0,missing=0,invalid=0,mismatches=0;
  const samples:any[]=[];

  for(const target of targets){
    const sourceId=String(target.source_id);
    const blingId=Number(target.bling_id);
    const row=byBling.get(blingId);
    if(!row){missing++;continue}
    const physicalTotal=Number(row?.saldoFisicoTotal);
    const virtualTotal=Number(row?.saldoVirtualTotal);
    if(!Number.isFinite(physicalTotal)||!Number.isFinite(virtualTotal)){invalid++;continue}
    const deposits=blingHubStockDepositObject(row?.depositos);
    const apply=await sb.rpc("apply_bling_stock_mirror_event_v2",{
      p_product_id:sourceId,
      p_bling_product_id:blingId,
      p_physical_total:physicalTotal,
      p_virtual_total:virtualTotal,
      p_deposit_balances:deposits,
      p_observed_at:observedAt,
      p_source_event_id:"backfill:"+observedAt+":"+blingId,
      p_source_resource:"backfill",
      p_replace_deposits:true
    });
    if(apply.error)throw apply.error;
    if(apply.data?.applied===true)applied++;else staleIgnored++;

    const selected=selectedDepositId?deposits[String(selectedDepositId)]||null:null;
    const sellableVirtual=selected?Number(selected.virtual||0):virtualTotal;
    const localStock=Number(productMap.get(sourceId)?.stock||0);
    const mismatch=Math.abs(localStock-sellableVirtual)>0.0001;
    if(mismatch)mismatches++;
    if(samples.length<8){
      samples.push({
        source_id:sourceId,
        bling_product_id:blingId,
        name:clean(productMap.get(sourceId)?.name,120),
        local_stock:localStock,
        sellable_virtual:sellableVirtual,
        mismatch
      });
    }
  }

  const status=await sb.rpc("get_bling_stock_mirror_status_v2");
  if(status.error)throw status.error;
  await sb.rpc("merge_bling_hub_runtime_metadata_v2",{
    p_patch:{
      ops2_stock_mirror_backfill:{
        state:"running",
        last_batch_at:new Date().toISOString(),
        last_after_bling_id:nextAfter,
        last_batch_limit:limit,
        last_batch_scanned:page.length,
        last_batch_active_targets:targets.length,
        last_batch_applied:applied,
        last_batch_stale_ignored:staleIgnored,
        last_batch_missing:missing,
        last_batch_invalid:invalid,
        last_batch_mismatches:mismatches,
        mirror_status:status.data||{}
      }
    }
  });

  return {
    ok:true,
    done:page.length<limit,
    after,
    next_after_bling_id:nextAfter,
    limit,
    scanned:page.length,
    active_targets:targets.length,
    applied,
    stale_ignored:staleIgnored,
    missing,
    invalid,
    mismatches,
    mirror_status:status.data||{},
    samples,
    external_write:false
  };
}

async function blingHubProcessWebhookInbox(sb:any,limitRaw:any){
  const worker="bling-webhook-edge-"+crypto.randomUUID();
  const limit=Math.max(1,Math.min(25,Number(limitRaw||10)||10));
  const claim=await sb.rpc("claim_bling_webhook_inbox_v2",{
    p_worker:worker,p_limit:limit,p_lease_seconds:300
  });
  if(claim.error)throw claim.error;
  const events=claim.data||[];
  const summary:any={ok:true,claimed:events.length,processed:0,review_required:0,ignored:0,retry:0,self_generated:0};
  for(const event of events){
    try{
      const resource=clean(event.resource,40).toLowerCase();
      const providerId=clean(event.provider_entity_id,120);
      const linkType=resource==="order"?"order":(["product","stock","virtual_stock"].includes(resource)?"product":(resource.includes("invoice")?"invoice":""));
      const domain=resource==="order"?"order":(["stock","virtual_stock"].includes(resource)?"stock":(resource==="product"?"product":(resource.includes("invoice")?"fiscal":"webhook")));
      let linked=false;
      let sourceId:string|null=null;
      if(linkType&&providerId&&/^\d+$/.test(providerId)){
        const links=await sb.from("bling_hub_entity_links_v2")
          .select("source_id,status")
          .eq("entity_type",linkType)
          .eq("bling_id",Number(providerId))
          .eq("status","matched")
          .limit(2);
        if(links.error)throw links.error;
        if((links.data||[]).length===1){
          linked=true;
          sourceId=links.data![0].source_id;
        }
      }

      let selfGenerated=false;
      if(providerId&&domain!=="webhook"){
        const eventTime=event.event_at?Date.parse(event.event_at):Date.parse(event.received_at);
        const since=new Date((Number.isFinite(eventTime)?eventTime:Date.now())-10*60*1000).toISOString();
        const recent=await sb.from("bling_hub_jobs_v2")
          .select("id")
          .eq("domain",domain)
          .eq("provider_id",providerId)
          .eq("status","synced")
          .gte("finished_at",since)
          .limit(1);
        if(recent.error)throw recent.error;
        selfGenerated=Boolean(recent.data?.length);
      }

      if(selfGenerated){
        await sb.rpc("finish_bling_webhook_inbox_v2",{
          p_event_id:event.event_id,p_status:"processed",
          p_result:{classification:"self_generated_observed",linked,source_id:sourceId,local_mutation:false,anti_loop:true},
          p_error:null,p_retry_seconds:120,p_self_generated:true
        });
        summary.processed++;summary.self_generated++;continue;
      }

      if(!["order","product","stock","virtual_stock","invoice","consumer_invoice"].includes(resource)){
        await sb.rpc("finish_bling_webhook_inbox_v2",{
          p_event_id:event.event_id,p_status:"ignored",
          p_result:{classification:"unsupported_resource",local_mutation:false},
          p_error:null,p_retry_seconds:120,p_self_generated:false
        });
        summary.ignored++;continue;
      }

      if(["product","stock","virtual_stock","order"].includes(resource)&&!linked){
        await sb.rpc("finish_bling_webhook_inbox_v2",{
          p_event_id:event.event_id,p_status:"review_required",
          p_result:{classification:"external_change_unlinked",provider_entity_id:providerId||null,local_mutation:false},
          p_error:"provider_entity_not_linked",p_retry_seconds:120,p_self_generated:false
        });
        summary.review_required++;continue;
      }

      if(resource==="order"&&linked){
        const rec=await blingHubReconcileOrderWebhookEvent(sb,event);
        const finishStatus=String(rec.finish_status||"review_required");
        await sb.rpc("finish_bling_webhook_inbox_v2",{
          p_event_id:event.event_id,
          p_status:finishStatus,
          p_result:rec.result||{},
          p_error:rec.error||null,
          p_retry_seconds:120,
          p_self_generated:false
        });
        if(finishStatus==="processed")summary.processed++;
        else if(finishStatus==="retry")summary.retry++;
        else summary.review_required++;
        continue;
      }

      if(["stock","virtual_stock"].includes(resource)&&linked){
        const rec=await blingHubReconcileStockWebhookEvent(sb,event);
        const finishStatus=String(rec.finish_status||"review_required");
        await sb.rpc("finish_bling_webhook_inbox_v2",{
          p_event_id:event.event_id,
          p_status:finishStatus,
          p_result:rec.result||{},
          p_error:rec.error||null,
          p_retry_seconds:120,
          p_self_generated:false
        });
        if(finishStatus==="processed")summary.processed++;
        else if(finishStatus==="retry")summary.retry++;
        else summary.review_required++;
        continue;
      }

      await sb.rpc("finish_bling_webhook_inbox_v2",{
        p_event_id:event.event_id,p_status:"review_required",
        p_result:{
          classification:"external_change_observed",
          linked,source_id:sourceId,
          action:event.action,
          local_mutation:false,
          anti_loop:true
        },
        p_error:"external_change_requires_reconciliation",
        p_retry_seconds:120,p_self_generated:false
      });
      summary.review_required++;
    }catch(e){
      await sb.rpc("finish_bling_webhook_inbox_v2",{
        p_event_id:event.event_id,p_status:"retry",
        p_result:{local_mutation:false},
        p_error:clean((e as Error)?.message||e,500),
        p_retry_seconds:120,p_self_generated:false
      });
      summary.retry++;
    }
  }
  return summary;
}

async function blingHubResolveVitrineFiscalOrder(sb:any,sourceOrderIdRaw:any){
  const sourceOrderId=uuid(sourceOrderIdRaw);
  if(!sourceOrderId)return {ok:false,error:"invalid_source_order_id",status:400};

  // Pedidos novos da Vitrine já vivem neste banco canônico.
  // O lookup antigo por idempotency_key permanece só para histórico QX.
  let q=await sb.from("orders")
    .select("id,status,total,payment_method,delivered_at,idempotency_key,order_number")
    .eq("id",sourceOrderId)
    .in("source",["vitrine","manual_whatsapp","papoai","reorder"])
    .maybeSingle();
  if(q.error)throw q.error;

  if(!q.data){
    const key="vitrine:"+sourceOrderId;
    q=await sb.from("orders")
      .select("id,status,total,payment_method,delivered_at,idempotency_key,order_number")
      .eq("idempotency_key",key)
      .maybeSingle();
    if(q.error)throw q.error;
  }

  if(!q.data)return {ok:false,error:"canonical_order_not_synced",status:409,source_order_id:sourceOrderId};
  return {ok:true,source_order_id:sourceOrderId,order:q.data};
}
function blingHubFiscalPaymentMethod(raw:any){
  const v=clean(raw,120).toLowerCase();
  if(v.includes("pix"))return "pix";
  if(v.includes("dinheir")||v==="cash")return "cash";
  if(v.includes("cart")||v.includes("credit")||v.includes("debit")||v.includes("aliment")||v.includes("refei"))return "card";
  if(v.includes("link"))return "payment_link";
  return "other";
}
async function blingHubOrderStatusCatalog(sb:any){
  const token=await blingHubOauth(sb);
  const modules=await blingHubGet(sb,token,"/situacoes/modulos");
  if(!modules.ok)return {ok:false,error:"status_modules_http_"+modules.status,status:modules.status};

  const allModules=Array.isArray(modules.data?.data)?modules.data.data:[];
  const candidates=allModules.filter((m:any)=>{
    const name=(clean(m?.nome,160)+" "+clean(m?.descricao,220)).toLowerCase();
    return name.includes("pedido")&&name.includes("venda");
  });

  if(candidates.length!==1){
    return {
      ok:false,error:"sales_order_status_module_ambiguous",status:409,
      candidates:candidates.map((m:any)=>({id:Number(m?.id||0)||null,nome:clean(m?.nome,160),descricao:clean(m?.descricao,220)})),
      available_modules:allModules.map((m:any)=>({id:Number(m?.id||0)||null,nome:clean(m?.nome,160),descricao:clean(m?.descricao,220)})).slice(0,100),
      external_write:false
    };
  }

  const moduleId=Number(candidates[0]?.id||0);
  if(!moduleId)return {ok:false,error:"sales_order_status_module_invalid",status:409,external_write:false};

  const [statuses,transitions,actions]=await Promise.all([
    blingHubGet(sb,token,"/situacoes/modulos/"+encodeURIComponent(String(moduleId))),
    blingHubGet(sb,token,"/situacoes/modulos/"+encodeURIComponent(String(moduleId))+"/transicoes"),
    blingHubGet(sb,token,"/situacoes/modulos/"+encodeURIComponent(String(moduleId))+"/acoes")
  ]);
  if(!statuses.ok)return {ok:false,error:"sales_order_statuses_http_"+statuses.status,status:statuses.status,external_write:false};
  if(!transitions.ok)return {ok:false,error:"sales_order_transitions_http_"+transitions.status,status:transitions.status,external_write:false};
  if(!actions.ok)return {ok:false,error:"sales_order_actions_http_"+actions.status,status:actions.status,external_write:false};

  const statusRows=(Array.isArray(statuses.data?.data)?statuses.data.data:[]).map((x:any)=>({
    id:Number(x?.id||0)||null,
    nome:clean(x?.nome,180),
    id_herdado:Number(x?.idHerdado||0)||null,
    cor:clean(x?.cor,40)
  })).filter((x:any)=>x.id);

  const transitionRows=(Array.isArray(transitions.data?.data)?transitions.data.data:[]).map((x:any)=>({
    id:Number(x?.id||0)||null,
    origem:{
      id:Number(x?.situacaoOrigem?.id||0)||null,
      nome:clean(x?.situacaoOrigem?.nome,180)
    },
    destino:{
      id:Number(x?.situacaoDestino?.id||0)||null,
      nome:clean(x?.situacaoDestino?.nome,180)
    },
    ativo:x?.ativo!==false,
    acoes:Array.isArray(x?.acoes)?x.acoes.slice(0,50):[]
  }));
  const actionRows=(Array.isArray(actions.data?.data)?actions.data.data:[]).map((x:any)=>({
    id:Number(x?.id||0)||null,
    nome:clean(x?.nome,160),
    descricao:clean(x?.descricao,240)
  })).filter((x:any)=>x.id);

  const now=new Date().toISOString();
  const snapshot={
    state:"ready",
    checked_at:now,
    http_status:200,
    required_resource:"situacoes/modulos",
    status_updates_enabled:true,
    module_id:moduleId,
    module_name:clean(candidates[0]?.nome,160),
    statuses:statusRows,
    transitions:transitionRows,
    actions:actionRows,
    refreshed_at:now
  };
  const update=await sb.rpc("merge_bling_hub_runtime_metadata_v2",{
    p_patch:{order_status_catalog:snapshot}
  });
  if(update.error)throw update.error;

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"order_status_catalog_refreshed",
    severity:"info",
    domain:"order",
    details:{
      module_id:moduleId,
      module_name:snapshot.module_name,
      status_count:statusRows.length,
      transition_count:transitionRows.length,
      action_count:actionRows.length,
      external_write:false,
      make_used:false
    }
  });

  return {
    ok:true,
    module:{id:moduleId,nome:snapshot.module_name},
    statuses:statusRows,
    transitions:transitionRows,
    actions:actionRows,
    external_write:false
  };
}


function blingHubStatusByName(rows:any[],name:string){
  const n=clean(name,180).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  return (rows||[]).find((x:any)=>clean(x?.nome,180).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()===n)||null;
}
async function blingHubCreateStatusOnce(sb:any,token:string,moduleId:number,name:string,color:string,inheritedId:number){
  const r=await blingHubPostOnce(sb,token,"/situacoes",{idModuloSistema:moduleId,nome:name,cor:color,idHerdado:inheritedId});
  if(r.ok)return {ok:true,created:true,response:r};
  const refreshed=await blingHubOrderStatusCatalog(sb);
  const found=refreshed?.ok?blingHubStatusByName(refreshed.statuses||[],name):null;
  if(found)return {ok:true,created:false,reconciled:true,status:found};
  return {ok:false,error:"status_create_failed",status:r.status||409,detail:r.error||null,provider_details:r.provider_details||[]};
}
async function blingHubCreateTransitionOnce(sb:any,token:string,moduleId:number,fromId:number,toId:number){
  const current=await blingHubOrderStatusCatalog(sb);
  if(!current?.ok)return {ok:false,error:"status_catalog_unavailable",status:Number(current?.status||409)};
  const existing=(current.transitions||[]).find((x:any)=>x?.ativo!==false&&Number(x?.origem?.id)===fromId&&Number(x?.destino?.id)===toId);
  if(existing){
    if(Array.isArray(existing.acoes)&&existing.acoes.length){
      return {ok:false,error:"transition_has_actions",status:409,transition:existing};
    }
    return {ok:true,created:false,transition:existing};
  }
  const payload={ativo:true,acoes:[],modulo:{id:moduleId},situacaoOrigem:{id:fromId},situacaoDestino:{id:toId}};
  const r=await blingHubPostOnce(sb,token,"/situacoes/transicoes",payload);
  if(r.ok)return {ok:true,created:true,response:r};
  const refreshed=await blingHubOrderStatusCatalog(sb);
  const found=refreshed?.ok?(refreshed.transitions||[]).find((x:any)=>x?.ativo!==false&&Number(x?.origem?.id)===fromId&&Number(x?.destino?.id)===toId):null;
  if(found&&!Array.isArray(found.acoes)||found?.acoes?.length===0)return {ok:true,created:false,reconciled:true,transition:found};
  return {ok:false,error:"transition_create_failed",status:r.status||409,detail:r.error||null,provider_details:r.provider_details||[]};
}
async function blingHubOps2PrepareOrderWorkflow(sb:any){
  const token=await blingHubOauth(sb);
  let catalog=await blingHubOrderStatusCatalog(sb);
  if(!catalog?.ok)return catalog;
  const moduleId=Number(catalog.module?.id||0);
  if(!moduleId)return {ok:false,error:"sales_order_module_missing",status:409,external_write:false};

  const wanted=[
    {key:"awaiting_confirmation",name:"Aguardando confirmação",color:"#E9DC40",inheritedId:21},
    {key:"approved_separation",name:"Aprovado / Separar",color:"#0065F9",inheritedId:15}
  ];
  const created:any[]=[];
  for(const w of wanted){
    let row=blingHubStatusByName(catalog.statuses||[],w.name);
    if(!row){
      const cr=await blingHubCreateStatusOnce(sb,token,moduleId,w.name,w.color,w.inheritedId);
      if(!cr.ok)return {...cr,external_write:true};
      created.push({type:"status",name:w.name});
      catalog=await blingHubOrderStatusCatalog(sb);
      row=blingHubStatusByName(catalog.statuses||[],w.name);
    }
    if(!row)return {ok:false,error:"status_not_resolved_after_create",status:409,name:w.name,external_write:true};
  }

  const waiting=blingHubStatusByName(catalog.statuses||[],"Aguardando confirmação");
  const approved=blingHubStatusByName(catalog.statuses||[],"Aprovado / Separar");
  const open=blingHubStatusByName(catalog.statuses||[],"Em aberto");
  const verified=blingHubStatusByName(catalog.statuses||[],"Verificado");
  const attended=blingHubStatusByName(catalog.statuses||[],"Atendido");
  const cancelled=blingHubStatusByName(catalog.statuses||[],"Cancelado");
  if(!open||!waiting||!approved||!verified||!attended||!cancelled){
    return {ok:false,error:"required_status_missing",status:409,external_write:Boolean(created.length)};
  }

  const transitionSpecs=[
    [Number(open.id),Number(waiting.id),"open_to_awaiting"],
    [Number(waiting.id),Number(approved.id),"awaiting_to_approved"],
    [Number(waiting.id),Number(cancelled.id),"awaiting_to_cancelled"],
    [Number(approved.id),Number(verified.id),"approved_to_verified"],
    [Number(approved.id),Number(cancelled.id),"approved_to_cancelled"],
    [Number(approved.id),Number(waiting.id),"approved_to_awaiting_rollback"]
  ];
  const transitionResults:any[]=[];
  for(const [fromId,toId,label] of transitionSpecs){
    const tr=await blingHubCreateTransitionOnce(sb,token,moduleId,Number(fromId),Number(toId));
    transitionResults.push({label,...tr});
    if(!tr.ok)return {ok:false,error:tr.error||"transition_prepare_failed",status:tr.status||409,transition:label,details:tr,external_write:true};
    if(tr.created)created.push({type:"transition",label});
  }

  catalog=await blingHubOrderStatusCatalog(sb);
  const mapping={
    state:"prepared",
    module_id:moduleId,
    default_open_id:Number(open.id),
    awaiting_confirmation_id:Number(waiting.id),
    approved_separation_id:Number(approved.id),
    verified_id:Number(verified.id),
    attended_id:Number(attended.id),
    cancelled_id:Number(cancelled.id),
    local_to_bling:{
      storefront_received:Number(waiting.id),
      created:Number(waiting.id),
      confirmed:Number(approved.id),
      processing:Number(approved.id),
      ready:Number(verified.id),
      out_for_delivery:Number(verified.id),
      delivered:Number(attended.id),
      cancelled:Number(cancelled.id)
    },
    reservation_policy:{
      awaiting_confirmation_should_reserve:false,
      approved_separation_should_reserve:true,
      verified_should_reserve:true,
      requires_bling_stock_setting_check:true
    },
    prepared_at:new Date().toISOString()
  };
  const saved=await sb.rpc("merge_bling_hub_runtime_metadata_v2",{p_patch:{ops2_order_status_mapping:mapping}});
  if(saved.error)throw saved.error;
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"ops2_order_status_workflow_prepared",
    severity:"info",
    domain:"order",
    details:{created,mapping,transition_results:transitionResults.map((x:any)=>({label:x.label,created:Boolean(x.created),reconciled:Boolean(x.reconciled)})),make_used:false,external_write:Boolean(created.length)}
  });
  return {ok:true,created,mapping,catalog,external_write:Boolean(created.length)};
}



async function blingHubPatchOrderStatusOnce(sb:any,token:string,blingOrderId:number,targetStatusId:number){
  await blingHubReserveSlot(sb);
  try{
    const r=await fetch(
      BLING_API_BASE+"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId))+"/situacoes/"+encodeURIComponent(String(targetStatusId)),
      {method:"PATCH",headers:{Authorization:"Bearer "+token,Accept:"application/json","enable-jwt":"1"},signal:AbortSignal.timeout(15000)}
    );
    const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
    return {
      ok:r.ok,status:r.status,data,
      error:r.ok?"":clean(data?.error?.message||data?.error?.description||data?.error||raw,500),
      provider_details:blingHubProviderDetails(data),
      uncertain:r.status>=500
    };
  }catch(e){
    return {ok:false,status:0,data:{},error:clean((e as Error)?.message||e,500),provider_details:[],uncertain:true};
  }
}


async function blingHubOps2VirtualStockSnapshot(sb:any,token:string,payloadRaw:any,depositId:number){
  const payload=payloadRaw&&typeof payloadRaw==="object"?payloadRaw:{};
  const items=Array.isArray(payload?.items)?payload.items:[];
  const demand=new Map<string,number>();
  for(const item of items){
    const productId=uuid(item?.product_id);
    const qty=Number(item?.quantity);
    if(!productId||!Number.isFinite(qty)||qty<=0)continue;
    demand.set(productId,(demand.get(productId)||0)+qty);
  }
  if(!demand.size)return {ok:false,error:"order_without_stock_demand",status:409,rows:[],shortages:[]};

  const sourceIds=[...demand.keys()];
  const links=await sb.from("bling_hub_entity_links_v2")
    .select("source_id,bling_id,status")
    .eq("source_system","vitrine_qx")
    .eq("entity_type","product")
    .in("source_id",sourceIds);
  if(links.error)throw links.error;
  const linkMap=new Map<string,any>((links.data||[]).map((x:any)=>[String(x.source_id),x]));

  const unresolved:any[]=[];
  const blingIds:number[]=[];
  const sourceByBling=new Map<number,string>();
  for(const sourceId of sourceIds){
    const link=linkMap.get(sourceId);
    const blingId=Number(link?.bling_id||0);
    if(!link||link.status!=="matched"||!blingId){
      unresolved.push({product_id:sourceId,required:demand.get(sourceId)||0,reason:"product_not_linked"});
      continue;
    }
    blingIds.push(blingId);
    sourceByBling.set(blingId,sourceId);
  }
  if(unresolved.length){
    return {ok:false,error:"stock_products_unlinked",status:409,rows:[],shortages:unresolved,checked:0};
  }

  const remoteMap=new Map<number,any>();
  for(let i=0;i<blingIds.length;i+=50){
    const q=new URLSearchParams();
    for(const id of blingIds.slice(i,i+50))q.append("idsProdutos[]",String(id));
    const r=await blingHubGet(sb,token,"/estoques/saldos?"+q.toString());
    if(!r.ok){
      return {ok:false,error:"stock_snapshot_http_"+r.status,status:r.status||502,rows:[],shortages:[],checked:remoteMap.size};
    }
    for(const row of Array.isArray(r.data?.data)?r.data.data:[]){
      const id=Number(row?.produto?.id||0);
      if(id>0)remoteMap.set(id,row);
    }
  }

  const rows:any[]=[];
  const shortages:any[]=[];
  for(const blingId of blingIds){
    const sourceId=sourceByBling.get(blingId)||"";
    const required=Number(demand.get(sourceId)||0);
    const remote=remoteMap.get(blingId);
    if(!remote){
      const miss={product_id:sourceId,bling_product_id:blingId,required,available:0,reason:"stock_row_missing"};
      rows.push(miss);shortages.push(miss);continue;
    }
    const deps=Array.isArray(remote?.depositos)?remote.depositos:[];
    const dep=deps.find((x:any)=>Number(x?.id||0)===depositId)||null;
    const physical=Number(dep?.saldoFisico);
    const virtual=Number(dep?.saldoVirtual);
    const row={
      product_id:sourceId,
      bling_product_id:blingId,
      required,
      deposit_id:depositId,
      physical:Number.isFinite(physical)?physical:null,
      virtual:Number.isFinite(virtual)?virtual:null,
      physical_total:Number(remote?.saldoFisicoTotal),
      virtual_total:Number(remote?.saldoVirtualTotal)
    };
    rows.push(row);
    if(!Number.isFinite(virtual)){
      shortages.push({...row,available:0,reason:"deposit_virtual_missing"});
    }else if(virtual+0.0001<required){
      shortages.push({...row,available:Math.max(0,virtual),reason:"insufficient_virtual_stock"});
    }
  }

  return {
    ok:shortages.length===0,
    status:shortages.length?409:200,
    deposit_id:depositId,
    checked:rows.length,
    shortages,
    rows
  };
}

function blingHubOps2NegativeVirtualRows(snapshot:any){
  return (Array.isArray(snapshot?.rows)?snapshot.rows:[]).filter((x:any)=>
    Number.isFinite(Number(x?.virtual))&&Number(x.virtual)<-0.0001
  );
}


async function blingHubPostOrderActionOnce(sb:any,token:string,path:string){
  await blingHubReserveSlot(sb);
  try{
    const r=await fetch(BLING_API_BASE+path,{
      method:"POST",
      headers:{Authorization:"Bearer "+token,Accept:"application/json","enable-jwt":"1"},
      signal:AbortSignal.timeout(15000)
    });
    const raw=await r.text();
    let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
    return {
      ok:r.ok,status:r.status,data,
      error:r.ok?"":clean(data?.error?.message||data?.error?.description||data?.error||raw,700),
      provider_details:blingHubProviderDetails(data),
      uncertain:r.status>=500
    };
  }catch(e){
    return {
      ok:false,status:0,data:{},
      error:clean((e as Error)?.message||e,700),
      provider_details:[],uncertain:true
    };
  }
}

function blingHubOps2PhysicalDeltaCheck(before:any,after:any,direction:"launch"|"reverse"){
  const afterMap=new Map<number,any>(
    (Array.isArray(after?.rows)?after.rows:[])
      .map((x:any)=>[Number(x?.bling_product_id||0),x])
      .filter((x:any)=>x[0]>0)
  );
  const rows:any[]=[];
  let ok=true;
  for(const b of Array.isArray(before?.rows)?before.rows:[]){
    const id=Number(b?.bling_product_id||0);
    const a=afterMap.get(id);
    const required=Number(b?.required||0);
    const beforePhysical=Number(b?.physical);
    const afterPhysical=Number(a?.physical);
    const expected=direction==="launch"?beforePhysical-required:beforePhysical+required;
    const matched=Number.isFinite(beforePhysical)&&Number.isFinite(afterPhysical)&&Math.abs(afterPhysical-expected)<=0.0001;
    if(!matched)ok=false;
    rows.push({
      product_id:b?.product_id||null,
      bling_product_id:id||null,
      required,
      before_physical:Number.isFinite(beforePhysical)?beforePhysical:null,
      expected_physical:Number.isFinite(expected)?expected:null,
      after_physical:Number.isFinite(afterPhysical)?afterPhysical:null,
      after_virtual:Number.isFinite(Number(a?.virtual))?Number(a.virtual):null,
      matched
    });
  }
  return {ok,checked:rows.length,mismatches:rows.filter((x:any)=>!x.matched),rows};
}

async function blingHubOps2WaitPhysicalDelta(
  sb:any,token:string,payload:any,depositId:number,before:any,direction:"launch"|"reverse"
){
  let last:any=null,comparison:any=null;
  for(let attempt=1;attempt<=4;attempt++){
    last=await blingHubOps2VirtualStockSnapshot(sb,token,payload,depositId);
    comparison=blingHubOps2PhysicalDeltaCheck(before,last,direction);
    if(comparison.ok)return {ok:true,attempt,snapshot:last,comparison};
    if(attempt<4)await sleep(attempt*400);
  }
  return {ok:false,attempt:4,snapshot:last,comparison};
}

async function blingHubOps2PatchSafeStatus(
  sb:any,token:string,catalog:any,blingOrderId:number,currentStatusId:number,targetStatusId:number
){
  if(currentStatusId===targetStatusId)return {ok:true,changed:false,status_id:targetStatusId};
  const transition=(Array.isArray(catalog?.transitions)?catalog.transitions:[]).find((x:any)=>
    x?.ativo!==false
    && Number(x?.origem?.id)===currentStatusId
    && Number(x?.destino?.id)===targetStatusId
  );
  if(!transition){
    return {ok:false,error:"required_transition_missing",status:409,from_status_id:currentStatusId,to_status_id:targetStatusId};
  }
  if(Array.isArray(transition?.acoes)&&transition.acoes.length){
    return {
      ok:false,error:"transition_has_actions",status:409,
      transition_id:transition.id,actions:transition.acoes,
      from_status_id:currentStatusId,to_status_id:targetStatusId
    };
  }
  const write=await blingHubPatchOrderStatusOnce(sb,token,blingOrderId,targetStatusId);
  if(!write.ok){
    return {
      ok:false,error:write.uncertain?"status_change_uncertain":"status_change_http_"+write.status,
      status:write.status||502,detail:write.error||null,provider_details:write.provider_details||[],
      from_status_id:currentStatusId,to_status_id:targetStatusId,
      external_write:"unknown_possible"
    };
  }
  const verify=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)));
  if(!verify.ok)return {ok:false,error:"post_status_verify_http_"+verify.status,status:verify.status,external_write:true};
  const observed=Number(verify.data?.data?.situacao?.id||verify.data?.data?.situacao||0)||0;
  if(observed!==targetStatusId){
    return {ok:false,error:"post_status_verify_mismatch",status:409,expected_status_id:targetStatusId,observed_status_id:observed,external_write:true};
  }
  return {ok:true,changed:true,status_id:observed,transition_id:transition.id,external_write:true};
}

async function blingHubOps2PhysicalStockCanary(sb:any,payloadRaw:any){
  const payload=payloadRaw&&typeof payloadRaw==="object"?payloadRaw:{};
  const sourceOrderId=uuid(payload?.source_order_id);
  if(!sourceOrderId)return {ok:false,error:"invalid_source_order_id",status:400,external_write:false};

  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("mode,hub_enabled,webhooks_enabled,metadata")
    .eq("id",1).maybeSingle();
  if(runtime.error)throw runtime.error;
  if(runtime.data?.mode!=="homologation"){
    return {ok:false,error:"homologation_required",status:409,external_write:false};
  }
  if(runtime.data?.hub_enabled===true||runtime.data?.webhooks_enabled===true){
    return {ok:false,error:"safe_mode_required",status:409,external_write:false};
  }
  const meta=runtime.data?.metadata||{};
  if(meta?.ops2_stock_mirror_event_mode?.state!=="verified"){
    return {ok:false,error:"stock_mirror_gate_not_verified",status:409,external_write:false};
  }
  const mapping=meta?.ops2_order_status_mapping||{};
  if(mapping.state!=="prepared")return {ok:false,error:"ops2_status_mapping_not_prepared",status:409,external_write:false};

  const waitingId=Number(mapping.awaiting_confirmation_id||0)||0;
  const approvedId=Number(mapping.approved_separation_id||0)||0;
  const verifiedId=Number(mapping.verified_id||0)||0;
  const attendedId=Number(mapping.attended_id||0)||0;
  const openId=Number(mapping.default_open_id||0)||0;
  const depositId=Number(meta?.selected_deposit_id||0)||0;
  if(!waitingId||!approvedId||!verifiedId||!attendedId||!openId||!depositId){
    return {ok:false,error:"ops2_physical_canary_mapping_incomplete",status:409,external_write:false};
  }

  const approved=await blingHubOps2EnsureOrderState(sb,payload,"approved_separation",true);
  if(!approved.ok)return {...approved,stage:"ensure_approved"};

  const blingOrderId=Number(approved.bling_order_id||0);
  const token=await blingHubOauth(sb);
  const catalog=meta?.order_status_catalog||{};

  const detail0=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)));
  if(!detail0.ok)return {ok:false,error:"order_detail_http_"+detail0.status,status:detail0.status,stage:"before_verified",external_write:true};
  let currentId=Number(detail0.data?.data?.situacao?.id||detail0.data?.data?.situacao||0)||0;

  const toVerified=await blingHubOps2PatchSafeStatus(sb,token,catalog,blingOrderId,currentId,verifiedId);
  if(!toVerified.ok){
    await blingHubOps2EnsureOrderState(sb,payload,"awaiting_confirmation",true);
    return {...toVerified,stage:"to_verified",external_write:true};
  }
  currentId=verifiedId;

  const beforeLaunch=await blingHubOps2VirtualStockSnapshot(sb,token,payload,depositId);
  if(!(beforeLaunch?.rows||[]).length){
    await blingHubOps2PatchSafeStatus(sb,token,catalog,blingOrderId,currentId,openId);
    await blingHubOps2PatchSafeStatus(sb,token,catalog,blingOrderId,openId,waitingId);
    return {ok:false,error:"before_launch_snapshot_missing",status:409,stage:"before_launch",external_write:true};
  }

  const claimLaunch=await sb.rpc("claim_bling_order_stock_action_v2",{
    p_source_order_id:sourceOrderId,
    p_bling_order_id:blingOrderId,
    p_deposit_id:depositId,
    p_action:"launch",
    p_snapshot:beforeLaunch
  });
  if(claimLaunch.error)throw claimLaunch.error;
  if(claimLaunch.data?.already_done===true){
    return {ok:false,error:"canary_stock_already_launched",status:409,control:claimLaunch.data,external_write:true};
  }
  if(claimLaunch.data?.claimed!==true){
    return {ok:false,error:"canary_stock_launch_not_claimed",status:409,control:claimLaunch.data,external_write:true};
  }

  const launchWrite=await blingHubPostOrderActionOnce(
    sb,token,
    "/pedidos/vendas/"+encodeURIComponent(String(blingOrderId))+
    "/lancar-estoque/"+encodeURIComponent(String(depositId))
  );
  const launched=await blingHubOps2WaitPhysicalDelta(sb,token,payload,depositId,beforeLaunch,"launch");
  const launchObserved=launched.ok;
  const finishLaunch=await sb.rpc("finish_bling_order_stock_action_v2",{
    p_source_order_id:sourceOrderId,
    p_action:"launch",
    p_success:launchObserved,
    p_snapshot:launched.snapshot||{},
    p_error:launchObserved?null:(launchWrite.error||"launch_physical_delta_not_verified"),
    p_metadata:{
      canary:true,
      provider_http_status:launchWrite.status||null,
      provider_ok:launchWrite.ok===true,
      provider_uncertain:launchWrite.uncertain===true,
      physical_delta:launched.comparison||{}
    }
  });
  if(finishLaunch.error)throw finishLaunch.error;

  if(!launchObserved){
    await sb.from("ops_attention").upsert({
      type:"stock_control",
      entity_type:"order",
      entity_id:sourceOrderId,
      priority:"critical",
      owner_role:"owner",
      status:"open",
      summary:"Canário Operations 2.0: lançamento físico de estoque não pôde ser reconciliado.",
      recommended_action:"Não repetir o lançamento. Verificar o pedido no Bling e o controle bling_order_stock_controls_v2.",
      evidence:{
        bling_order_id:blingOrderId,deposit_id:depositId,
        provider_http_status:launchWrite.status||null,
        provider_error:launchWrite.error||null,
        comparison:launched.comparison||{}
      },
      source_system:"bling",
      idempotency_key:"ops2:attention:physical_stock_canary:"+sourceOrderId
    },{onConflict:"idempotency_key"});
    return {
      ok:false,error:"physical_stock_launch_unverified",status:409,stage:"launch",
      provider:launchWrite,comparison:launched.comparison||{},external_write:true
    };
  }

  const toAttended=await blingHubOps2PatchSafeStatus(sb,token,catalog,blingOrderId,verifiedId,attendedId);
  if(!toAttended.ok){
    // The physical write is known. Recover it before leaving the canary.
    const beforeReverse=launched.snapshot;
    const claimReverse=await sb.rpc("claim_bling_order_stock_action_v2",{
      p_source_order_id:sourceOrderId,p_bling_order_id:blingOrderId,p_deposit_id:depositId,
      p_action:"reverse",p_snapshot:beforeReverse||{}
    });
    if(claimReverse.error)throw claimReverse.error;
    if(claimReverse.data?.claimed===true){
      const reverseWrite=await blingHubPostOrderActionOnce(
        sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId))+"/estornar-estoque"
      );
      const reversed=await blingHubOps2WaitPhysicalDelta(sb,token,payload,depositId,beforeReverse,"reverse");
      await sb.rpc("finish_bling_order_stock_action_v2",{
        p_source_order_id:sourceOrderId,p_action:"reverse",p_success:reversed.ok,
        p_snapshot:reversed.snapshot||{},p_error:reversed.ok?null:(reverseWrite.error||"reverse_delta_not_verified"),
        p_metadata:{canary:true,recovery_after:"to_attended_failed",provider_http_status:reverseWrite.status||null}
      });
    }
    return {...toAttended,stage:"to_attended",physical_stock_was_launched:true,recovery_attempted:true,external_write:true};
  }

  const afterAttended=await blingHubOps2VirtualStockSnapshot(sb,token,payload,depositId);
  const beforeReverse=afterAttended;
  const claimReverse=await sb.rpc("claim_bling_order_stock_action_v2",{
    p_source_order_id:sourceOrderId,
    p_bling_order_id:blingOrderId,
    p_deposit_id:depositId,
    p_action:"reverse",
    p_snapshot:beforeReverse
  });
  if(claimReverse.error)throw claimReverse.error;
  if(claimReverse.data?.claimed!==true){
    return {ok:false,error:"canary_stock_reverse_not_claimed",status:409,control:claimReverse.data,stage:"reverse_claim",external_write:true};
  }

  const reverseWrite=await blingHubPostOrderActionOnce(
    sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId))+"/estornar-estoque"
  );
  const reversed=await blingHubOps2WaitPhysicalDelta(sb,token,payload,depositId,beforeReverse,"reverse");
  const reverseObserved=reversed.ok;
  const finishReverse=await sb.rpc("finish_bling_order_stock_action_v2",{
    p_source_order_id:sourceOrderId,
    p_action:"reverse",
    p_success:reverseObserved,
    p_snapshot:reversed.snapshot||{},
    p_error:reverseObserved?null:(reverseWrite.error||"reverse_physical_delta_not_verified"),
    p_metadata:{
      canary:true,
      provider_http_status:reverseWrite.status||null,
      provider_ok:reverseWrite.ok===true,
      provider_uncertain:reverseWrite.uncertain===true,
      physical_delta:reversed.comparison||{}
    }
  });
  if(finishReverse.error)throw finishReverse.error;

  if(!reverseObserved){
    await sb.from("ops_attention").upsert({
      type:"stock_control",
      entity_type:"order",
      entity_id:sourceOrderId,
      priority:"critical",
      owner_role:"owner",
      status:"open",
      summary:"Canário Operations 2.0: estorno do lançamento físico não pôde ser comprovado.",
      recommended_action:"Não repetir automaticamente. Verificar o pedido e os saldos físicos no Bling.",
      evidence:{
        bling_order_id:blingOrderId,deposit_id:depositId,
        provider_http_status:reverseWrite.status||null,
        provider_error:reverseWrite.error||null,
        comparison:reversed.comparison||{}
      },
      source_system:"bling",
      idempotency_key:"ops2:attention:physical_stock_canary:"+sourceOrderId
    },{onConflict:"idempotency_key"});
    return {
      ok:false,error:"physical_stock_reverse_unverified",status:409,stage:"reverse",
      provider:reverseWrite,comparison:reversed.comparison||{},external_write:true
    };
  }

  const backOpen=await blingHubOps2PatchSafeStatus(sb,token,catalog,blingOrderId,attendedId,openId);
  if(!backOpen.ok)return {...backOpen,stage:"recovery_to_open",stock_reversed:true,external_write:true};
  const backWaiting=await blingHubOps2PatchSafeStatus(sb,token,catalog,blingOrderId,openId,waitingId);
  if(!backWaiting.ok)return {...backWaiting,stage:"recovery_to_waiting",stock_reversed:true,external_write:true};

  const finalSnapshot=await blingHubOps2VirtualStockSnapshot(sb,token,payload,depositId);
  const finalVsInitial=blingHubOps2PhysicalDeltaCheck(beforeLaunch,finalSnapshot,"reverse");
  // finalVsInitial uses +qty and is not the intended comparison; compare equality explicitly.
  const finalMap=new Map<number,any>((finalSnapshot.rows||[]).map((x:any)=>[Number(x.bling_product_id||0),x]));
  const restoreRows=(beforeLaunch.rows||[]).map((b:any)=>{
    const a=finalMap.get(Number(b.bling_product_id||0));
    const beforePhysical=Number(b.physical),afterPhysical=Number(a?.physical);
    const matched=Number.isFinite(beforePhysical)&&Number.isFinite(afterPhysical)&&Math.abs(beforePhysical-afterPhysical)<=0.0001;
    return {
      product_id:b.product_id,bling_product_id:b.bling_product_id,
      before_physical:beforePhysical,after_physical:afterPhysical,matched
    };
  });
  const fullyRestored=restoreRows.length>0&&restoreRows.every((x:any)=>x.matched);

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"ops2_physical_stock_canary_completed",
    severity:fullyRestored?"info":"error",
    domain:"stock",source_system:"bling",source_id:sourceOrderId,
    details:{
      bling_order_id:blingOrderId,deposit_id:depositId,
      launch_http_status:launchWrite.status||null,launch_delta_ok:launched.ok,
      reverse_http_status:reverseWrite.status||null,reverse_delta_ok:reversed.ok,
      final_status_id:waitingId,fully_restored:fullyRestored,
      restored_rows:restoreRows,make_used:false,external_write:true
    }
  });

  if(fullyRestored){
    await sb.from("ops_attention")
      .update({
        status:"resolved",resolved_at:new Date().toISOString(),updated_at:new Date().toISOString(),
        resolution:"Canário físico concluído e estoque restaurado automaticamente.",
        resolution_ref:"bling:ops2:physical-stock-canary:"+blingOrderId
      })
      .eq("idempotency_key","ops2:attention:physical_stock_canary:"+sourceOrderId)
      .in("status",["open","acknowledged"]);
  }

  return {
    ok:fullyRestored,
    source_order_id:sourceOrderId,
    bling_order_id:blingOrderId,
    deposit_id:depositId,
    launch:{
      provider_http_status:launchWrite.status||null,
      provider_ok:launchWrite.ok===true,
      delta_verified:launched.ok,
      checked:launched.comparison?.checked||0
    },
    attended:true,
    reverse:{
      provider_http_status:reverseWrite.status||null,
      provider_ok:reverseWrite.ok===true,
      delta_verified:reversed.ok,
      checked:reversed.comparison?.checked||0
    },
    final_status_id:waitingId,
    fully_restored:fullyRestored,
    restored_rows:restoreRows,
    external_write:true
  };
}

async function blingHubOps2LaunchPhysicalStock(sb:any,payloadRaw:any){
  const payload=payloadRaw&&typeof payloadRaw==="object"?payloadRaw:{};
  const sourceOrderId=uuid(payload?.source_order_id);
  if(!sourceOrderId)return {ok:false,error:"invalid_source_order_id",status:400,external_write:false};

  const runtime=await sb.from("bling_hub_runtime_v2").select("mode,metadata").eq("id",1).maybeSingle();
  if(runtime.error)throw runtime.error;
  const meta=runtime.data?.metadata||{};
  if(meta?.ops2_stock_authority!=="bling"){
    return {ok:false,error:"bling_stock_authority_not_active",status:409,external_write:false};
  }
  if(meta?.ops2_physical_stock_gate?.state!=="verified"){
    return {ok:false,error:"physical_stock_gate_not_verified",status:409,external_write:false};
  }
  const depositId=Number(meta?.selected_deposit_id||0)||0;
  if(!depositId)return {ok:false,error:"selected_deposit_missing",status:409,external_write:false};

  const fiscal=await sb.rpc("check_order_dispatch_fiscal_gate_v1",{p_order_id:sourceOrderId});
  if(fiscal.error)throw fiscal.error;
  if(fiscal.data?.allowed!==true||fiscal.data?.authorized!==true){
    return {ok:false,error:"fiscal_dispatch_not_authorized",status:409,fiscal_dispatch_gate:fiscal.data,external_write:false};
  }

  const order=await sb.from("orders").select("id,status").eq("id",sourceOrderId).maybeSingle();
  if(order.error)throw order.error;
  if(!order.data)return {ok:false,error:"order_not_found",status:404,external_write:false};
  if(order.data.status!=="ready"){
    return {ok:false,error:"order_not_ready_for_dispatch",status:409,current_status:order.data.status,external_write:false};
  }

  const link=await sb.from("bling_hub_entity_links_v2").select("bling_id,status").eq("source_system","vitrine_qx").eq("entity_type","order").eq("source_id",sourceOrderId).maybeSingle();
  if(link.error)throw link.error;
  const blingOrderId=Number(link.data?.bling_id||0)||0;
  if(link.data?.status!=="matched"||!blingOrderId){
    return {ok:false,error:"order_not_linked",status:409,external_write:false};
  }

  const token=await blingHubOauth(sb);
  const remote=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)));
  if(!remote.ok)return {ok:false,error:"order_detail_http_"+remote.status,status:remote.status||502,external_write:false};
  const verifiedId=Number(meta?.ops2_order_status_mapping?.verified_id||0)||0;
  const remoteStatus=Number(remote.data?.data?.situacao?.id||remote.data?.data?.situacao||0)||0;
  if(!verifiedId||remoteStatus!==verifiedId){
    return {ok:false,error:"bling_order_not_verified",status:409,remote_status_id:remoteStatus,expected_status_id:verifiedId,external_write:false};
  }

  const before=await blingHubOps2VirtualStockSnapshot(sb,token,payload,depositId);
  if(!(before?.rows||[]).length)return {ok:false,error:"before_launch_snapshot_missing",status:409,external_write:false};

  const claim=await sb.rpc("claim_bling_order_stock_action_v2",{
    p_source_order_id:sourceOrderId,p_bling_order_id:blingOrderId,p_deposit_id:depositId,p_action:"launch",p_snapshot:before
  });
  if(claim.error)throw claim.error;
  if(claim.data?.already_done===true){
    return {ok:true,already_done:true,state:claim.data?.state||"launched",source_order_id:sourceOrderId,bling_order_id:blingOrderId,external_write:false};
  }
  if(claim.data?.claimed!==true){
    return {ok:false,error:claim.data?.in_progress?"physical_stock_launch_in_progress":"physical_stock_launch_not_claimed",status:409,control:claim.data,external_write:false};
  }

  const write=await blingHubPostOrderActionOnce(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId))+"/lancar-estoque/"+encodeURIComponent(String(depositId)));
  const observed=await blingHubOps2WaitPhysicalDelta(sb,token,payload,depositId,before,"launch");
  const success=observed.ok===true;
  const finish=await sb.rpc("finish_bling_order_stock_action_v2",{
    p_source_order_id:sourceOrderId,p_action:"launch",p_success:success,p_snapshot:observed.snapshot||{},
    p_error:success?null:(write.error||"launch_physical_delta_not_verified"),
    p_metadata:{operational:true,provider_http_status:write.status||null,provider_ok:write.ok===true,provider_uncertain:write.uncertain===true,physical_delta:observed.comparison||{}}
  });
  if(finish.error)throw finish.error;

  if(!success){
    await sb.from("ops_attention").upsert({
      type:"stock_control",entity_type:"order",entity_id:sourceOrderId,priority:"critical",owner_role:"owner",status:"open",
      summary:"Saída bloqueada: baixa física no Bling não pôde ser comprovada.",
      recommended_action:"Não repetir manualmente. Conferir o pedido e o saldo físico no Bling antes de liberar a expedição.",
      evidence:{bling_order_id:blingOrderId,deposit_id:depositId,provider_http_status:write.status||null,provider_error:write.error||null,comparison:observed.comparison||{}},
      source_system:"bling",idempotency_key:"ops2:attention:physical_stock_dispatch:"+sourceOrderId
    },{onConflict:"idempotency_key"});
    return {ok:false,error:"physical_stock_launch_unverified",status:409,provider:write,comparison:observed.comparison||{},external_write:true};
  }

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"ops2_dispatch_physical_stock_launched",severity:"info",domain:"stock",source_system:"bling",source_id:sourceOrderId,
    details:{bling_order_id:blingOrderId,deposit_id:depositId,provider_http_status:write.status||null,delta_verified:true,make_used:false,external_write:true}
  });
  return {ok:true,launched:true,source_order_id:sourceOrderId,bling_order_id:blingOrderId,deposit_id:depositId,checked:observed.comparison?.checked||0,external_write:true};
}

async function blingHubOps2EnsureOrderState(sb:any,payloadRaw:any,targetKeyRaw:any,canaryRaw:any=false){
  const payload=payloadRaw&&typeof payloadRaw==="object"?payloadRaw:{};
  const sourceOrderId=uuid(payload?.source_order_id);
  const targetKey=clean(targetKeyRaw,80);
  const canary=canaryRaw===true;
  if(!sourceOrderId)return {ok:false,error:"invalid_source_order_id",status:400,external_write:false};
  if(!["awaiting_confirmation","approved_separation","verified"].includes(targetKey)){
    return {ok:false,error:"invalid_target_state",status:400,external_write:false};
  }

  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("mode,orders_enabled,metadata")
    .eq("id",1)
    .maybeSingle();
  if(runtime.error)throw runtime.error;
  const mode=String(runtime.data?.mode||"");
  if(!["homologation","live"].includes(mode)){
    return {ok:false,error:"hub_mode_not_ready",status:409,external_write:false};
  }
  const meta=runtime.data?.metadata||{};
  if(!canary&&meta?.ops2_direct_order_state_enabled!==true){
    return {ok:false,error:"ops2_direct_order_state_disabled",status:409,external_write:false};
  }
  if(canary&&mode!=="homologation"){
    return {ok:false,error:"canary_requires_homologation",status:409,external_write:false};
  }

  const mapping=meta?.ops2_order_status_mapping||{};
  if(mapping.state!=="prepared"){
    return {ok:false,error:"ops2_status_mapping_not_prepared",status:409,external_write:false};
  }
  if(targetKey==="approved_separation"&&meta?.ops2_stock_mirror_event_mode?.state!=="verified"){
    return {ok:false,error:"stock_mirror_gate_not_verified",status:409,external_write:false};
  }
  const targetStatusId=Number(
    targetKey==="awaiting_confirmation"
      ?mapping.awaiting_confirmation_id
      :targetKey==="approved_separation"
        ?mapping.approved_separation_id
        :mapping.verified_id
  )||0;
  if(!targetStatusId)return {ok:false,error:"target_status_missing",status:409,external_write:false};
  if(targetKey==="verified"){
    const local=await sb.from("orders").select("id,status").eq("id",sourceOrderId).maybeSingle();
    if(local.error)throw local.error;
    if(!local.data||local.data.status!=="ready")return {ok:false,error:"local_order_not_ready",status:409,external_write:false};
    const checked=await sb.from("ops_order_check_sessions").select("id,verified_at").eq("order_id",sourceOrderId).eq("status","verified").not("verified_at","is",null).order("verified_at",{ascending:false}).limit(1).maybeSingle();
    if(checked.error)throw checked.error;
    if(!checked.data?.id)return {ok:false,error:"order_check_required_before_bling_verified",status:409,external_write:false};
  }
  const selectedDepositId=Number(meta?.selected_deposit_id||0)||0;
  if(targetKey==="approved_separation"&&!selectedDepositId){
    return {ok:false,error:"selected_deposit_missing",status:409,external_write:false};
  }

  const customerId=uuid(payload?.customer?.source_customer_id);
  let customerEnsured:any=null;
  if(customerId){
    const cq=await sb.from("customers")
      .select("id,bling_contact_id,cpf_cnpj")
      .eq("id",customerId)
      .maybeSingle();
    if(cq.error)throw cq.error;
    if(cq.data&&!Number(cq.data.bling_contact_id||0)&&blingHubValidCpfCnpj(cq.data.cpf_cnpj)){
      customerEnsured=await blingHubEnsureCustomerNow(sb,customerId);
    }
  }

  const preparedPayload={
    ...payload,
    source_order_id:sourceOrderId,
    queue_reason:targetKey==="awaiting_confirmation"?"awaiting_confirmation":targetKey==="approved_separation"?"approved_early_order":"ean_verified",
    status:targetKey==="awaiting_confirmation"?"storefront_received":targetKey==="approved_separation"?"confirmed":"ready"
  };
  const preview=await blingHubPreviewOrderSync(sb,preparedPayload);
  if(!preview.ok||!preview.write_eligible){
    return {
      ok:false,error:"order_not_write_eligible",status:409,
      source_order_id:sourceOrderId,
      blockers:preview.blockers||[],
      write_blockers:preview.write_blockers||[],
      unresolved_products:preview.unresolved_products||[],
      customer_ensure:customerEnsured,
      external_write:Boolean(customerEnsured?.external_write)
    };
  }

  const token=await blingHubOauth(sb);
  const externalKey=String(preview.external_key);
  const found=await blingHubFindOrderByExternalKey(sb,token,externalKey);
  if(!found.ok){
    return {ok:false,error:"order_reconcile_http_"+found.status,status:found.status||502,external_write:false};
  }
  if(found.matches.length>1){
    return {ok:false,error:"duplicate_external_order_key",status:409,match_count:found.matches.length,external_write:false};
  }

  let blingOrderId=Number(found.match?.id||0)||0;
  let created=false,updated=false,statusChanged=false;
  let externalWrite=Boolean(customerEnsured?.external_write);
  let stockPreflight:any=null;

  if(targetKey==="approved_separation"&&!blingOrderId){
    stockPreflight=await blingHubOps2VirtualStockSnapshot(sb,token,preparedPayload,selectedDepositId);
    if(!stockPreflight.ok){
      await sb.from("bling_hub_audit_v2").insert({
        event_type:"ops2_order_approval_stock_blocked",
        severity:"warning",domain:"stock",source_system:"dona_antonia",source_id:sourceOrderId,
        details:{stage:"before_create",deposit_id:selectedDepositId,shortages:stockPreflight.shortages||[],external_write:false,make_used:false}
      });
      return {
        ok:false,error:"insufficient_virtual_stock",status:409,source_order_id:sourceOrderId,
        stock:stockPreflight,external_write:Boolean(customerEnsured?.external_write)
      };
    }
  }

  if(!blingOrderId){
    const createdOrder=await blingHubCreateOrderOnce(sb,token,preview.create_order||preview.desired_order);
    externalWrite=true;
    if(createdOrder.ok)blingOrderId=Number(createdOrder.data?.data?.id||0)||0;
    if(!blingOrderId){
      await sleep(1200);
      const recovery=await blingHubFindOrderByExternalKey(sb,token,externalKey);
      if(recovery.ok&&recovery.matches.length===1)blingOrderId=Number(recovery.match?.id||0)||0;
      if(!blingOrderId){
        return {
          ok:false,
          error:createdOrder.uncertain||createdOrder.status>=500?"order_creation_uncertain":"order_create_http_"+createdOrder.status,
          status:createdOrder.status||502,
          provider_details:createdOrder.provider_details||[],
          requires_reconciliation:Boolean(createdOrder.uncertain||createdOrder.status>=500),
          external_write:true
        };
      }
    }
    created=true;
  }

  let detail=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)));
  if(!detail.ok){
    return {ok:false,error:"order_detail_http_"+detail.status,status:detail.status,bling_order_id:blingOrderId,external_write:externalWrite};
  }
  let remote=detail.data?.data||{};

  const changes=blingHubOrderManagedDiff(remote,preview.desired_order);
  if(Object.keys(changes).length){
    if(Number(remote?.notaFiscal?.id||0)){
      return {ok:false,error:"order_has_invoice",status:409,bling_order_id:blingOrderId,changes,external_write:externalWrite};
    }
    const putPayload=blingHubOrderPutPayload(remote,preview.desired_order);
    const write=await blingHubWriteIdempotent(
      sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)),"PUT",putPayload
    );
    externalWrite=true;
    if(!write.ok){
      return {
        ok:false,error:"order_put_http_"+write.status,status:write.status||502,
        bling_order_id:blingOrderId,changes,provider_details:write.provider_details||[],
        external_write:true
      };
    }
    const afterPut=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)));
    if(!afterPut.ok){
      return {ok:false,error:"post_update_order_verify_http_"+afterPut.status,status:afterPut.status,bling_order_id:blingOrderId,external_write:true};
    }
    remote=afterPut.data?.data||{};
    const remaining=blingHubOrderManagedDiff(remote,preview.desired_order);
    if(Object.keys(remaining).length){
      return {ok:false,error:"post_update_order_mismatch",status:409,bling_order_id:blingOrderId,remaining,external_write:true};
    }
    updated=true;
  }

  let currentStatusId=Number(remote?.situacao?.id||remote?.situacao||0)||0;
  if(targetKey==="approved_separation"&&currentStatusId!==targetStatusId&&!stockPreflight){
    stockPreflight=await blingHubOps2VirtualStockSnapshot(sb,token,preparedPayload,selectedDepositId);
    if(!stockPreflight.ok){
      await sb.from("bling_hub_audit_v2").insert({
        event_type:"ops2_order_approval_stock_blocked",
        severity:"warning",domain:"stock",source_system:"dona_antonia",source_id:sourceOrderId,
        details:{stage:"before_status_change",bling_order_id:blingOrderId,deposit_id:selectedDepositId,shortages:stockPreflight.shortages||[],external_write:false,make_used:false}
      });
      return {
        ok:false,error:"insufficient_virtual_stock",status:409,source_order_id:sourceOrderId,
        bling_order_id:blingOrderId,stock:stockPreflight,external_write:externalWrite
      };
    }
  }
  if(currentStatusId!==targetStatusId){
    const catalog=meta?.order_status_catalog||{};
    const transition=(catalog.transitions||[]).find((x:any)=>
      x?.ativo!==false
      && Number(x?.origem?.id)===currentStatusId
      && Number(x?.destino?.id)===targetStatusId
    );
    if(!transition){
      return {
        ok:false,error:"required_transition_missing",status:409,
        bling_order_id:blingOrderId,from_status_id:currentStatusId,to_status_id:targetStatusId,
        external_write:externalWrite
      };
    }
    if(Array.isArray(transition.acoes)&&transition.acoes.length){
      return {
        ok:false,error:"transition_has_actions",status:409,
        bling_order_id:blingOrderId,transition_id:transition.id,transition_actions:transition.acoes,
        external_write:externalWrite
      };
    }
    const patch=await blingHubPatchOrderStatusOnce(sb,token,blingOrderId,targetStatusId);
    externalWrite=true;
    if(!patch.ok){
      return {
        ok:false,error:"order_status_patch_http_"+patch.status,status:patch.status||502,
        bling_order_id:blingOrderId,from_status_id:currentStatusId,to_status_id:targetStatusId,
        provider_details:patch.provider_details||[],requires_reconciliation:Boolean(patch.uncertain),
        external_write:true
      };
    }
    statusChanged=true;
  }

  const verify=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)));
  if(!verify.ok){
    return {ok:false,error:"post_state_verify_http_"+verify.status,status:verify.status,bling_order_id:blingOrderId,external_write:externalWrite};
  }
  remote=verify.data?.data||{};
  currentStatusId=Number(remote?.situacao?.id||remote?.situacao||0)||0;
  const remoteKey=clean(remote?.numeroLoja,120);
  const remoteTotal=Math.round(Number(remote?.total||0)*100);
  const expectedTotal=Number(preview.totals?.order_total_cents||0);
  if(remoteKey!==externalKey||Math.abs(remoteTotal-expectedTotal)>1||currentStatusId!==targetStatusId){
    return {
      ok:false,error:"post_state_order_mismatch",status:409,
      bling_order_id:blingOrderId,
      key_matches:remoteKey===externalKey,
      total_matches:Math.abs(remoteTotal-expectedTotal)<=1,
      expected_status_id:targetStatusId,
      observed_status_id:currentStatusId,
      external_write:externalWrite
    };
  }

  let stockPostcheck:any=null;
  if(targetKey==="approved_separation"){
    stockPostcheck=await blingHubOps2VirtualStockSnapshot(sb,token,preparedPayload,selectedDepositId);
    const negative=blingHubOps2NegativeVirtualRows(stockPostcheck);
    if(!stockPostcheck?.rows?.length||negative.length){
      let rollback:any=null;
      const waitingId=Number(mapping.awaiting_confirmation_id||0)||0;
      if(waitingId&&currentStatusId===targetStatusId){
        const catalog=meta?.order_status_catalog||{};
        const back=(catalog.transitions||[]).find((x:any)=>
          x?.ativo!==false
          && Number(x?.origem?.id)===currentStatusId
          && Number(x?.destino?.id)===waitingId
          && (!Array.isArray(x?.acoes)||x.acoes.length===0)
        );
        if(back)rollback=await blingHubPatchOrderStatusOnce(sb,token,blingOrderId,waitingId);
      }
      await sb.from("bling_hub_audit_v2").insert({
        event_type:"ops2_order_approval_postcheck_failed",
        severity:"error",domain:"stock",source_system:"dona_antonia",source_id:sourceOrderId,
        details:{
          bling_order_id:blingOrderId,deposit_id:selectedDepositId,
          negative_virtual:negative,stock_postcheck:stockPostcheck,
          rollback_attempted:Boolean(rollback),rollback_ok:Boolean(rollback?.ok),
          external_write:true,make_used:false
        }
      });
      return {
        ok:false,error:"post_reservation_stock_invalid",status:409,
        source_order_id:sourceOrderId,bling_order_id:blingOrderId,
        negative_virtual:negative,rollback_ok:Boolean(rollback?.ok),
        stock:stockPostcheck,external_write:true
      };
    }
  }

  const now=new Date().toISOString();
  const link=await sb.from("bling_hub_entity_links_v2").upsert({
    source_system:"vitrine_qx",
    entity_type:"order",
    source_id:sourceOrderId,
    bling_id:blingOrderId,
    identity_kind:"numeroLoja",
    identity_value:externalKey,
    status:"matched",
    last_verified_at:now,
    updated_at:now,
    metadata:{
      verified:true,total_cents:expectedTotal,
      created_by_hub:created,updated_by_hub:updated,
      ops2_target_key:targetKey,ops2_target_status_id:targetStatusId,
      make_used:false
    }
  },{onConflict:"source_system,entity_type,source_id"});
  if(link.error)throw link.error;

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"ops2_order_state_ensured",
    severity:"info",
    domain:"order",
    source_system:"dona_antonia",
    source_id:sourceOrderId,
    details:{
      bling_order_id:blingOrderId,target_key:targetKey,target_status_id:targetStatusId,
      created,updated,status_changed:statusChanged,canary,
      stock_preflight:stockPreflight?{checked:stockPreflight.checked,deposit_id:stockPreflight.deposit_id,shortage_count:(stockPreflight.shortages||[]).length}:null,
      stock_postcheck:stockPostcheck?{checked:stockPostcheck.checked,deposit_id:stockPostcheck.deposit_id,negative_count:blingHubOps2NegativeVirtualRows(stockPostcheck).length}:null,
      external_write:externalWrite,make_used:false
    }
  });

  return {
    ok:true,
    source_order_id:sourceOrderId,
    bling_order_id:blingOrderId,
    external_key:externalKey,
    target_key:targetKey,
    target_status_id:targetStatusId,
    created,updated,status_changed:statusChanged,
    customer_ensure:customerEnsured,
    stock_preflight:stockPreflight?{checked:stockPreflight.checked,deposit_id:stockPreflight.deposit_id,shortage_count:(stockPreflight.shortages||[]).length}:null,
    stock_postcheck:stockPostcheck?{checked:stockPostcheck.checked,deposit_id:stockPostcheck.deposit_id,negative_count:blingHubOps2NegativeVirtualRows(stockPostcheck).length}:null,
    verified:true,
    external_write:externalWrite
  };
}

async function blingHubOps2CanaryOrderStatus(sb:any,sourceOrderIdRaw:any,targetKeyRaw:any){
  const sourceOrderId=uuid(sourceOrderIdRaw);
  const targetKey=clean(targetKeyRaw,80);
  if(!sourceOrderId)return {ok:false,error:"invalid_source_order_id",status:400};
  if(!["awaiting_confirmation","approved_separation","verified"].includes(targetKey)){
    return {ok:false,error:"invalid_canary_target",status:400};
  }
  const [runtime,link]=await Promise.all([
    sb.from("bling_hub_runtime_v2").select("mode,hub_enabled,metadata").eq("id",1).maybeSingle(),
    sb.from("bling_hub_entity_links_v2").select("bling_id,status").eq("source_system","vitrine_qx").eq("entity_type","order").eq("source_id",sourceOrderId).maybeSingle()
  ]);
  if(runtime.error)throw runtime.error;
  if(link.error)throw link.error;
  if(runtime.data?.mode!=="homologation")return {ok:false,error:"homologation_required",status:409};
  if(!link.data||link.data.status!=="matched"||!Number(link.data.bling_id))return {ok:false,error:"order_not_linked",status:409};
  const mapping=runtime.data?.metadata?.ops2_order_status_mapping||{};
  if(mapping.state!=="prepared")return {ok:false,error:"ops2_status_mapping_not_prepared",status:409};
  const targetStatusId=Number(targetKey==="awaiting_confirmation"?mapping.awaiting_confirmation_id:targetKey==="approved_separation"?mapping.approved_separation_id:mapping.verified_id)||0;
  if(!targetStatusId)return {ok:false,error:"target_status_missing",status:409};
  if(targetKey==="verified"){
    const local=await sb.from("orders").select("id,status").eq("id",sourceOrderId).maybeSingle();
    if(local.error)throw local.error;
    if(!local.data||local.data.status!=="ready")return {ok:false,error:"local_order_not_ready",status:409,external_write:false};
    const checked=await sb.from("ops_order_check_sessions").select("id,verified_at").eq("order_id",sourceOrderId).eq("status","verified").not("verified_at","is",null).order("verified_at",{ascending:false}).limit(1).maybeSingle();
    if(checked.error)throw checked.error;
    if(!checked.data?.id)return {ok:false,error:"order_check_required_before_bling_verified",status:409,external_write:false};
  }

  const token=await blingHubOauth(sb);
  const before=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(link.data.bling_id)));
  if(!before.ok)return {ok:false,error:"order_detail_http_"+before.status,status:before.status};
  const currentId=Number(before.data?.data?.situacao?.id||before.data?.data?.situacao||0)||0;
  if(currentId===targetStatusId){
    return {ok:true,changed:false,source_order_id:sourceOrderId,bling_order_id:Number(link.data.bling_id),from_status_id:currentId,to_status_id:targetStatusId,external_write:false};
  }

  const catalog=runtime.data?.metadata?.order_status_catalog||{};
  const transition=(Array.isArray(catalog.transitions)?catalog.transitions:[]).find((x:any)=>
    x?.ativo!==false&&Number(x?.origem?.id)===currentId&&Number(x?.destino?.id)===targetStatusId
  );
  if(!transition)return {ok:false,error:"required_transition_missing",status:409,from_status_id:currentId,to_status_id:targetStatusId};
  if(Array.isArray(transition.acoes)&&transition.acoes.length){
    return {ok:false,error:"transition_has_actions",status:409,transition_id:transition.id,actions:transition.acoes};
  }

  const write=await blingHubPatchOrderStatusOnce(sb,token,Number(link.data.bling_id),targetStatusId);
  if(!write.ok){
    return {ok:false,error:write.uncertain?"status_change_uncertain":"status_change_http_"+write.status,status:write.status||502,detail:write.error||null,provider_details:write.provider_details||[],external_write:"unknown_possible"};
  }
  await sleep(500);
  const after=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(link.data.bling_id)));
  if(!after.ok)return {ok:false,error:"post_status_verify_http_"+after.status,status:409,external_write:true};
  const observed=Number(after.data?.data?.situacao?.id||after.data?.data?.situacao||0)||0;
  if(observed!==targetStatusId){
    return {ok:false,error:"post_status_verify_mismatch",status:409,expected_status_id:targetStatusId,observed_status_id:observed,external_write:true};
  }
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"ops2_canary_order_status_changed",severity:"info",domain:"order",
    source_system:"vitrine_qx",source_id:String(sourceOrderId),provider_id:String(link.data.bling_id),
    details:{from_status_id:currentId,to_status_id:targetStatusId,target_key:targetKey,transition_id:transition.id,transition_actions:[],external_write:true,make_used:false}
  });
  return {ok:true,changed:true,source_order_id:sourceOrderId,bling_order_id:Number(link.data.bling_id),from_status_id:currentId,to_status_id:targetStatusId,transition_id:transition.id,external_write:true};
}

async function blingHubOps2WebhookReceiverCanary(sb:any){
  const runtime=await sb.from("bling_hub_runtime_v2")
    .select("mode,hub_enabled,webhooks_enabled")
    .eq("id",1).maybeSingle();
  if(runtime.error)throw runtime.error;
  if(runtime.data?.mode!=="homologation"){
    return {ok:false,error:"homologation_required",status:409};
  }
  if(runtime.data?.hub_enabled===true||runtime.data?.webhooks_enabled===true){
    return {ok:false,error:"safe_mode_required",status:409};
  }

  const credentials=await sb.rpc("get_bling_api_credentials_v1");
  if(credentials.error)throw credentials.error;
  const clientSecret=clean(credentials.data?.client_secret,1000);
  if(!clientSecret)return {ok:false,error:"bling_client_secret_missing",status:409};

  const eventId=crypto.randomUUID();
  const rawBody=JSON.stringify({
    eventId,
    date:new Date().toISOString(),
    version:"v1",
    event:"order.updated",
    companyId:"ops2-receiver-canary",
    data:{id:26967482613}
  });
  const signature="sha256="+await blingWebhookHmacHex(clientSecret,rawBody);
  const requestFor=(sig:string)=>new Request(
    "https://internal.invalid/?source=bling-webhook-v2",
    {
      method:"POST",
      headers:{
        "content-type":"application/json",
        "x-bling-signature-256":sig
      },
      body:rawBody
    }
  );

  const first=await blingWebhookReceive(sb,requestFor(signature),rawBody);
  let firstBody:any={};try{firstBody=await first.json()}catch{}
  const duplicate=await blingWebhookReceive(sb,requestFor(signature),rawBody);
  let duplicateBody:any={};try{duplicateBody=await duplicate.json()}catch{}
  const invalid=await blingWebhookReceive(
    sb,
    requestFor("sha256="+"0".repeat(64)),
    rawBody
  );
  let invalidBody:any={};try{invalidBody=await invalid.json()}catch{}

  const stored=await sb.from("bling_webhook_inbox_v2")
    .select("event_id,event_name,resource,action,provider_entity_id,status,signature_verified,attempt_count,received_at")
    .eq("event_id",eventId)
    .maybeSingle();
  if(stored.error)throw stored.error;

  const ok=
    first.status>=200&&first.status<300
    && duplicate.status>=200&&duplicate.status<300
    && duplicateBody?.duplicate===true
    && invalid.status===401
    && stored.data?.signature_verified===true
    && stored.data?.status==="held"
    && Number(stored.data?.provider_entity_id||0)===26967482613;

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"ops2_webhook_receiver_canary",
    severity:ok?"info":"warning",
    domain:"webhook",
    source_system:"bling",
    source_id:eventId,
    details:{
      ok,
      first_status:first.status,
      first_body:firstBody,
      duplicate_status:duplicate.status,
      duplicate_body:duplicateBody,
      invalid_status:invalid.status,
      invalid_body:invalidBody,
      stored:stored.data||null,
      safe_mode:true,
      external_write:false,
      make_used:false
    }
  });

  return {
    ok,
    event_id:eventId,
    valid_request:{http_status:first.status,body:firstBody},
    duplicate_request:{http_status:duplicate.status,body:duplicateBody},
    invalid_signature:{http_status:invalid.status,body:invalidBody},
    stored:stored.data||null,
    external_write:false
  };
}

async function blingHubOps2OrderRemoteProbe(sb:any,sourceOrderIdRaw:any){
  const sourceOrderId=uuid(sourceOrderIdRaw);
  if(!sourceOrderId)return {ok:false,error:"invalid_source_order_id",status:400};
  const link=await sb.from("bling_hub_entity_links_v2")
    .select("bling_id,status,identity_value")
    .eq("source_system","vitrine_qx")
    .eq("entity_type","order")
    .eq("source_id",sourceOrderId)
    .maybeSingle();
  if(link.error)throw link.error;
  if(!link.data||link.data.status!=="matched"||!Number(link.data.bling_id)){
    return {ok:false,error:"order_not_linked",status:409,external_write:false};
  }
  const token=await blingHubOauth(sb);
  const r=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(link.data.bling_id)));
  if(!r.ok)return {ok:false,error:"order_detail_http_"+r.status,status:r.status,external_write:false};
  const o=r.data?.data||{};
  const sit=o?.situacao&&typeof o.situacao==="object"?o.situacao:{id:o?.situacao};
  return {
    ok:true,
    source_order_id:sourceOrderId,
    bling_order_id:Number(link.data.bling_id),
    external_key:clean(o?.numeroLoja||link.data.identity_value,160)||null,
    total:Number(o?.total||0),
    situacao:{
      id:Number(sit?.id||0)||null,
      nome:clean(sit?.nome||sit?.valor||sit?.descricao,180)||null
    },
    nota_fiscal_id:Number(o?.notaFiscal?.id||0)||null,
    external_write:false
  };
}

async function blingHubVitrineOrderLinkStatus(sb:any,sourceOrderIdRaw:any){
  const sourceOrderId=uuid(sourceOrderIdRaw);
  if(!sourceOrderId)return {ok:false,error:"invalid_source_order_id",status:400};

  const link=await sb.from("bling_hub_entity_links_v2")
    .select("bling_id,status,identity_kind,identity_value,last_verified_at,metadata,updated_at")
    .eq("source_system","vitrine_qx")
    .eq("entity_type","order")
    .eq("source_id",sourceOrderId)
    .maybeSingle();
  if(link.error)throw link.error;

  const job=await sb.from("bling_hub_jobs_v2")
    .select("id,status,operation,attempts,error_code,error_message,provider_id,created_at,updated_at,finished_at")
    .eq("domain","order")
    .eq("source_system","vitrine_qx")
    .eq("source_id",sourceOrderId)
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(job.error)throw job.error;

  const l=link.data;
  const j=job.data;
  return {
    ok:true,
    source_order_id:sourceOrderId,
    linked:Boolean(l?.bling_id&&l?.status==="matched"),
    bling_order_id:l?.bling_id||j?.provider_id||null,
    link_status:l?.status||"not_linked",
    external_key:l?.identity_value||null,
    last_verified_at:l?.last_verified_at||null,
    job:j?{
      id:j.id,status:j.status,operation:j.operation,attempts:Number(j.attempts||0),
      error_code:j.error_code||null,error_message:j.error_message||null,
      created_at:j.created_at,updated_at:j.updated_at,finished_at:j.finished_at
    }:null,
    external_write:false
  };
}

async function blingHubVitrinePendingClosures(sb:any,limitRaw:any=5000){
  const limit=Math.max(1,Math.min(5000,Number(limitRaw||5000)||5000));
  const controls=await sb.from("order_fiscal_controls")
    .select("order_id,delivery_status,payment_status,payment_method,payment_source,settled_amount,payment_confirmed_at,fiscal_status,fiscal_block_reason,fiscal_ready_at,bling_invoice_id,bling_invoice_number,sefaz_status,issued_at")
    .eq("delivery_status","delivered")
    .limit(limit);
  if(controls.error)throw controls.error;

  const pending=(controls.data||[]).filter((c:any)=>{
    const paid=c.payment_status==="confirmed";
    const fiscalDone=c.fiscal_status==="issued"||c.fiscal_status==="cancelled"||Boolean(c.bling_invoice_id);
    return !paid||!fiscalDone;
  });
  if(!pending.length)return {ok:true,orders:[],truncated:(controls.data||[]).length===limit,external_write:false};

  const byCanonical=new Map(pending.map((c:any)=>[c.order_id,c]));
  const canonicalIds=[...byCanonical.keys()];
  const sourceRows:any[]=[];
  for(let i=0;i<canonicalIds.length;i+=200){
    const chunk=canonicalIds.slice(i,i+200);
    const q=await sb.from("orders")
      .select("id,idempotency_key,status,order_number,delivered_at,source")
      .in("id",chunk);
    if(q.error)throw q.error;
    sourceRows.push(...(q.data||[]));
  }

  const orders=sourceRows.map((o:any)=>{
    const c:any=byCanonical.get(o.id)||{};
    const legacyKey=String(o.idempotency_key||"");
    const sourceOrderId=["vitrine","manual_whatsapp","papoai","reorder"].includes(String(o.source||""))
      ? String(o.id)
      : (legacyKey.startsWith("vitrine:")?legacyKey.slice(8):"");
    return {
      source_order_id:uuid(sourceOrderId)||null,
      canonical_order_id:o.id,
      canonical_order_number:o.order_number||null,
      order_status:o.status||null,
      delivered_at:o.delivered_at||null,
      delivery_status:c.delivery_status||"delivered",
      payment_status:c.payment_status||"pending",
      payment_method:c.payment_method||"",
      payment_source:c.payment_source||null,
      settled_amount_cents:c.settled_amount==null?null:Math.round(Number(c.settled_amount||0)*100),
      payment_confirmed_at:c.payment_confirmed_at||null,
      fiscal_status:c.fiscal_status||"blocked",
      fiscal_block_reason:c.fiscal_block_reason||null,
      fiscal_ready_at:c.fiscal_ready_at||null,
      bling_invoice_id:c.bling_invoice_id||null,
      bling_invoice_number:c.bling_invoice_number||null,
      sefaz_status:c.sefaz_status||null,
      issued_at:c.issued_at||null
    };
  }).filter((x:any)=>x.source_order_id);

  return {ok:true,orders,truncated:(controls.data||[]).length===limit,external_write:false};
}

function blingHubNfeSituation(raw:any){
  const value=raw&&typeof raw==="object"
    ? (raw.id??raw.codigo??raw.valor??raw.value??raw.situacao)
    : raw;
  const id=Number(value||0)||null;
  const labels:any={
    1:"Pendente",2:"Cancelada",3:"Aguardando recibo",4:"Rejeitada",5:"Autorizada",
    6:"Emitida DANFE",7:"Registrada",8:"Aguardando protocolo",9:"Denegada",
    10:"Consulta situação",11:"Bloqueada"
  };
  return {
    id,
    label:id?labels[id]||("Situação "+id):"Desconhecida",
    authorized:Boolean(id&&[5,6,7].includes(id)),
    pending:Boolean(id&&[1,3,8,10].includes(id)),
    failed:Boolean(id&&[2,4,9,11].includes(id))
  };
}
function blingHubNfeView(raw:any){
  const nfe=raw?.data&&typeof raw.data==="object"&&!Array.isArray(raw.data)?raw.data:(raw||{});
  const situation=blingHubNfeSituation(nfe?.situacao);
  return {
    id:Number(nfe?.id||nfe?.idNotaFiscal||0)||null,
    numero:clean(nfe?.numero,80)||null,
    numeroLoja:clean(nfe?.numeroLoja,160)||null,
    chaveAcesso:clean(nfe?.chaveAcesso,100)||null,
    dataEmissao:clean(nfe?.dataEmissao,80)||null,
    situation
  };
}
async function blingHubPostOnce(sb:any,token:string,path:string,payload:any=undefined){
  await blingHubReserveSlot(sb);
  try{
    const init:any={
      method:"POST",
      headers:{Authorization:"Bearer "+token,Accept:"application/json","enable-jwt":"1"},
      signal:AbortSignal.timeout(20000)
    };
    if(payload!==undefined){
      init.headers["Content-Type"]="application/json";
      init.body=JSON.stringify(payload);
    }
    const r=await fetch(BLING_API_BASE+path,init);
    const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
    return {
      ok:r.ok,status:r.status,data,
      error:clean(data?.error?.message||data?.error?.description||data?.error||raw,700),
      provider_details:blingHubProviderDetails(data),
      uncertain:r.status>=500
    };
  }catch(e){
    return {
      ok:false,status:0,data:{},
      error:clean((e as Error)?.message||e,700),
      provider_details:[],uncertain:true
    };
  }
}
async function blingHubFindNfeByExternalKey(sb:any,token:string,externalKey:string){
  const q=new URLSearchParams({pagina:"1",limite:"20",numeroLoja:externalKey,tipo:"1"});
  const r=await blingHubGet(sb,token,"/nfe?"+q.toString());
  if(!r.ok)return {ok:false,status:r.status,matches:[],match:null};
  const rows=(Array.isArray(r.data?.data)?r.data.data:[])
    .filter((x:any)=>clean(x?.numeroLoja,160)===externalKey);
  return {
    ok:true,status:r.status,matches:rows,
    match:rows.length===1?rows[0]:null
  };
}
async function blingHubGetNfe(sb:any,token:string,invoiceId:any){
  const id=Number(invoiceId||0);
  if(!id)return {ok:false,status:0,error:"invalid_invoice_id",invoice:null};
  const r=await blingHubGet(sb,token,"/nfe/"+encodeURIComponent(String(id)));
  return {
    ok:r.ok,status:r.status,
    invoice:r.ok?blingHubNfeView(r.data):null,
    data:r.data
  };
}
function blingHubBytesToBase64(bytes:Uint8Array){
  let binary="";
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  }
  return btoa(binary);
}
function blingHubBase64ToBytes(value:any){
  const encoded=String(value??"").replace(/\s+/g,"");
  if(!encoded)return new Uint8Array();
  if(encoded.length>12*1024*1024)throw new Error("danfe_encoded_document_too_large");
  const binary=atob(encoded);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
function blingHubIsPdf(bytes:Uint8Array){
  return bytes.length>=5&&String.fromCharCode(...bytes.subarray(0,5))==="%PDF-";
}
async function blingHubGunzipDocument(bytes:Uint8Array){
  if(bytes.length<2)return bytes;
  if(bytes[0]!==0x1f||bytes[1]!==0x8b)return bytes;
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buf=await new Response(stream).arrayBuffer();
  if(buf.byteLength>6*1024*1024)throw new Error("danfe_document_too_large");
  return new Uint8Array(buf);
}
async function blingHubGetNfeDocumentPdf(sb:any,token:string,accessKeyRaw:any){
  const accessKey=blingHubDigits(accessKeyRaw);
  if(accessKey.length!==44)return {ok:false,status:400,error:"invalid_access_key",content:null};
  await blingHubReserveSlot(sb);
  try{
    const r=await fetch(
      BLING_API_BASE+"/nfe/documento/"+encodeURIComponent(accessKey)+"?formato=pdf",
      {
        headers:{Authorization:"Bearer "+token,Accept:"application/json","enable-jwt":"1"},
        signal:AbortSignal.timeout(20000)
      }
    );
    const body=new Uint8Array(await r.arrayBuffer());
    const bodyText=()=>new TextDecoder().decode(body);
    if(!r.ok){
      const raw=bodyText();
      let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
      return {
        ok:false,status:r.status,
        error:clean(data?.error?.message||data?.error?.description||data?.error||raw||("HTTP "+r.status),700),
        content:null
      };
    }

    // Backward-compatible fallback if Bling ever returns the PDF bytes directly.
    if(blingHubIsPdf(body)){
      if(body.byteLength>6*1024*1024)return {ok:false,status:413,error:"danfe_document_too_large",content:null};
      return {ok:true,status:r.status,content_type:"application/pdf",size_bytes:body.byteLength,content:blingHubBytesToBase64(body)};
    }

    let payload:any={};
    try{payload=JSON.parse(bodyText()||"{}")}catch{
      return {ok:false,status:502,error:"invalid_danfe_response",content:null};
    }
    const docs=Array.isArray(payload?.data)?payload.data:[];
    const doc=docs.find((x:any)=>String(x?.nome||"").toLowerCase().endsWith(".pdf"))||docs[0];
    if(!doc?.conteudo)return {ok:false,status:502,error:"empty_danfe_document",content:null};

    let compressed:Uint8Array;
    try{compressed=blingHubBase64ToBytes(doc.conteudo)}catch(e){
      return {ok:false,status:502,error:clean((e as Error)?.message||"invalid_danfe_base64",700),content:null};
    }
    if(!compressed.byteLength)return {ok:false,status:502,error:"empty_danfe_document",content:null};

    let bytes:Uint8Array;
    try{bytes=await blingHubGunzipDocument(compressed)}catch(e){
      return {ok:false,status:502,error:clean((e as Error)?.message||"invalid_danfe_gzip",700),content:null};
    }
    if(bytes.byteLength<16)return {ok:false,status:502,error:"empty_danfe_document",content:null};
    if(bytes.byteLength>6*1024*1024)return {ok:false,status:413,error:"danfe_document_too_large",content:null};
    if(!blingHubIsPdf(bytes))return {ok:false,status:502,error:"invalid_danfe_pdf",content:null};

    return {
      ok:true,status:r.status,
      content_type:"application/pdf",
      size_bytes:bytes.byteLength,
      content:blingHubBytesToBase64(bytes),
      provider_document_name:clean(doc?.nome,180)||null
    };
  }catch(e){
    return {ok:false,status:0,error:clean((e as Error)?.message||e,700),content:null};
  }
}
async function blingHubVitrineDanfePdf(sb:any,sourceOrderIdRaw:any){
  const resolved=await blingHubResolveVitrineFiscalOrder(sb,sourceOrderIdRaw);
  if(!resolved.ok)return resolved;
  const [control,job]=await Promise.all([
    sb.from("order_fiscal_controls")
      .select("dispatch_fiscal_status,bling_invoice_id,bling_invoice_number,sefaz_status")
      .eq("order_id",resolved.order.id).maybeSingle(),
    sb.from("dispatch_fiscal_jobs")
      .select("status,bling_invoice_id,bling_invoice_number,access_key,sefaz_status")
      .eq("order_id",resolved.order.id).eq("fiscal_version",1).maybeSingle()
  ]);
  if(control.error)throw control.error;
  if(job.error)throw job.error;
  const ctl=control.data||{};
  const j=job.data||{};
  if(ctl.dispatch_fiscal_status!=="authorized"&&j.status!=="authorized"){
    return {ok:false,error:"fiscal_document_not_authorized",status:409,external_write:false};
  }
  const accessKey=blingHubDigits(j.access_key);
  if(accessKey.length!==44){
    return {ok:false,error:"fiscal_document_access_key_missing",status:409,external_write:false};
  }
  const token=await blingHubOauth(sb);
  const doc=await blingHubGetNfeDocumentPdf(sb,token,accessKey);
  if(!doc.ok){
    return {ok:false,error:doc.error||"fiscal_document_download_failed",status:doc.status||502,external_write:false};
  }
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"dispatch_danfe_pdf_opened",
    severity:"info",
    domain:"fiscal",
    details:{
      source_order_id:resolved.source_order_id,
      canonical_order_id:resolved.order.id,
      bling_invoice_id:Number(ctl.bling_invoice_id||j.bling_invoice_id||0)||null,
      bling_invoice_number:clean(ctl.bling_invoice_number||j.bling_invoice_number,80)||null,
      size_bytes:doc.size_bytes,
      external_write:false,
      make_used:false
    }
  });
  return {
    ok:true,
    source_order_id:resolved.source_order_id,
    canonical_order_id:resolved.order.id,
    invoice_id:Number(ctl.bling_invoice_id||j.bling_invoice_id||0)||null,
    invoice_number:clean(ctl.bling_invoice_number||j.bling_invoice_number,80)||null,
    access_key:accessKey,
    sefaz_status:clean(ctl.sefaz_status||j.sefaz_status,120)||"Autorizada",
    content_type:"application/pdf",
    size_bytes:doc.size_bytes,
    filename:"DANFE-"+(clean(ctl.bling_invoice_number||j.bling_invoice_number,80)||accessKey.slice(-8))+".pdf",
    base64:doc.content,
    external_write:false,
    external_side_effect:false
  };
}

async function blingHubVitrineDispatchFiscalPreview(sb:any,sourceOrderIdRaw:any){
  const resolved=await blingHubResolveVitrineFiscalOrder(sb,sourceOrderIdRaw);
  if(!resolved.ok)return resolved;
  const sourceOrderId=resolved.source_order_id;
  const order=resolved.order;

  const [cfg,link,control,job,dispatchGate]=await Promise.all([
    sb.from("fiscal_runtime_config")
      .select("enabled,execution_mode,dispatch_gate_mode,require_fiscal_authorization_before_dispatch,dispatch_fiscal_canary_enabled,dispatch_fiscal_canary_armed_at,dispatch_fiscal_human_issue_enabled,dispatch_invoice_generate_enabled,dispatch_invoice_authorize_enabled,dispatch_invoice_canary_source_order_id")
      .eq("id",1).maybeSingle(),
    sb.from("bling_hub_entity_links_v2")
      .select("bling_id,status,identity_value,last_verified_at,metadata")
      .eq("source_system","vitrine_qx").eq("entity_type","order").eq("source_id",sourceOrderId).maybeSingle(),
    sb.from("order_fiscal_controls")
      .select("dispatch_fiscal_status,dispatch_fiscal_authorized_at,dispatch_fiscal_source,dispatch_fiscal_reason,bling_invoice_id,bling_invoice_number,sefaz_status,issued_at")
      .eq("order_id",order.id).maybeSingle(),
    sb.from("dispatch_fiscal_jobs")
      .select("id,status,attempts,external_side_effect,bling_order_id,bling_invoice_id,bling_invoice_number,access_key,sefaz_status,error_code,error_detail,created_at,updated_at,finished_at")
      .eq("order_id",order.id).eq("fiscal_version",1).maybeSingle(),
    sb.rpc("check_order_dispatch_fiscal_gate_v1",{p_order_id:order.id})
  ]);
  if(cfg.error)throw cfg.error;
  if(link.error)throw link.error;
  if(control.error)throw control.error;
  if(job.error)throw job.error;
  if(dispatchGate.error)throw dispatchGate.error;

  const f=cfg.data||{};
  const l=link.data||{};
  const ctl=control.data||{};
  const existingJob=job.data||null;
  const externalKey=clean(l?.identity_value,160);
  const blingOrderId=Number(l?.bling_id||existingJob?.bling_order_id||0)||null;
  let invoiceId=Number(ctl?.bling_invoice_id||existingJob?.bling_invoice_id||0)||null;
  let invoice:any=null;
  let invoiceLookup:any={performed:false,match_count:0,http_status:null};

  if(blingOrderId&&externalKey){
    const token=await blingHubOauth(sb);
    if(invoiceId){
      const detail=await blingHubGetNfe(sb,token,invoiceId);
      invoiceLookup={performed:true,by:"id",match_count:detail.ok?1:0,http_status:detail.status};
      if(detail.ok)invoice=detail.invoice;
    }else{
      const found=await blingHubFindNfeByExternalKey(sb,token,externalKey);
      invoiceLookup={performed:true,by:"numeroLoja",match_count:found.matches?.length||0,http_status:found.status};
      if(found.ok&&found.matches.length===1){
        invoiceId=Number(found.match?.id||0)||null;
        if(invoiceId){
          const detail=await blingHubGetNfe(sb,token,invoiceId);
          invoiceLookup={...invoiceLookup,detail_http_status:detail.status};
          if(detail.ok)invoice=detail.invoice;
        }
      }
    }
  }

  const hardBlockers:string[]=[];
  if(order.status!=="ready")hardBlockers.push("order_not_ready_for_fiscal_dispatch");
  if(l?.status!=="matched"||!blingOrderId)hardBlockers.push("bling_order_not_linked");
  if(!externalKey)hardBlockers.push("external_order_key_missing");
  if(invoiceLookup.performed&&invoiceLookup.match_count>1)hardBlockers.push("multiple_invoices_for_external_key");
  if(invoice?.situation?.failed)hardBlockers.push("invoice_terminal_state");

  const selectedCanary=uuid(f.dispatch_invoice_canary_source_order_id);
  const canarySelected=Boolean(selectedCanary&&selectedCanary===sourceOrderId);
  const canaryEnabled=f.dispatch_fiscal_canary_enabled===true;
  const canGenerate=hardBlockers.length===0
    && !invoiceId
    && canaryEnabled
    && f.dispatch_invoice_generate_enabled===true
    && canarySelected;
  const canAuthorize=hardBlockers.length===0
    && Boolean(invoiceId)
    && !invoice?.situation?.authorized
    && canaryEnabled
    && f.dispatch_invoice_authorize_enabled===true
    && canarySelected;

  const writeBlockers=[...hardBlockers];
  if(!canaryEnabled)writeBlockers.push("fiscal_dispatch_canary_disabled");
  if(!canarySelected)writeBlockers.push("fiscal_canary_order_not_selected");
  if(!invoiceId&&f.dispatch_invoice_generate_enabled!==true)writeBlockers.push("fiscal_generation_disabled");
  if(invoiceId&&!invoice?.situation?.authorized&&f.dispatch_invoice_authorize_enabled!==true)writeBlockers.push("fiscal_authorization_disabled");

  return {
    ok:true,
    source_order_id:sourceOrderId,
    canonical_order_id:order.id,
    canonical_order_number:order.order_number||null,
    order_status:order.status,
    bling_order_id:blingOrderId,
    external_key:externalKey||null,
    invoice_id:invoiceId,
    invoice,
    invoice_lookup:invoiceLookup,
    job:existingJob,
    dispatch_gate:dispatchGate.data||null,
    config:{
      enabled:Boolean(f.enabled),
      execution_mode:f.execution_mode||"off",
      dispatch_gate_mode:f.dispatch_gate_mode||"observe",
      canary_enabled:Boolean(f.dispatch_fiscal_canary_enabled),
      canary_armed_at:f.dispatch_fiscal_canary_armed_at||null,
      human_issue_enabled:Boolean(f.dispatch_fiscal_human_issue_enabled),
      generate_enabled:Boolean(f.dispatch_invoice_generate_enabled),
      authorize_enabled:Boolean(f.dispatch_invoice_authorize_enabled),
      canary_source_order_id:selectedCanary||null,
      canary_selected:canarySelected
    },
    hard_blockers:[...new Set(hardBlockers)],
    write_blockers:[...new Set(writeBlockers)],
    can_generate:canGenerate,
    can_authorize:canAuthorize,
    already_authorized:Boolean(invoice?.situation?.authorized),
    external_write:false,
    external_side_effect:false
  };
}
async function blingHubVitrineDispatchFiscalArm(sb:any,sourceOrderIdRaw:any){
  const preview=await blingHubVitrineDispatchFiscalPreview(sb,sourceOrderIdRaw);
  if(!preview.ok)return preview;
  if(preview.hard_blockers?.length){
    return {ok:false,error:"fiscal_dispatch_not_eligible",status:409,preview,external_write:false};
  }
  const now=new Date().toISOString();
  const update=await sb.from("fiscal_runtime_config").update({
    dispatch_fiscal_canary_enabled:true,
    dispatch_fiscal_canary_armed_at:now,
    dispatch_invoice_canary_source_order_id:preview.source_order_id,
    dispatch_invoice_generate_enabled:false,
    dispatch_invoice_authorize_enabled:false,
    dispatch_gate_mode:"observe",
    updated_at:now
  }).eq("id",1);
  if(update.error)throw update.error;
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"dispatch_fiscal_canary_armed",
    severity:"info",
    domain:"fiscal",
    details:{
      source_order_id:preview.source_order_id,
      canonical_order_id:preview.canonical_order_id,
      bling_order_id:preview.bling_order_id,
      external_write:false,
      make_used:false
    }
  });
  const refreshed=await blingHubVitrineDispatchFiscalPreview(sb,preview.source_order_id);
  return {ok:true,armed:true,preview:refreshed,external_write:false,external_side_effect:false};
}
async function blingHubVitrineDispatchFiscalDisarm(sb:any){
  const now=new Date().toISOString();
  const current=await sb.from("fiscal_runtime_config")
    .select("dispatch_invoice_canary_source_order_id")
    .eq("id",1).maybeSingle();
  if(current.error)throw current.error;
  const sourceOrderId=uuid(current.data?.dispatch_invoice_canary_source_order_id);
  const update=await sb.from("fiscal_runtime_config").update({
    dispatch_fiscal_canary_enabled:false,
    dispatch_fiscal_canary_armed_at:null,
    dispatch_invoice_canary_source_order_id:null,
    dispatch_invoice_generate_enabled:false,
    dispatch_invoice_authorize_enabled:false,
    dispatch_gate_mode:"observe",
    updated_at:now
  }).eq("id",1);
  if(update.error)throw update.error;
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"dispatch_fiscal_canary_disarmed",
    severity:"info",
    domain:"fiscal",
    details:{source_order_id:sourceOrderId,external_write:false,make_used:false}
  });
  return {ok:true,armed:false,source_order_id:sourceOrderId,external_write:false,external_side_effect:false};
}

async function blingHubVitrineDispatchFiscalHumanExecute(sb:any,sourceOrderIdRaw:any,confirmationRaw:any){
  const confirmation=clean(confirmationRaw,40).toUpperCase();
  if(confirmation!=="EMITIR_NFE"){
    return {ok:false,error:"fiscal_human_confirmation_required",status:409,external_write:false};
  }

  let preview=await blingHubVitrineDispatchFiscalPreview(sb,sourceOrderIdRaw);
  if(!preview.ok)return preview;
  if(preview.hard_blockers?.length){
    return {ok:false,error:"fiscal_dispatch_not_eligible",status:409,preview,external_write:false};
  }

  const selected=preview.config?.canary_enabled===true&&preview.config?.canary_selected===true;
  const productionEligible=preview.config?.human_issue_enabled===true
    && preview.config?.dispatch_gate_mode==="enforce";

  if(!selected&&!productionEligible){
    return {ok:false,error:"fiscal_human_issue_not_enabled",status:409,preview,external_write:false};
  }

  const now=new Date().toISOString();
  if(!selected){
    const claim=await sb.from("fiscal_runtime_config").update({
      dispatch_fiscal_canary_enabled:true,
      dispatch_fiscal_canary_armed_at:now,
      dispatch_invoice_canary_source_order_id:preview.source_order_id,
      dispatch_invoice_generate_enabled:true,
      dispatch_invoice_authorize_enabled:true,
      updated_at:now
    }).eq("id",1)
      .eq("dispatch_fiscal_human_issue_enabled",true)
      .eq("dispatch_gate_mode","enforce")
      .eq("dispatch_fiscal_canary_enabled",false)
      .select("id").maybeSingle();
    if(claim.error)throw claim.error;
    if(!claim.data){
      return {ok:false,error:"fiscal_operation_in_progress",status:409,external_write:false};
    }
  }else{
    const armed=await sb.from("fiscal_runtime_config").update({
      dispatch_invoice_generate_enabled:true,
      dispatch_invoice_authorize_enabled:true,
      updated_at:now
    }).eq("id",1)
      .eq("dispatch_fiscal_canary_enabled",true)
      .eq("dispatch_invoice_canary_source_order_id",preview.source_order_id)
      .select("id").maybeSingle();
    if(armed.error)throw armed.error;
    if(!armed.data){
      return {ok:false,error:"fiscal_operation_in_progress",status:409,external_write:false};
    }
  }

  preview=await blingHubVitrineDispatchFiscalPreview(sb,preview.source_order_id);
  if(preview.config?.canary_enabled!==true||preview.config?.canary_selected!==true){
    return {ok:false,error:"fiscal_operation_lock_lost",status:409,external_write:false};
  }

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"dispatch_fiscal_human_issue_confirmed",
    severity:"warning",
    domain:"fiscal",
    details:{
      source_order_id:preview.source_order_id,
      canonical_order_id:preview.canonical_order_id,
      bling_order_id:preview.bling_order_id,
      confirmation:"EMITIR_NFE",
      production_mode:productionEligible,
      external_write:false,
      make_used:false
    }
  });

  const result=await blingHubVitrineDispatchFiscalCanary(sb,preview.source_order_id);

  if(result?.authorized===true){
    const finishedAt=new Date().toISOString();
    const close=await sb.from("fiscal_runtime_config").update({
      dispatch_fiscal_canary_enabled:false,
      dispatch_fiscal_canary_armed_at:null,
      dispatch_invoice_generate_enabled:false,
      dispatch_invoice_authorize_enabled:false,
      dispatch_invoice_canary_source_order_id:null,
      dispatch_gate_mode:"enforce",
      updated_at:finishedAt
    }).eq("id",1);
    if(close.error)throw close.error;
    await sb.from("bling_hub_audit_v2").insert({
      event_type:productionEligible?"dispatch_fiscal_human_issue_authorized":"dispatch_fiscal_canary_passed",
      severity:"info",
      domain:"fiscal",
      details:{
        source_order_id:preview.source_order_id,
        canonical_order_id:preview.canonical_order_id,
        bling_invoice_id:result?.invoice?.id||null,
        production_mode:productionEligible,
        external_write:true,
        make_used:false
      }
    });
    return {...result,operation_closed:true,dispatch_gate_mode:"enforce",production_mode:productionEligible};
  }

  if(result?.pending===true||result?.generated===true){
    const keep=await sb.from("fiscal_runtime_config").update({
      dispatch_invoice_generate_enabled:false,
      dispatch_invoice_authorize_enabled:true,
      updated_at:new Date().toISOString()
    }).eq("id",1).eq("dispatch_invoice_canary_source_order_id",preview.source_order_id);
    if(keep.error)throw keep.error;
    return {...result,operation_closed:false,reconcile_only_next:true,production_mode:productionEligible};
  }

  const stop=await sb.from("fiscal_runtime_config").update({
    dispatch_fiscal_canary_enabled:false,
    dispatch_fiscal_canary_armed_at:null,
    dispatch_invoice_generate_enabled:false,
    dispatch_invoice_authorize_enabled:false,
    dispatch_invoice_canary_source_order_id:null,
    dispatch_gate_mode:"enforce",
    updated_at:new Date().toISOString()
  }).eq("id",1);
  if(stop.error)throw stop.error;
  return {...result,operation_closed:true,fail_closed:true,production_mode:productionEligible};
}

async function blingHubVitrineDispatchFiscalCanary(sb:any,sourceOrderIdRaw:any){
  let preview=await blingHubVitrineDispatchFiscalPreview(sb,sourceOrderIdRaw);
  if(!preview.ok)return preview;
  if(preview.hard_blockers?.length){
    return {ok:false,error:"fiscal_dispatch_not_eligible",status:409,preview,external_write:false};
  }

  const sourceOrderId=preview.source_order_id;
  const canonicalOrderId=preview.canonical_order_id;
  const externalKey=String(preview.external_key||"");
  const blingOrderId=Number(preview.bling_order_id||0);
  let invoiceId=Number(preview.invoice_id||0)||null;
  let invoice=preview.invoice||null;

  let job=preview.job||null;
  if(!job){
    const inserted=await sb.from("dispatch_fiscal_jobs").insert({
      order_id:canonicalOrderId,
      source_order_id:sourceOrderId,
      bling_order_id:blingOrderId,
      fiscal_version:1,
      idempotency_key:"dispatch-fiscal:"+canonicalOrderId+":v1",
      status:invoiceId?"generated":"held",
      external_side_effect:false,
      attempts:0,
      max_attempts:1,
      bling_invoice_id:invoiceId
    }).select("*").single();
    if(inserted.error){
      if(String(inserted.error.code)!=="23505")throw inserted.error;
      const again=await sb.from("dispatch_fiscal_jobs").select("*")
        .eq("order_id",canonicalOrderId).eq("fiscal_version",1).single();
      if(again.error)throw again.error;
      job=again.data;
    }else job=inserted.data;
  }

  if(invoice?.situation?.authorized){
    const marked=await sb.rpc("mark_order_dispatch_fiscal_authorized_v1",{
      p_order_id:canonicalOrderId,
      p_source:"bling_nfe_reconcile",
      p_bling_invoice_id:invoiceId,
      p_bling_invoice_number:invoice.numero,
      p_sefaz_status:invoice.situation.label,
      p_authorized_at:new Date().toISOString()
    });
    if(marked.error)throw marked.error;
    await sb.from("dispatch_fiscal_jobs").update({
      status:"authorized",
      bling_invoice_id:invoiceId,
      bling_invoice_number:invoice.numero,
      access_key:invoice.chaveAcesso,
      sefaz_status:invoice.situation.label,
      finished_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq("id",job.id);
    return {ok:true,authorized:true,reconciled:true,invoice,dispatch_gate:marked.data,external_write:false};
  }

  const token=await blingHubOauth(sb);

  if(!invoiceId){
    if(preview.can_generate!==true){
      return {ok:false,error:"fiscal_generation_gate_closed",status:409,preview,external_write:false};
    }
    if(Number(job.attempts||0)>=1){
      return {ok:false,error:"fiscal_generation_already_attempted",status:409,preview,external_write:false};
    }

    // Reconcile immediately before the irreversible POST.
    const before=await blingHubFindNfeByExternalKey(sb,token,externalKey);
    if(!before.ok){
      return {ok:false,error:"invoice_reconcile_http_"+before.status,status:409,preview,external_write:false};
    }
    if(before.matches.length>1){
      await sb.from("dispatch_fiscal_jobs").update({
        status:"review_required",error_code:"multiple_invoices_for_external_key",
        error_detail:"More than one NF-e uses the same numeroLoja",updated_at:new Date().toISOString()
      }).eq("id",job.id);
      return {ok:false,error:"multiple_invoices_for_external_key",status:409,external_write:false};
    }
    if(before.matches.length===1){
      invoiceId=Number(before.match?.id||0)||null;
    }else{
      await sb.from("dispatch_fiscal_jobs").update({
        status:"generating",attempts:1,updated_at:new Date().toISOString()
      }).eq("id",job.id);

      const generated=await blingHubPostOnce(
        sb,token,
        "/pedidos/vendas/"+encodeURIComponent(String(blingOrderId))+"/gerar-nfe"
      );
      const generatedId=Number(generated.data?.idNotaFiscal||generated.data?.data?.idNotaFiscal||0)||null;
      if(generated.ok&&generatedId){
        invoiceId=generatedId;
      }else{
        // Never blindly repeat the POST. Reconcile by immutable numeroLoja.
        await sleep(1000);
        const recovery=await blingHubFindNfeByExternalKey(sb,token,externalKey);
        if(recovery.ok&&recovery.matches.length===1){
          invoiceId=Number(recovery.match?.id||0)||null;
        }
        if(!invoiceId){
          await sb.from("dispatch_fiscal_jobs").update({
            status:"review_required",external_side_effect:generated.ok===true||generated.uncertain===true,
            error_code:generated.uncertain?"invoice_generation_uncertain":"invoice_generation_failed",
            error_detail:generated.error||("HTTP "+generated.status),
            updated_at:new Date().toISOString()
          }).eq("id",job.id);
          return {
            ok:false,
            error:generated.uncertain?"invoice_generation_uncertain":"invoice_generation_failed",
            status:409,
            http_status:generated.status,
            provider_details:generated.provider_details||[],
            external_write:generated.uncertain===true
          };
        }
      }
    }

    const detail=await blingHubGetNfe(sb,token,invoiceId);
    invoice=detail.ok?detail.invoice:null;
    await sb.from("dispatch_fiscal_jobs").update({
      status:"generated",external_side_effect:true,bling_invoice_id:invoiceId,
      bling_invoice_number:invoice?.numero||null,access_key:invoice?.chaveAcesso||null,
      sefaz_status:invoice?.situation?.label||null,error_code:null,error_detail:null,
      updated_at:new Date().toISOString()
    }).eq("id",job.id);
    await sb.from("bling_hub_audit_v2").insert({
      event_type:"dispatch_nfe_generated",
      severity:"info",domain:"fiscal",
      details:{
        source_order_id:sourceOrderId,canonical_order_id:canonicalOrderId,
        bling_order_id:blingOrderId,bling_invoice_id:invoiceId,
        external_write:true,make_used:false
      }
    });
  }

  if(!invoice){
    const detail=await blingHubGetNfe(sb,token,invoiceId);
    if(detail.ok)invoice=detail.invoice;
  }

  if(invoice?.situation?.authorized){
    const marked=await sb.rpc("mark_order_dispatch_fiscal_authorized_v1",{
      p_order_id:canonicalOrderId,p_source:"bling_nfe_verified",
      p_bling_invoice_id:invoiceId,p_bling_invoice_number:invoice.numero,
      p_sefaz_status:invoice.situation.label,p_authorized_at:new Date().toISOString()
    });
    if(marked.error)throw marked.error;
    await sb.from("dispatch_fiscal_jobs").update({
      status:"authorized",external_side_effect:true,bling_invoice_id:invoiceId,
      bling_invoice_number:invoice.numero,access_key:invoice.chaveAcesso,
      sefaz_status:invoice.situation.label,finished_at:new Date().toISOString(),
      error_code:null,error_detail:null,updated_at:new Date().toISOString()
    }).eq("id",job.id);
    return {ok:true,authorized:true,invoice,dispatch_gate:marked.data,external_write:true};
  }

  // If authorization was already sent in an earlier call, only reconcile; never send twice.
  const freshJob=await sb.from("dispatch_fiscal_jobs").select("status,external_side_effect")
    .eq("id",job.id).single();
  if(freshJob.error)throw freshJob.error;
  if(freshJob.data?.status==="authorizing"){
    return {
      ok:true,authorized:false,pending:true,invoice,
      message:"authorization_already_sent_reconcile_later",
      external_write:false
    };
  }

  preview=await blingHubVitrineDispatchFiscalPreview(sb,sourceOrderId);
  if(preview.can_authorize!==true){
    return {
      ok:true,authorized:false,generated:true,invoice,
      blocked:"fiscal_authorization_gate_closed",
      preview,external_write:false
    };
  }

  await sb.from("dispatch_fiscal_jobs").update({
    status:"authorizing",external_side_effect:true,updated_at:new Date().toISOString()
  }).eq("id",job.id);

  const sent=await blingHubPostOnce(
    sb,token,
    "/nfe/"+encodeURIComponent(String(invoiceId))+"/enviar?enviarEmail=false"
  );

  await sleep(1200);
  const verified=await blingHubGetNfe(sb,token,invoiceId);
  if(verified.ok)invoice=verified.invoice;

  if(invoice?.situation?.authorized){
    const marked=await sb.rpc("mark_order_dispatch_fiscal_authorized_v1",{
      p_order_id:canonicalOrderId,p_source:"bling_nfe_canary",
      p_bling_invoice_id:invoiceId,p_bling_invoice_number:invoice.numero,
      p_sefaz_status:invoice.situation.label,p_authorized_at:new Date().toISOString()
    });
    if(marked.error)throw marked.error;
    await sb.from("dispatch_fiscal_jobs").update({
      status:"authorized",external_side_effect:true,bling_invoice_id:invoiceId,
      bling_invoice_number:invoice.numero,access_key:invoice.chaveAcesso,
      sefaz_status:invoice.situation.label,finished_at:new Date().toISOString(),
      error_code:null,error_detail:null,updated_at:new Date().toISOString()
    }).eq("id",job.id);
    await sb.from("bling_hub_audit_v2").insert({
      event_type:"dispatch_nfe_authorized",
      severity:"info",domain:"fiscal",
      details:{
        source_order_id:sourceOrderId,canonical_order_id:canonicalOrderId,
        bling_order_id:blingOrderId,bling_invoice_id:invoiceId,
        situation:invoice.situation,external_write:true,make_used:false
      }
    });
    return {ok:true,authorized:true,invoice,dispatch_gate:marked.data,external_write:true};
  }

  if(sent.ok||sent.uncertain||invoice?.situation?.pending){
    await sb.from("dispatch_fiscal_jobs").update({
      status:"authorizing",external_side_effect:true,bling_invoice_id:invoiceId,
      bling_invoice_number:invoice?.numero||null,access_key:invoice?.chaveAcesso||null,
      sefaz_status:invoice?.situation?.label||null,
      error_code:sent.uncertain?"invoice_authorization_result_uncertain":null,
      error_detail:sent.uncertain?sent.error:null,updated_at:new Date().toISOString()
    }).eq("id",job.id);
    return {
      ok:true,authorized:false,pending:true,invoice,
      message:sent.uncertain?"authorization_result_uncertain":"authorization_pending",
      external_write:true
    };
  }

  await sb.from("dispatch_fiscal_jobs").update({
    status:"review_required",external_side_effect:true,bling_invoice_id:invoiceId,
    bling_invoice_number:invoice?.numero||null,access_key:invoice?.chaveAcesso||null,
    sefaz_status:invoice?.situation?.label||null,
    error_code:"invoice_authorization_failed",
    error_detail:sent.error||("HTTP "+sent.status),updated_at:new Date().toISOString()
  }).eq("id",job.id);
  return {
    ok:false,error:"invoice_authorization_failed",status:409,
    http_status:sent.status,invoice,provider_details:sent.provider_details||[],
    external_write:true
  };
}

async function blingHubVitrineDispatchFiscalGate(sb:any,sourceOrderIdRaw:any){
  const resolved=await blingHubResolveVitrineFiscalOrder(sb,sourceOrderIdRaw);
  if(!resolved.ok)return resolved;
  const gate=await sb.rpc("check_order_dispatch_fiscal_gate_v1",{p_order_id:resolved.order.id});
  if(gate.error)throw gate.error;
  return {
    ...(gate.data||{ok:false,error:"fiscal_dispatch_gate_unavailable",allowed:false}),
    source_order_id:resolved.source_order_id,
    canonical_order_id:resolved.order.id,
    canonical_order_number:resolved.order.order_number||null,
    external_write:false
  };
}

async function blingHubVitrineFiscalStatus(sb:any,sourceOrderIdRaw:any){
  const resolved=await blingHubResolveVitrineFiscalOrder(sb,sourceOrderIdRaw);
  if(!resolved.ok)return resolved;
  const order=resolved.order;

  const refresh=await sb.rpc("sync_vitrine_order_fiscal_delivery_v1",{p_order_id:order.id});
  if(refresh.error)throw refresh.error;

  const [control,preview,cfg,dispatchGate]=await Promise.all([
    sb.from("order_fiscal_controls")
      .select("delivery_status,delivery_confirmed_at,payment_status,payment_method,payment_source,settled_amount,payment_confirmed_at,fiscal_status,fiscal_block_reason,fiscal_ready_at,fiscal_version,bling_invoice_id,bling_invoice_number,sefaz_status,issued_at,dispatch_fiscal_status,dispatch_fiscal_authorized_at,dispatch_fiscal_source,dispatch_fiscal_reason")
      .eq("order_id",order.id).maybeSingle(),
    sb.rpc("preview_bling_invoice_eligibility_v1",{p_order_id:order.id}),
    sb.from("fiscal_runtime_config")
      .select("enabled,execution_mode,bling_invoice_prepare_enabled,bling_invoice_send_enabled,require_delivery_confirmation,require_payment_confirmation,canary_percent,dispatch_gate_mode,require_fiscal_authorization_before_dispatch,dispatch_fiscal_canary_enabled,dispatch_fiscal_canary_armed_at,dispatch_fiscal_human_issue_enabled,dispatch_invoice_generate_enabled,dispatch_invoice_authorize_enabled,dispatch_invoice_canary_source_order_id")
      .eq("id",1).maybeSingle(),
    sb.rpc("check_order_dispatch_fiscal_gate_v1",{p_order_id:order.id})
  ]);
  if(control.error)throw control.error;
  if(preview.error)throw preview.error;
  if(cfg.error)throw cfg.error;
  if(dispatchGate.error)throw dispatchGate.error;

  const c=control.data||{};
  const f=cfg.data||{};
  let dispatchPreview:any=null;
  if(order.status==="ready"){
    try{
      dispatchPreview=await blingHubVitrineDispatchFiscalPreview(sb,resolved.source_order_id);
    }catch(e){
      dispatchPreview={
        ok:false,error:"fiscal_dispatch_preview_unavailable",
        detail:clean((e as Error)?.message||e,240),
        external_write:false,external_side_effect:false
      };
    }
  }
  return {
    ok:true,
    source_order_id:resolved.source_order_id,
    canonical_order_id:order.id,
    canonical_order_number:order.order_number||null,
    order_status:order.status,
    total_cents:Math.round(Number(order.total||0)*100),
    delivery_status:c.delivery_status||"pending",
    delivery_confirmed_at:c.delivery_confirmed_at||null,
    payment_status:c.payment_status||"pending",
    payment_method:c.payment_method||order.payment_method||"",
    payment_source:c.payment_source||null,
    settled_amount_cents:c.settled_amount==null?null:Math.round(Number(c.settled_amount||0)*100),
    payment_confirmed_at:c.payment_confirmed_at||null,
    fiscal_status:c.fiscal_status||"blocked",
    fiscal_block_reason:c.fiscal_block_reason||null,
    fiscal_ready_at:c.fiscal_ready_at||null,
    fiscal_version:Number(c.fiscal_version||1),
    bling_invoice_id:c.bling_invoice_id||null,
    bling_invoice_number:c.bling_invoice_number||null,
    sefaz_status:c.sefaz_status||null,
    issued_at:c.issued_at||null,
    eligible:Boolean(preview.data?.eligible),
    config:{
      enabled:Boolean(f.enabled),
      execution_mode:f.execution_mode||"off",
      prepare_enabled:Boolean(f.bling_invoice_prepare_enabled),
      send_enabled:Boolean(f.bling_invoice_send_enabled),
      require_delivery_confirmation:f.require_delivery_confirmation!==false,
      require_payment_confirmation:f.require_payment_confirmation!==false,
      canary_percent:Number(f.canary_percent||0),
      dispatch_gate_mode:f.dispatch_gate_mode||"observe",
      require_fiscal_authorization_before_dispatch:f.require_fiscal_authorization_before_dispatch!==false,
      dispatch_fiscal_canary_enabled:Boolean(f.dispatch_fiscal_canary_enabled),
      dispatch_fiscal_canary_armed_at:f.dispatch_fiscal_canary_armed_at||null,
      dispatch_fiscal_human_issue_enabled:Boolean(f.dispatch_fiscal_human_issue_enabled),
      dispatch_invoice_generate_enabled:Boolean(f.dispatch_invoice_generate_enabled),
      dispatch_invoice_authorize_enabled:Boolean(f.dispatch_invoice_authorize_enabled),
      dispatch_invoice_canary_source_order_id:uuid(f.dispatch_invoice_canary_source_order_id)||null
    },
    dispatch_gate:dispatchGate.data||null,
    dispatch_preview:dispatchPreview,
    invoice_issue_available:Boolean(f.enabled&&f.bling_invoice_prepare_enabled&&f.bling_invoice_send_enabled),
    external_write:false,
    external_side_effect:false
  };
}
async function blingHubVitrineConfirmFiscalPayment(sb:any,sourceOrderIdRaw:any,paymentRaw:any){
  const resolved=await blingHubResolveVitrineFiscalOrder(sb,sourceOrderIdRaw);
  if(!resolved.ok)return resolved;
  const order=resolved.order;

  if(order.status!=="delivered"){
    return {ok:false,error:"delivery_required_before_payment_confirmation",status:409,external_write:false};
  }

  const delivery=await sb.rpc("sync_vitrine_order_fiscal_delivery_v1",{p_order_id:order.id});
  if(delivery.error)throw delivery.error;

  const method=blingHubFiscalPaymentMethod(paymentRaw||order.payment_method);
  const amount=Number(order.total||0);
  if(!Number.isFinite(amount)||amount<0){
    return {ok:false,error:"invalid_canonical_order_total",status:409,external_write:false};
  }

  const confirm=await sb.rpc("confirm_order_payment_v1",{
    p_order_id:order.id,
    p_payment_method:method,
    p_payment_source:"vitrine_admin",
    p_settled_amount:amount,
    p_confirmed_at:new Date().toISOString()
  });
  if(confirm.error)throw confirm.error;
  if(confirm.data?.ok===false){
    return {ok:false,error:clean(confirm.data?.error||"payment_confirmation_failed",120),status:409,external_write:false};
  }

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"fiscal_payment_confirmed_from_vitrine",
    severity:"info",
    domain:"fiscal",
    details:{
      source_order_id:resolved.source_order_id,
      canonical_order_id:order.id,
      payment_method:method,
      total_cents:Math.round(amount*100),
      external_write:false,
      make_used:false
    }
  });

  return await blingHubVitrineFiscalStatus(sb,resolved.source_order_id);
}

async function blingHubReadinessExtended(sb:any){
  const r=await sb.rpc("bling_hub_readiness_v2");
  if(r.error)throw r.error;
  const [links,customerLinks,orderLinks,webhookInbox,fiscalConfig,fiscalControls,fiscalJobs,dispatchFiscalJobs,runtimeMeta]=await Promise.all([
    sb.from("bling_hub_entity_links_v2").select("status").eq("source_system","vitrine_qx").eq("entity_type","product").limit(5000),
    sb.from("bling_hub_entity_links_v2").select("status").eq("source_system","canonical_ssbes").eq("entity_type","customer").limit(5000),
    sb.from("bling_hub_entity_links_v2").select("status").eq("source_system","vitrine_qx").eq("entity_type","order").limit(5000),
    sb.from("bling_webhook_inbox_v2").select("status").limit(5000),
    sb.from("fiscal_runtime_config").select("enabled,execution_mode,bling_invoice_prepare_enabled,bling_invoice_send_enabled,require_delivery_confirmation,require_payment_confirmation,canary_percent,dispatch_gate_mode,require_fiscal_authorization_before_dispatch,dispatch_fiscal_canary_enabled,dispatch_fiscal_canary_armed_at,dispatch_fiscal_human_issue_enabled,dispatch_invoice_generate_enabled,dispatch_invoice_authorize_enabled,dispatch_invoice_canary_source_order_id").eq("id",1).maybeSingle(),
    sb.from("order_fiscal_controls").select("fiscal_status").limit(5000),
    sb.from("fiscal_issue_jobs").select("status,external_side_effect").limit(5000),
    sb.from("dispatch_fiscal_jobs").select("status,external_side_effect").limit(5000),
    sb.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle()
  ]);
  if(links.error)throw links.error;
  if(customerLinks.error)throw customerLinks.error;
  if(orderLinks.error)throw orderLinks.error;
  if(webhookInbox.error)throw webhookInbox.error;
  if(fiscalConfig.error)throw fiscalConfig.error;
  if(fiscalControls.error)throw fiscalControls.error;
  if(fiscalJobs.error)throw fiscalJobs.error;
  if(dispatchFiscalJobs.error)throw dispatchFiscalJobs.error;
  if(runtimeMeta.error)throw runtimeMeta.error;
  const counts:any={total:0,matched:0,not_found:0,ambiguous:0,review_required:0,unresolved:0,inactive:0};
  const customerCounts:any={total:0,matched:0,not_found:0,ambiguous:0,review_required:0,unresolved:0,inactive:0};
  const orderCounts:any={total:0,matched:0,not_found:0,ambiguous:0,review_required:0,unresolved:0,inactive:0};
  const webhookCounts:any={total:0,held:0,received:0,processing:0,processed:0,ignored:0,review_required:0,retry:0,failed:0};
  const fiscalCounts:any={total:0,blocked:0,ready:0,queued:0,issued:0,review_required:0,cancelled:0};
  const fiscalJobCounts:any={total:0,held:0,ready:0,processing:0,issued:0,review_required:0,error:0,cancelled:0,external_side_effect:0};
  const dispatchFiscalJobCounts:any={total:0,held:0,ready:0,generating:0,generated:0,authorizing:0,authorized:0,review_required:0,error:0,cancelled:0,external_side_effect:0};
  for(const row of links.data||[]){counts.total++;counts[row.status]=(counts[row.status]||0)+1;}
  for(const row of customerLinks.data||[]){customerCounts.total++;customerCounts[row.status]=(customerCounts[row.status]||0)+1;}
  for(const row of orderLinks.data||[]){orderCounts.total++;orderCounts[row.status]=(orderCounts[row.status]||0)+1;}
  for(const row of webhookInbox.data||[]){webhookCounts.total++;webhookCounts[row.status]=(webhookCounts[row.status]||0)+1;}
  for(const row of fiscalControls.data||[]){fiscalCounts.total++;fiscalCounts[row.fiscal_status]=(fiscalCounts[row.fiscal_status]||0)+1;}
  for(const row of fiscalJobs.data||[]){
    fiscalJobCounts.total++;
    fiscalJobCounts[row.status]=(fiscalJobCounts[row.status]||0)+1;
    if(row.external_side_effect===true)fiscalJobCounts.external_side_effect++;
  }
  for(const row of dispatchFiscalJobs.data||[]){
    dispatchFiscalJobCounts.total++;
    dispatchFiscalJobCounts[row.status]=(dispatchFiscalJobCounts[row.status]||0)+1;
    if(row.external_side_effect===true)dispatchFiscalJobCounts.external_side_effect++;
  }
  const fiscalReadiness={
    config:fiscalConfig.data||{
      enabled:false,execution_mode:"off",bling_invoice_prepare_enabled:false,bling_invoice_send_enabled:false,
      require_delivery_confirmation:true,require_payment_confirmation:true,canary_percent:0,
      dispatch_gate_mode:"observe",require_fiscal_authorization_before_dispatch:true,
      dispatch_fiscal_canary_enabled:false,dispatch_fiscal_canary_armed_at:null,
      dispatch_fiscal_human_issue_enabled:false,
      dispatch_invoice_generate_enabled:false,dispatch_invoice_authorize_enabled:false,
      dispatch_invoice_canary_source_order_id:null
    },
    controls:fiscalCounts,
    jobs:fiscalJobCounts,
    dispatch_jobs:dispatchFiscalJobCounts,
    safe_off:!(fiscalConfig.data?.enabled)
      && !(fiscalConfig.data?.bling_invoice_prepare_enabled)
      && !(fiscalConfig.data?.bling_invoice_send_enabled)
      && !(fiscalConfig.data?.dispatch_fiscal_canary_enabled)
      && !(fiscalConfig.data?.dispatch_fiscal_human_issue_enabled)
      && !(fiscalConfig.data?.dispatch_invoice_generate_enabled)
      && !(fiscalConfig.data?.dispatch_invoice_authorize_enabled)
      && fiscalJobCounts.external_side_effect===0
      && dispatchFiscalJobCounts.external_side_effect===0
  };
  return {
    ...(r.data||{}),
    product_links:counts,
    customer_links:customerCounts,
    order_links:orderCounts,
    order_rollout:runtimeMeta.data?.metadata?.order_rollout||{state:"unknown"},
    order_status_catalog:runtimeMeta.data?.metadata?.order_status_catalog||{state:"unknown",status_updates_enabled:false},
    webhook_inbox:webhookCounts,
    fiscal_readiness:fiscalReadiness
  };
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
async function blingHubFinanceAuthorizedUser(sb:any,req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false,status:401,error:"finance_auth_required"};
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  if(userError||!userData?.user?.id)return {ok:false,status:401,error:"finance_session_invalid"};
  const {data:admin,error:adminError}=await sb.from("admin_users")
    .select("role,is_active")
    .eq("user_id",userData.user.id)
    .maybeSingle();
  if(adminError)return {ok:false,status:500,error:"finance_admin_lookup_failed"};
  if(!admin?.is_active)return {ok:false,status:403,error:"finance_admin_not_authorized"};
  if(admin.role!=="owner")return {ok:false,status:403,error:"finance_owner_required"};
  return {ok:true,status:200,user_id:userData.user.id,role:admin.role};
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
function blingHubProviderDetails(data:any){
  return Array.isArray(data?.error?.fields)
    ? data.error.fields.slice(0,20).map((x:any)=>({
        field:clean(x?.field||x?.name||x?.path||x?.element||x?.namespace,120),
        message:clean(x?.message||x?.description||x?.error||x?.msg||(x?.code!=null?String(x.code):""),240)
      }))
    : [];
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
      const providerDetails=blingHubProviderDetails(data);
      if(!retryable||attempt===4)return {ok:false,status:r.status,error:lastError,provider_details:providerDetails,provider_error:clean(JSON.stringify(data?.error||data||{}),1600)};
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


function blingHubNfeB64(s:string){const b=atob(s),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o}
async function blingHubNfeGunzip(s:string){const ds=new DecompressionStream("gzip");return await new Response(new Blob([blingHubNfeB64(s)]).stream().pipeThrough(ds)).text()}
function blingHubNfeDec(s:string){return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#x([0-9a-f]+);/gi,(_:string,h:string)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_:string,d:string)=>String.fromCodePoint(parseInt(d,10)))}
function blingHubNfeTag(b:string,n:string){const m=b.match(new RegExp("<(?:\\w+:)?"+n+"\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?"+n+">","i"));return m?blingHubNfeDec(m[1]).trim():""}
function blingHubNfeBlock(b:string,n:string){const m=b.match(new RegExp("<(?:\\w+:)?"+n+"\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?"+n+">","i"));return m?m[0]:""}
function blingHubNfeBlocks(b:string,n:string){return [...b.matchAll(new RegExp("<(?:\\w+:)?"+n+"\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?"+n+">","gi"))].map((m:any)=>m[0])}
function blingHubNfeAttr(b:string,n:string){const h=b.match(/^<[^>]+>/)?.[0]||"",m=h.match(new RegExp("\\b"+n+"=[\"']([^\"']+)[\"']","i"));return m?blingHubNfeDec(m[1]):""}
function blingHubNfeGtin(v:any){const d=blingHubDigits(v);return [8,12,13,14].includes(d.length)?d:""}
function blingHubNfeParse(xml:string){
  const inf=blingHubNfeBlock(xml,"infNFe")||xml,ide=blingHubNfeBlock(inf,"ide"),emit=blingHubNfeBlock(inf,"emit"),dest=blingHubNfeBlock(inf,"dest"),prot=blingHubNfeBlock(xml,"protNFe");
  const dk=blingHubDigits(blingHubNfeTag(prot,"chNFe")||blingHubNfeAttr(inf,"Id").replace(/^NFe/i,"")),cs=Number(blingHubNfeTag(blingHubNfeBlock(prot,"infProt")||prot,"cStat")||0),rc=blingHubDigits(blingHubNfeTag(dest,"CNPJ")),rf=blingHubDigits(blingHubNfeTag(dest,"CPF"));
  const items=blingHubNfeBlocks(inf,"det").map((det:string)=>{const p=blingHubNfeBlock(det,"prod"),ic=blingHubNfeBlock(blingHubNfeBlock(det,"imposto"),"ICMS"),n=blingHubDigits(blingHubNfeTag(p,"NCM")).slice(0,8),c=blingHubDigits(blingHubNfeTag(p,"CEST")).slice(0,7),ot=blingHubNfeTag(ic,"orig"),o=/^\d$/.test(ot)?Number(ot):null,ct=blingHubDigits(blingHubNfeTag(ic,"CST")).slice(0,3),sn=blingHubDigits(blingHubNfeTag(ic,"CSOSN")).slice(0,4);return {item_number:clean(blingHubNfeAttr(det,"nItem"),20),commercial_gtin:blingHubNfeGtin(blingHubNfeTag(p,"cEAN")),tax_gtin:blingHubNfeGtin(blingHubNfeTag(p,"cEANTrib")),description:clean(blingHubNfeTag(p,"xProd"),500),ncm:n.length===8?n:null,cest:c.length===7?c:null,origin_code:o,cfop:blingHubDigits(blingHubNfeTag(p,"CFOP")).slice(0,4)||null,tax_code:ct?"CST:"+ct:sn?"CSOSN:"+sn:null}});
  return {document_key:dk.length===44?dk:"",cstat:cs,issued_at:clean(blingHubNfeTag(ide,"dhEmi")||blingHubNfeTag(ide,"dEmi"),50)||null,supplier_document:blingHubDigits(blingHubNfeTag(emit,"CNPJ")||blingHubNfeTag(emit,"CPF"))||null,supplier_name:clean(blingHubNfeTag(emit,"xNome"),180)||null,recipient_kind:rc?"CNPJ":rf?"CPF":"unknown",items};
}
async function blingHubNfeSha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function blingHubNfeMonth(v:any){const p=String(v).slice(0,7).split("-").map(Number),y=p[0],m=p[1],s=String(y).padStart(4,"0")+"-"+String(m).padStart(2,"0")+"-01",nx=m===12?new Date(Date.UTC(y+1,0,1)):new Date(Date.UTC(y,m,1)),e=new Date(nx.getTime()-86400000);return {start:s,end:String(e.getUTCFullYear()).padStart(4,"0")+"-"+String(e.getUTCMonth()+1).padStart(2,"0")+"-"+String(e.getUTCDate()).padStart(2,"0")}}
function blingHubNfePrev(v:any){const p=String(v).slice(0,7).split("-").map(Number),d=new Date(Date.UTC(p[0],p[1]-2,1));return String(d.getUTCFullYear()).padStart(4,"0")+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-01"}
async function blingHubNfeXml(sb:any,t:string,k:string){await blingHubReserveSlot(sb);const r=await fetch(BLING_API_BASE+"/nfe/documento/"+encodeURIComponent(k)+"?formato=xml",{headers:{Authorization:"Bearer "+t,Accept:"application/json","enable-jwt":"1"},signal:AbortSignal.timeout(25000)}),raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}return {ok:r.ok,status:r.status,data}}
async function blingHubNfeRefresh(sb:any){const ns=["refresh_product_fiscal_candidates_r0_3","refresh_product_fiscal_evidence_quality_v1","refresh_product_fiscal_rule_integrity_v1","refresh_product_fiscal_observed_conflicts_v1","refresh_product_fiscal_origin_consensus_v1","refresh_product_fiscal_review_state_v1","reconcile_product_fiscal_strict_validation_v1"],out:any={};for(const n of ns){const q=await sb.rpc(n);out[n]=q.error?{ok:false,error:clean(q.error.message,300)}:{ok:true,result:q.data}}return out}

async function blingHubNfeIngestDetail(sb:any,row:any,detail:any){
  const S="bling_nfe_entry_xml",sid=clean(row?.id,80)||null,d=detail?.data&&typeof detail.data==="object"?detail.data:{},dk=blingHubDigits(d?.chaveAcesso||row?.chaveAcesso);
  if(dk.length!==44)throw new Error("detail_access_key_missing");
  const items=Array.isArray(d?.itens)?d.itens:[],gtins=[...new Set(items.map((i:any)=>blingHubNfeGtin(i?.gtin)).filter(Boolean))] as string[],pm=new Map<string,any>();
  if(gtins.length){const q=await sb.from("products").select("id,gtin,name").eq("is_active",true).in("gtin",gtins);if(q.error)throw q.error;for(const x of q.data||[])pm.set(String(x.gtin),x)}
  const groups=new Map<string,any>();let matched=0,unmatched=0;
  for(const i of items){
    const gtin=blingHubNfeGtin(i?.gtin),pr=pm.get(gtin);if(!pr){unmatched++;continue}matched++;
    const ncm=blingHubDigits(i?.classificacaoFiscal).slice(0,8)||null,cest=blingHubDigits(i?.cest).slice(0,7)||null,originRaw=Number(i?.origem),origin=Number.isInteger(originRaw)&&originRaw>=0&&originRaw<=8?originRaw:null,cfop=blingHubDigits(i?.cfop).slice(0,4)||null;
    const key=[pr.id,ncm||"",cest||"",origin??"",cfop||""].join("|"),g=groups.get(key)||{product_id:pr.id,gtin:pr.gtin,ncm,cest,origin_code:origin,cfop,description:clean(i?.descricao,500),codes:[]};g.codes.push(clean(i?.codigo,120));groups.set(key,g);
  }
  const issued=clean(d?.dataEmissao||d?.dataOperacao,50)||null,supplierDoc=blingHubDigits(d?.contato?.numeroDocumento||d?.contato?.documento||d?.contato?.cpfCnpj)||null,supplierName=clean(d?.contato?.nome,180)||null;
  const ev=[...groups.values()].map((g:any)=>({evidence_key:["company_purchase_bling_nfe_detail",dk,g.product_id,g.ncm||"none",g.cest||"none",g.origin_code??"none"].join(":"),product_id:g.product_id,evidence_type:"company_purchase_bling_nfe_detail",source_name:"NF-e de entrada cadastrada no Bling",document_key:dk,supplier_document:supplierDoc,gtin:g.gtin,ncm:g.ncm,cest:g.cest,origin_code:g.origin_code,cfop:g.cfop,tax_code:null,fiscal_description:g.description,evidence_confidence:0.93,observed_at:issued,evidence_payload:{source:"bling_api_nfe_detail",bling_nfe_id:sid,recipient_scope:"company_cnpj_registered_entry",matched_via:"gtin_exact",source_item_codes:g.codes,raw_xml_stored:false,external_write:false,usage_policy:"Fiscal fields from registered Bling entry document; validate against current MT legal rule before external write"}}));
  if(ev.length){const q=await sb.from("product_fiscal_evidence").upsert(ev,{onConflict:"evidence_key"});if(q.error)throw q.error}
  await sb.from("fiscal_source_documents").upsert({source:S,source_document_id:sid,document_key:dk,issued_at:issued,status:"processed",item_count:items.length,matched_product_count:new Set([...groups.values()].map((x:any)=>x.product_id)).size,unmatched_item_count:unmatched,content_sha256:null,last_error:"xml_endpoint_unavailable_used_registered_detail",metadata:{bling_nfe_id:sid,supplier_name:supplierName,evidence_rows:ev.length,matched_items:matched,unmatched_items:unmatched,source_mode:"registered_nfe_detail",external_write:false,raw_xml_storage:false},processed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"source,document_key"});
  return {skipped:false,evidence_rows:ev.length,matched_items:matched,unmatched_items:unmatched,source_mode:"registered_nfe_detail"};
}
async function blingHubNfeOne(sb:any,t:string,row:any){
  const S="bling_nfe_entry_xml";let k=blingHubDigits(row?.chaveAcesso);const sid=clean(row?.id,80)||null;
  if(k.length!==44&&sid){const d=await blingHubGet(sb,t,"/nfe/"+encodeURIComponent(sid));if(d.ok)k=blingHubDigits(d.data?.data?.chaveAcesso)}
  if(k.length!==44)return {skipped:true,reason:"missing_access_key"};
  const ex=await sb.from("fiscal_source_documents").select("status").eq("source",S).eq("document_key",k).maybeSingle();if(ex.error)throw ex.error;if(["processed","skipped"].includes(ex.data?.status))return {skipped:true,reason:"already_processed"};
  const dl=await blingHubNfeXml(sb,t,k);if(!dl.ok){
    if(sid){
      const detail=await blingHubGet(sb,t,"/nfe/"+encodeURIComponent(sid));
      if(detail.ok&&Array.isArray(detail.data?.data?.itens))return await blingHubNfeIngestDetail(sb,row,detail.data);
    }
    await sb.from("fiscal_source_documents").upsert({source:S,source_document_id:sid,document_key:k,status:dl.status===404?"unavailable":"error",last_error:"bling_document_http_"+dl.status,metadata:{bling_nfe_id:sid,external_write:false,raw_xml_storage:false},processed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"source,document_key"});return {skipped:true,reason:"document_http_"+dl.status}
  }
  const doc=Array.isArray(dl.data?.data)?dl.data.data.find((x:any)=>x?.conteudo):null;if(!doc?.conteudo)throw new Error("document_content_missing");let xml="";try{xml=await blingHubNfeGunzip(String(doc.conteudo))}catch{throw new Error("document_decode_failed")}
  const p=blingHubNfeParse(xml),dk=p.document_key||k,auth=[0,100,150].includes(p.cstat);if(!auth||p.recipient_kind!=="CNPJ"){await sb.from("fiscal_source_documents").upsert({source:S,source_document_id:sid,document_key:dk,issued_at:p.issued_at,status:"skipped",item_count:p.items.length,matched_product_count:0,unmatched_item_count:p.items.length,content_sha256:await blingHubNfeSha(xml),last_error:!auth?"nfe_not_authorized":"recipient_not_cnpj",metadata:{bling_nfe_id:sid,recipient_kind:p.recipient_kind,supplier_name:p.supplier_name,external_write:false,raw_xml_storage:false},processed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"source,document_key"});return {skipped:true,reason:!auth?"nfe_not_authorized":"recipient_not_cnpj"}}
  const gs=[...new Set(p.items.flatMap((i:any)=>[i.commercial_gtin,i.tax_gtin]).filter(Boolean))] as string[],pm=new Map<string,any>();if(gs.length){const q=await sb.from("products").select("id,gtin,name").eq("is_active",true).in("gtin",gs);if(q.error)throw q.error;for(const x of q.data||[])pm.set(String(x.gtin),x)}
  const gr=new Map<string,any>();let mi=0,ui=0;for(const i of p.items){const pr=pm.get(i.commercial_gtin)||pm.get(i.tax_gtin);if(!pr){ui++;continue}mi++;const kk=[pr.id,i.ncm||"",i.cest||"",i.origin_code??"",i.cfop||"",i.tax_code||""].join("|"),g=gr.get(kk)||{product_id:pr.id,catalog_gtin:pr.gtin,ncm:i.ncm,cest:i.cest,origin_code:i.origin_code,cfop:i.cfop,tax_code:i.tax_code,fiscal_description:i.description,item_numbers:[],source_gtins:[]};g.item_numbers.push(i.item_number);g.source_gtins.push({commercial:i.commercial_gtin||null,tax:i.tax_gtin||null});gr.set(kk,g)}
  const ev=[...gr.values()].map((g:any)=>({evidence_key:["company_purchase_nfe_xml",dk,g.product_id,g.ncm||"none",g.cest||"none",g.origin_code??"none"].join(":"),product_id:g.product_id,evidence_type:"company_purchase_nfe_xml",source_name:"NF-e de entrada Bling / compra da empresa",document_key:dk,supplier_document:p.supplier_document,gtin:g.catalog_gtin,ncm:g.ncm,cest:g.cest,origin_code:g.origin_code,cfop:g.cfop,tax_code:g.tax_code,fiscal_description:g.fiscal_description,evidence_confidence:0.96,observed_at:p.issued_at,evidence_payload:{source:"bling_api_nfe_entry_xml",bling_nfe_id:sid,recipient_scope:"company_cnpj",source_item_gtins:g.source_gtins,matched_via:"gtin_exact",item_numbers:g.item_numbers,supplier_name:p.supplier_name,usage_policy:g.cest?"NCM_CEST evidence; validate against current MT legal rule before external write; CFOP is source-operation context only":"NCM evidence; missing CEST is not negative evidence; validate against current MT legal rule before external write",raw_xml_stored:false,external_write:false}}));if(ev.length){const q=await sb.from("product_fiscal_evidence").upsert(ev,{onConflict:"evidence_key"});if(q.error)throw q.error}
  await sb.from("fiscal_source_documents").upsert({source:S,source_document_id:sid,document_key:dk,issued_at:p.issued_at,status:"processed",item_count:p.items.length,matched_product_count:new Set([...gr.values()].map((x:any)=>x.product_id)).size,unmatched_item_count:ui,content_sha256:await blingHubNfeSha(xml),metadata:{bling_nfe_id:sid,recipient_kind:p.recipient_kind,supplier_name:p.supplier_name,evidence_rows:ev.length,matched_items:mi,unmatched_items:ui,external_write:false,raw_xml_storage:false},processed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"source,document_key"});return {skipped:false,evidence_rows:ev.length,matched_items:mi,unmatched_items:ui};
}
async function blingHubNfeEntryBackfill(sb:any,stepsRaw:any){
  const S="bling_nfe_entry_xml",PS=20,steps=Math.max(1,Math.min(8,Number(stepsRaw||4)||4)),sq=await sb.from("fiscal_source_scan_state").select("*").eq("source",S).maybeSingle();if(sq.error)throw sq.error;let st=sq.data;if(!st)throw new Error("scan_state_missing");if(st.status!=="running")return {ok:true,skipped:true,reason:"scan_not_running",state:st,external_write:false};
  const t=await blingHubOauth(sb),sum:any={ok:true,external_write:false,steps_requested:steps,steps_completed:0,documents_seen:0,documents_downloaded:0,evidence_rows:0,matched_items:0,unmatched_items:0,skipped_documents:0,unavailable_documents:0,errors:[]};
  for(let z=0;z<steps;z++){const cm=String(st.cursor_month);if(cm<String(st.earliest_month)){st.status="done";await sb.from("fiscal_source_scan_state").update({status:"done",updated_at:new Date().toISOString(),last_success_at:new Date().toISOString()}).eq("source",S);break}const b=blingHubNfeMonth(cm),pg=Math.max(1,Number(st.cursor_page||1)),pa=new URLSearchParams({tipo:"0",pagina:String(pg),limite:String(PS),dataEmissaoInicial:b.start+" 00:00:00",dataEmissaoFinal:b.end+" 23:59:59"}),ls=await blingHubGet(sb,t,"/nfe?"+pa.toString());if(!ls.ok){const er=ls.status===403?"bling_nfe_scope_missing":"bling_nfe_list_http_"+ls.status;await sb.from("fiscal_source_scan_state").update({status:ls.status===403?"paused":"error",last_error:er,last_scan_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("source",S);return {...sum,ok:false,status:ls.status,error:er}}
    const rows=Array.isArray(ls.data?.data)?ls.data.data:[];sum.documents_seen+=rows.length;let dl=0,ev=0,mi=0,ui=0;for(const row of rows){try{const r=await blingHubNfeOne(sb,t,row);if(r?.reason==="already_processed")sum.skipped_documents++;else if(String(r?.reason||"").startsWith("document_http_404"))sum.unavailable_documents++;else if(r?.skipped)sum.skipped_documents++;else{dl++;ev+=Number(r?.evidence_rows||0);mi+=Number(r?.matched_items||0);ui+=Number(r?.unmatched_items||0)}}catch(e){sum.errors.push({source_id:clean(row?.id,80)||null,error:clean((e as Error)?.message||e,300)})}}sum.documents_downloaded+=dl;sum.evidence_rows+=ev;sum.matched_items+=mi;sum.unmatched_items+=ui;sum.steps_completed++;
    const adv=rows.length<PS,nm=adv?blingHubNfePrev(cm):cm,np=adv?1:pg+1,uq=await sb.from("fiscal_source_scan_state").update({cursor_month:nm,cursor_page:np,months_scanned:Number(st.months_scanned||0)+(adv?1:0),pages_scanned:Number(st.pages_scanned||0)+1,documents_seen:Number(st.documents_seen||0)+rows.length,documents_downloaded:Number(st.documents_downloaded||0)+dl,evidence_rows:Number(st.evidence_rows||0)+ev,matched_items:Number(st.matched_items||0)+mi,unmatched_items:Number(st.unmatched_items||0)+ui,last_scan_at:new Date().toISOString(),last_success_at:new Date().toISOString(),last_error:sum.errors.length?clean(sum.errors.at(-1)?.error,500):null,updated_at:new Date().toISOString(),metadata:{...(st.metadata||{}),last_period:{start:b.start,end:b.end,page:pg,rows:rows.length},last_run:{documents_downloaded:dl,evidence_rows:ev,matched_items:mi,unmatched_items:ui,errors:sum.errors.length}}}).eq("source",S).select("*").single();if(uq.error)throw uq.error;st=uq.data}
  let refresh:any=null;if(sum.evidence_rows>0)refresh=await blingHubNfeRefresh(sb);await sb.from("bling_hub_audit_v2").insert({event_type:"fiscal_nfe_entry_backfill_run",severity:sum.errors.length?"warning":"info",domain:"fiscal",details:{...sum,cursor_month:st.cursor_month,cursor_page:st.cursor_page,scan_status:st.status,refresh_performed:Boolean(refresh),make_used:false}});return {...sum,state:{status:st.status,cursor_month:st.cursor_month,cursor_page:st.cursor_page,earliest_month:st.earliest_month,months_scanned:st.months_scanned,pages_scanned:st.pages_scanned,total_documents_seen:st.documents_seen,total_documents_downloaded:st.documents_downloaded,total_evidence_rows:st.evidence_rows,total_matched_items:st.matched_items,total_unmatched_items:st.unmatched_items},refresh};
}

function blingHubFinanceCuiabaDay(offsetDays=0){
  const d=new Date(Date.now()+offsetDays*86400000);
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Cuiaba",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const map:any={};for(const p of parts)map[p.type]=p.value;
  return map.year+"-"+map.month+"-"+map.day;
}
function blingHubFinanceCents(v:any){
  const n=Number(v??0);
  return Number.isFinite(n)?Math.round(n*100):0;
}
function blingHubFinanceStatusLabel(v:any){
  const n=Number(v||0);
  return ({1:"open",2:"paid",3:"partial",4:"returned",5:"cancelled",6:"partial_returned",7:"confirmed"} as any)[n]||"unknown";
}
function blingHubFinanceNormalize(kind:"receivable"|"payable",row:any){
  const contact=row?.contato||{};
  const origin=row?.origem||{};
  return {
    id:Number(row?.id||0)||null,
    kind,
    status:Number(row?.situacao||0)||null,
    status_label:blingHubFinanceStatusLabel(row?.situacao),
    due_date:clean(row?.vencimento,20)||null,
    issued_at:clean(row?.dataEmissao,20)||null,
    amount_cents:blingHubFinanceCents(row?.valor),
    contact_id:Number(contact?.id||0)||null,
    contact_name:clean(contact?.nome,180)||null,
    document_number:clean(row?.numeroDocumento,120)||null,
    payment_method_id:Number(row?.formaPagamento?.id||0)||null,
    payment_method_code:Number(row?.formaPagamento?.codigoFiscal||0)||null,
    financial_account_id:Number(row?.contaContabil?.id||row?.portador?.id||0)||null,
    financial_account_name:clean(row?.contaContabil?.descricao,180)||null,
    origin_id:Number(origin?.id||0)||null,
    origin_type:clean(origin?.tipoOrigem,80)||null,
    origin_number:clean(origin?.numero,120)||null,
    boleto_url:kind==="receivable"?clean(row?.linkBoleto,1200)||null:null,
    pix_url:kind==="receivable"?clean(row?.linkQRCodePix,1200)||null:null
  };
}
async function blingHubFinancePaged(sb:any,token:string,pathBase:string,maxPages=2){
  const rows:any[]=[];let truncated=false;let httpStatus=200;
  for(let page=1;page<=maxPages;page++){
    const sep=pathBase.includes("?")?"&":"?";
    const r=await blingHubGet(sb,token,pathBase+sep+"pagina="+page+"&limite=100");
    httpStatus=r.status;
    if(!r.ok)return {ok:false,status:r.status,rows:[],truncated:false,error:"bling_finance_http_"+r.status};
    const pageRows=Array.isArray(r.data?.data)?r.data.data:[];
    rows.push(...pageRows);
    if(pageRows.length<100)return {ok:true,status:r.status,rows,truncated:false};
    if(page===maxPages)truncated=true;
  }
  return {ok:true,status:httpStatus,rows,truncated};
}
function blingHubFinanceBucket(rows:any[],today:string,day7:string,day30:string){
  const sum=(xs:any[])=>xs.reduce((acc,x)=>acc+Number(x.amount_cents||0),0);
  const overdue=rows.filter(x=>x.due_date&&x.due_date<today);
  const todayRows=rows.filter(x=>x.due_date===today);
  const next7=rows.filter(x=>x.due_date&&x.due_date>today&&x.due_date<=day7);
  const next30=rows.filter(x=>x.due_date&&x.due_date>today&&x.due_date<=day30);
  return {
    total_cents:sum(rows),count:rows.length,
    overdue_cents:sum(overdue),overdue_count:overdue.length,
    today_cents:sum(todayRows),today_count:todayRows.length,
    next_7_cents:sum(next7),next_7_count:next7.length,
    next_30_cents:sum(next30),next_30_count:next30.length
  };
}
async function blingHubFinanceOverview(sb:any){
  const token=await blingHubOauth(sb);
  const today=blingHubFinanceCuiabaDay(0),past=blingHubFinanceCuiabaDay(-365),future=blingHubFinanceCuiabaDay(90);
  const day7=blingHubFinanceCuiabaDay(7),day30=blingHubFinanceCuiabaDay(30),past30=blingHubFinanceCuiabaDay(-30);

  const receivePast=new URLSearchParams({tipoFiltroData:"V",dataInicial:past,dataFinal:today});
  receivePast.append("situacoes[]","1");
  const receiveFuture=new URLSearchParams({tipoFiltroData:"V",dataInicial:today,dataFinal:future});
  receiveFuture.append("situacoes[]","1");
  const payablePast=new URLSearchParams({dataVencimentoInicial:past,dataVencimentoFinal:today,situacao:"1"});
  const payableFuture=new URLSearchParams({dataVencimentoInicial:today,dataVencimentoFinal:future,situacao:"1"});

  const receiveA=await blingHubFinancePaged(sb,token,"/contas/receber?"+receivePast.toString());
  if(!receiveA.ok)return {ok:false,status:receiveA.status,error:receiveA.status===403?"bling_finance_scope_missing":receiveA.error,readonly:true,external_write:false};
  const receiveB=await blingHubFinancePaged(sb,token,"/contas/receber?"+receiveFuture.toString());
  if(!receiveB.ok)return {ok:false,status:receiveB.status,error:receiveB.status===403?"bling_finance_scope_missing":receiveB.error,readonly:true,external_write:false};
  const payableA=await blingHubFinancePaged(sb,token,"/contas/pagar?"+payablePast.toString());
  if(!payableA.ok)return {ok:false,status:payableA.status,error:payableA.status===403?"bling_finance_scope_missing":payableA.error,readonly:true,external_write:false};
  const payableB=await blingHubFinancePaged(sb,token,"/contas/pagar?"+payableFuture.toString());
  if(!payableB.ok)return {ok:false,status:payableB.status,error:payableB.status===403?"bling_finance_scope_missing":payableB.error,readonly:true,external_write:false};

  const received30Params=new URLSearchParams({tipoFiltroData:"R",dataInicial:past30,dataFinal:today});
  received30Params.append("situacoes[]","2");
  const paid30Params=new URLSearchParams({dataPagamentoInicial:past30,dataPagamentoFinal:today,situacao:"2"});
  const received30=await blingHubFinancePaged(sb,token,"/contas/receber?"+received30Params.toString(),3);
  if(!received30.ok)return {ok:false,status:received30.status,error:received30.status===403?"bling_finance_scope_missing":received30.error,readonly:true,external_write:false};
  const paid30=await blingHubFinancePaged(sb,token,"/contas/pagar?"+paid30Params.toString(),3);
  if(!paid30.ok)return {ok:false,status:paid30.status,error:paid30.status===403?"bling_finance_scope_missing":paid30.error,readonly:true,external_write:false};

  const financialAccounts=await blingHubGet(sb,token,"/contas-contabeis?pagina=1&limite=100&ocultarInvisiveis=true&ordenacao=descricao");
  const accountsOk=financialAccounts.ok;
  const accountRows=accountsOk&&Array.isArray(financialAccounts.data?.data)?financialAccounts.data.data:[];

  const unique=(rows:any[])=>{
    const seen=new Set<string>();const out:any[]=[];
    for(const row of rows){
      const key=String(row?.id||"");
      if(!key||seen.has(key))continue;seen.add(key);out.push(row);
    }
    return out;
  };
  const receivables=unique([...receiveA.rows,...receiveB.rows]).map(x=>blingHubFinanceNormalize("receivable",x));
  const payables=unique([...payableA.rows,...payableB.rows]).map(x=>blingHubFinanceNormalize("payable",x));
  const receivedRows=unique(received30.rows).map(x=>blingHubFinanceNormalize("receivable",x));
  const paidRows=unique(paid30.rows).map(x=>blingHubFinanceNormalize("payable",x));
  const realizedReceivedCents=receivedRows.reduce((acc,x)=>acc+Number(x.amount_cents||0),0);
  const realizedPaidCents=paidRows.reduce((acc,x)=>acc+Number(x.amount_cents||0),0);
  const sortRows=(rows:any[])=>rows.sort((a,b)=>String(a.due_date||"9999-12-31").localeCompare(String(b.due_date||"9999-12-31"))||Number(b.amount_cents||0)-Number(a.amount_cents||0));
  sortRows(receivables);sortRows(payables);
  const receiveSummary=blingHubFinanceBucket(receivables,today,day7,day30);
  const payableSummary=blingHubFinanceBucket(payables,today,day7,day30);
  const priority=sortRows([...receivables,...payables]).slice(0,60);

  const overview={
    generated_at:new Date().toISOString(),
    timezone:"America/Cuiaba",
    window:{past,past_30:past30,today,future,day_7:day7,day_30:day30},
    receivable:receiveSummary,
    payable:payableSummary,
    projected_cents:receiveSummary.total_cents-payableSummary.total_cents,
    overdue_net_cents:receiveSummary.overdue_cents-payableSummary.overdue_cents,
    realized_30d:{
      received_cents:realizedReceivedCents,
      received_count:receivedRows.length,
      paid_cents:realizedPaidCents,
      paid_count:paidRows.length,
      net_cents:realizedReceivedCents-realizedPaidCents,
      truncated:Boolean(received30.truncated||paid30.truncated)
    },
    boleto_count:receivables.filter(x=>Boolean(x.boleto_url)).length,
    pix_count:receivables.filter(x=>Boolean(x.pix_url)).length,
    truncated:Boolean(receiveA.truncated||receiveB.truncated||payableA.truncated||payableB.truncated||received30.truncated||paid30.truncated),
    financial_accounts:accountRows.slice(0,100).map((x:any)=>({
      id:Number(x?.id||0)||null,
      description:clean(x?.descricao,180)||"",
      type:clean(x?.tipo,80)||"",
      integration_alias:clean(x?.aliasIntegracao,120)||null
    })).filter((x:any)=>x.id),
    financial_accounts_access:{ok:accountsOk,http_status:financialAccounts.status,insufficient_scope:financialAccounts.status===403},
    receivables:receivables.slice(0,100),
    payables:payables.slice(0,100),
    priority
  };
  await sb.from("bling_hub_audit_v2").insert({
    event_type:"finance_readonly_overview",
    severity:"info",
    domain:"finance",
    details:{
      receivable_count:receivables.length,payable_count:payables.length,
      received_30d_count:receivedRows.length,paid_30d_count:paidRows.length,
      realized_net_30d_cents:overview.realized_30d.net_cents,
      projected_cents:overview.projected_cents,truncated:overview.truncated,
      external_write:false,make_used:false
    }
  });
  return {ok:true,readonly:true,external_write:false,finance:overview};
}

function blingHubFinanceKind(v:any){
  const k=clean(v,30).toLowerCase();
  return k==="payable"?"payable":k==="receivable"?"receivable":"";
}
function blingHubFinanceRoot(kind:string){
  return kind==="payable"?"/contas/pagar":"/contas/receber";
}
function blingHubFinanceDate(v:any){
  const s=clean(v,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:"";
}
function blingHubFinancePositiveNumber(v:any){
  const n=Number(v);
  return Number.isFinite(n)&&n>0?n:null;
}
function blingHubFinanceNonNegativeNumber(v:any){
  const n=Number(v);
  return Number.isFinite(n)&&n>=0?n:null;
}
function blingHubFinanceSavePayload(kind:string,input:any){
  const p=obj(input),out:any={};
  const vencimento=blingHubFinanceDate(p.vencimento);
  const valor=blingHubFinancePositiveNumber(p.valor);
  const contatoId=Number(p?.contato?.id??p?.contato_id??0);
  const formaId=Number(p?.formaPagamento?.id??p?.forma_pagamento_id??0);
  const portadorId=Number(p?.portador?.id??p?.portador_id??0);
  const categoriaId=Number(p?.categoria?.id??p?.categoria_id??0);
  const emissao=blingHubFinanceDate(p.dataEmissao);
  const competencia=blingHubFinanceDate(p.competencia);
  if(vencimento)out.vencimento=vencimento;
  if(valor!==null)out.valor=valor;
  if(contatoId>0)out.contato={id:contatoId};
  if(formaId>0)out.formaPagamento={id:formaId};
  if(portadorId>0)out.portador={id:portadorId};
  if(categoriaId>0)out.categoria={id:categoriaId};
  if(emissao)out.dataEmissao=emissao;
  if(competencia)out.competencia=competencia;
  const numeroDocumento=clean(p.numeroDocumento,120);
  const historico=clean(p.historico,500);
  if(numeroDocumento)out.numeroDocumento=numeroDocumento;
  if(historico)out.historico=historico;
  return out;
}
function blingHubFinanceSaveMissing(payload:any){
  const missing:string[]=[];
  if(!payload?.vencimento)missing.push("vencimento");
  if(!(Number(payload?.valor)>0))missing.push("valor");
  if(!(Number(payload?.contato?.id)>0))missing.push("contato.id");
  return missing;
}
function blingHubFinanceDetailData(data:any){
  return data?.data&&typeof data.data==="object"&&!Array.isArray(data.data)?data.data:(data||{});
}
function blingHubFinanceSettlementPayload(input:any,current:any){
  const p=obj(input),c=obj(current),out:any={};
  const paymentDate=blingHubFinanceDate(p.data);
  const useDue=typeof p.usarDataVencimento==="boolean"?p.usarDataVencimento:false;
  const portadorId=Number(p?.portador?.id??p?.portador_id??c?.portador?.id??c?.contaContabil?.id??0);
  const categoriaId=Number(p?.categoria?.id??p?.categoria_id??c?.categoria?.id??0);
  if(paymentDate)out.data=paymentDate;
  out.usarDataVencimento=useDue;
  if(portadorId>0)out.portador={id:portadorId};
  if(categoriaId>0)out.categoria={id:categoriaId};
  out.historico=clean(p.historico??c.historico??"",500);
  for(const key of ["juros","desconto","acrescimo","valorRecebido","tarifa"]){
    const n=blingHubFinanceNonNegativeNumber(p?.[key]);
    if(n!==null)out[key]=n;
  }
  return out;
}
function blingHubFinanceSettlementMissing(payload:any){
  const missing:string[]=[];
  if(!payload?.data)missing.push("data");
  if(typeof payload?.usarDataVencimento!=="boolean")missing.push("usarDataVencimento");
  if(!(Number(payload?.portador?.id)>0))missing.push("portador.id");
  if(!(Number(payload?.categoria?.id)>0))missing.push("categoria.id");
  if(typeof payload?.historico!=="string")missing.push("historico");
  return missing;
}
function blingHubFinanceError(status:number){
  if(status===401)return "bling_oauth_unauthorized";
  if(status===403)return "bling_finance_scope_missing";
  if(status===429)return "bling_rate_limited";
  return "bling_finance_provider_error";
}
async function blingHubFinanceAudit(sb:any,eventType:string,severity:string,details:any){
  const q=await sb.from("bling_hub_audit_v2").insert({
    event_type:eventType,severity,domain:"finance",
    details:{...obj(details),make_used:false}
  });
  if(q.error)throw q.error;
}
async function blingHubFinanceIdempotencyState(sb:any,key:string){
  const q=await sb.from("bling_hub_audit_v2")
    .select("id,event_type,created_at,details")
    .eq("domain","finance")
    .contains("details",{idempotency_key:key})
    .order("created_at",{ascending:false})
    .limit(10);
  if(q.error)throw q.error;
  const rows=q.data||[];
  const success=rows.find((x:any)=>x.event_type==="finance_action_succeeded");
  if(success)return {state:"succeeded",event:success};
  if(rows.length)return {state:"used",event:rows[0]};
  return {state:"unused",event:null};
}
async function blingHubFinanceWriteOnce(sb:any,token:string,path:string,method:string,payload:any){
  await blingHubReserveSlot(sb);
  try{
    const r=await fetch(BLING_API_BASE+path,{
      method,
      headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(15000)
    });
    const raw=await r.text();
    let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
    return {
      ok:r.ok,status:r.status,data,
      error:clean(data?.error?.message||data?.error?.description||data?.error||raw,700),
      provider_details:blingHubProviderDetails(data),
      uncertain:r.status>=500
    };
  }catch(e){
    return {ok:false,status:0,data:{},error:clean((e as Error)?.message||e,700),provider_details:[],uncertain:true};
  }
}
async function blingHubFinanceCapabilities(sb:any,token:string){
  const probes:any={
    receivables:"/contas/receber?pagina=1&limite=1&situacoes%5B%5D=1",
    payables:"/contas/pagar?pagina=1&limite=1&situacao=1",
    financial_accounts:"/contas-contabeis?pagina=1&limite=1&ocultarInvisiveis=true"
  };
  const result:any={};
  for(const [name,path] of Object.entries(probes)){
    const r=await blingHubGet(sb,token,String(path));
    result[name]={ok:r.ok,http_status:r.status,scope_missing:r.status===403};
  }
  const actionsEnabled=Object.values(result).every((x:any)=>x.ok===true);
  return {ok:true,actions_enabled:actionsEnabled,readonly:!actionsEnabled,probes:result,external_write:false};
}
function blingHubFinanceBoletoStatus(v:any){
  const n=Number(v||0);
  return ({1:"open",2:"received",3:"partial",4:"returned",5:"partial_returned",6:"cancelled"} as any)[n]||"unknown";
}
async function blingHubFinanceBoletoPolicy(sb:any,token:string,kind:string,payload:any){
  const formId=Number(payload?.formaPagamento?.id||0);
  if(kind!=="receivable"||formId<=0){
    return {ok:true,is_boleto:false,blocking:[],warnings:[],external_write:false};
  }
  const form=await blingHubGet(sb,token,"/formas-pagamentos/"+encodeURIComponent(String(formId)));
  if(!form.ok){
    return {ok:false,status:form.status||502,error:blingHubFinanceError(form.status),provider_details:blingHubProviderDetails(form.data),external_write:false};
  }
  const method=blingHubFinanceDetailData(form.data);
  const isBoleto=Number(method?.tipoPagamento||0)===15;
  if(!isBoleto){
    return {
      ok:true,is_boleto:false,payment_method_id:formId,
      payment_method_description:clean(method?.descricao,180)||null,
      blocking:[],warnings:[],external_write:false
    };
  }

  const blocking:string[]=[];
  const warnings:string[]=[];
  if(!clean(payload?.historico,500))blocking.push("boleto_history_required");
  if(!(Number(payload?.portador?.id)>0))blocking.push("boleto_financial_account_required");
  const due=blingHubFinanceDate(payload?.vencimento);
  const today=blingHubFinanceCuiabaDay(0);
  if(due&&due<today)blocking.push("boleto_due_date_in_past");

  let contactSummary:any=null;
  const contactId=Number(payload?.contato?.id||0);
  if(contactId>0){
    const contact=await blingHubGet(sb,token,"/contatos/"+encodeURIComponent(String(contactId)));
    if(!contact.ok){
      return {ok:false,status:contact.status||502,error:blingHubFinanceError(contact.status),provider_details:blingHubProviderDetails(contact.data),external_write:false};
    }
    const c=blingHubFinanceDetailData(contact.data);
    const email=clean(c?.email||c?.emailNotaFiscal,220);
    const billing=c?.endereco?.cobranca||{};
    const general=c?.endereco?.geral||{};
    const addressView=(addr:any)=>({
      street:clean(addr?.endereco,180),
      number:clean(addr?.numero,40),
      district:clean(addr?.bairro,120),
      city:clean(addr?.municipio,120),
      state:clean(addr?.uf,8),
      zip:clean(addr?.cep,20)
    });
    const billingFields=addressView(billing),generalFields=addressView(general);
    const missing=(fields:any)=>Object.entries(fields).filter(([,v])=>!v).map(([k])=>k);
    const billingMissing=missing(billingFields),generalMissing=missing(generalFields);
    const missingAddress=billingMissing.length<=generalMissing.length?billingMissing:generalMissing;
    if(!email)blocking.push("boleto_contact_email_required");
    if(missingAddress.length)blocking.push("boleto_contact_address_incomplete");
    contactSummary={
      id:contactId,
      name:clean(c?.nome,180)||null,
      has_email:Boolean(email),
      address_complete:missingAddress.length===0,
      missing_address_fields:missingAddress
    };
  }else blocking.push("boleto_contact_required");

  let financialAccount:any=null;
  const financialId=Number(payload?.portador?.id||0);
  if(financialId>0){
    const account=await blingHubGet(sb,token,"/contas-contabeis/"+encodeURIComponent(String(financialId)));
    if(!account.ok){
      return {ok:false,status:account.status||502,error:blingHubFinanceError(account.status),provider_details:blingHubProviderDetails(account.data),external_write:false};
    }
    const a=blingHubFinanceDetailData(account.data);
    const type=clean(a?.tipo,80).toLowerCase();
    const alias=clean(a?.aliasIntegracao,120)||null;
    const knownEligible=type==="banco"||type==="integracao-pagamento";
    const knownIneligible=type==="caixa"||type==="conta-bancaria";
    if(knownIneligible)blocking.push("boleto_financial_account_not_eligible");
    if(!type)warnings.push("boleto_financial_account_type_unavailable");
    financialAccount={
      id:financialId,
      description:clean(a?.descricao,180)||null,
      type:type||null,
      integration_alias:alias,
      boleto_eligible:knownEligible?true:(knownIneligible?false:null)
    };
  }

  warnings.push("boleto_issuance_requires_bling_ui");
  return {
    ok:blocking.length===0,
    status:blocking.length?400:200,
    is_boleto:true,
    payment_method_id:formId,
    payment_method_description:clean(method?.descricao,180)||"Boleto",
    blocking:[...new Set(blocking)],
    warnings:[...new Set(warnings)],
    contact:contactSummary,
    financial_account:financialAccount,
    issuance_mode:"manual_in_bling",
    automatic_issuance:false,
    external_write:false
  };
}
async function blingHubFinanceReadPages(sb:any,token:string,pathBase:string,maxPages=3){
  const rows:any[]=[];let status=200;
  for(let page=1;page<=maxPages;page++){
    const sep=pathBase.includes("?")?"&":"?";
    const r=await blingHubGet(sb,token,pathBase+sep+"pagina="+page+"&limite=100");
    status=r.status;
    if(!r.ok)return {ok:false,status:r.status,rows:[],truncated:false,data:r.data};
    const pageRows=Array.isArray(r.data?.data)?r.data.data:[];
    rows.push(...pageRows);
    if(pageRows.length<100)return {ok:true,status,rows,truncated:false,data:r.data};
  }
  return {ok:true,status,rows,truncated:true,data:null};
}
async function blingHubFinanceCatalogs(sb:any,token:string){
  const payments=await blingHubFinanceReadPages(sb,token,"/formas-pagamentos?situacao=1",3);
  if(!payments.ok)return {ok:false,status:payments.status||502,error:blingHubFinanceError(payments.status),catalog:"payment_methods",external_write:false};
  const categories=await blingHubFinanceReadPages(sb,token,"/categorias/receitas-despesas?tipo=0&situacao=1",3);
  if(!categories.ok)return {ok:false,status:categories.status||502,error:blingHubFinanceError(categories.status),catalog:"categories",external_write:false};
  const accounts=await blingHubGet(sb,token,"/contas-contabeis?pagina=1&limite=100&ocultarInvisiveis=true&ordenacao=descricao");
  if(!accounts.ok)return {ok:false,status:accounts.status||502,error:blingHubFinanceError(accounts.status),catalog:"financial_accounts",external_write:false};
  const accountRows=Array.isArray(accounts.data?.data)?accounts.data.data:[];
  return {
    ok:true,
    payment_methods:payments.rows.map((x:any)=>({
      id:Number(x?.id||0)||null,
      description:clean(x?.descricao,180)||("Forma #"+String(x?.id||"")),
      type:Number(x?.tipoPagamento||0)||null,
      purpose:Number(x?.finalidade||0)||null,
      active:x?.situacao===undefined?true:Number(x?.situacao)===1
    })).filter((x:any)=>x.id),
    categories:categories.rows.map((x:any)=>({
      id:Number(x?.id||0)||null,
      description:clean(x?.descricao||x?.nome,180)||("Categoria #"+String(x?.id||"")),
      type:Number(x?.tipo||0)||null,
      parent_id:Number(x?.categoriaPai?.id||x?.pai?.id||0)||null
    })).filter((x:any)=>x.id),
    financial_accounts:accountRows.map((x:any)=>({
      id:Number(x?.id||0)||null,
      description:clean(x?.descricao,180)||("Conta #"+String(x?.id||"")),
      type:clean(x?.tipo,80)||"",
      integration_alias:clean(x?.aliasIntegracao,120)||null
    })).filter((x:any)=>x.id),
    truncated:Boolean(payments.truncated||categories.truncated),
    external_write:false
  };
}
async function blingHubFinanceContactSearch(sb:any,token:string,queryRaw:any){
  const query=clean(queryRaw,100);
  if(query.length<2)return {ok:true,contacts:[],query,external_write:false};
  const qs=new URLSearchParams({pagina:"1",limite:"20",criterio:"1",pesquisa:query});
  const r=await blingHubGet(sb,token,"/contatos?"+qs.toString());
  if(!r.ok)return {ok:false,status:r.status||502,error:blingHubFinanceError(r.status),provider_details:blingHubProviderDetails(r.data),external_write:false};
  const rows=Array.isArray(r.data?.data)?r.data.data:[];
  return {
    ok:true,query,
    contacts:rows.map((x:any)=>({
      id:Number(x?.id||0)||null,
      name:clean(x?.nome,180)||"",
      trade_name:clean(x?.fantasia,180)||null,
      document:clean(x?.numeroDocumento,40)||null,
      phone:clean(x?.telefone||x?.celular,60)||null,
      situation:clean(x?.situacao,20)||null,
      type:clean(x?.tipo,40)||null
    })).filter((x:any)=>x.id),
    external_write:false
  };
}
async function blingHubFinanceAction(sb:any,body:any,actorUserId:string|null=null){
  const operation=clean(body?.operation||body?.finance_action,80).toLowerCase();

  if(operation==="capabilities"){
    const token=await blingHubOauth(sb);
    return await blingHubFinanceCapabilities(sb,token);
  }
  if(operation==="catalogs"){
    const token=await blingHubOauth(sb);
    return await blingHubFinanceCatalogs(sb,token);
  }
  if(operation==="contact_search"){
    const token=await blingHubOauth(sb);
    return await blingHubFinanceContactSearch(sb,token,body?.query);
  }
  if(operation==="financial_account_detail"){
    const id=Math.trunc(Number(body?.id||0));
    if(id<=0)return {ok:false,status:400,error:"invalid_id",external_write:false};
    const token=await blingHubOauth(sb);
    const r=await blingHubGet(sb,token,"/contas-contabeis/"+encodeURIComponent(String(id)));
    if(!r.ok)return {ok:false,status:r.status||502,error:blingHubFinanceError(r.status),provider_details:blingHubProviderDetails(r.data),external_write:false};
    return {ok:true,financial_account:blingHubFinanceDetailData(r.data),external_write:false};
  }

  const kind=blingHubFinanceKind(body?.kind);
  if(!kind)return {ok:false,status:400,error:"invalid_kind",external_write:false};
  const root=blingHubFinanceRoot(kind);
  const id=Math.trunc(Number(body?.id||0));

  if(operation==="detail"){
    if(id<=0)return {ok:false,status:400,error:"invalid_id",external_write:false};
    const token=await blingHubOauth(sb);
    const r=await blingHubGet(sb,token,root+"/"+encodeURIComponent(String(id)));
    if(!r.ok)return {ok:false,status:r.status||502,error:blingHubFinanceError(r.status),provider_details:blingHubProviderDetails(r.data),external_write:false};
    return {ok:true,kind,account:blingHubFinanceDetailData(r.data),external_write:false};
  }

  if(operation==="boletos"){
    if(kind!=="receivable")return {ok:false,status:400,error:"boletos_receivable_only",external_write:false};
    const originId=Math.trunc(Number(body?.origin_id||0));
    if(originId<=0)return {ok:false,status:400,error:"invalid_origin_id",external_write:false};
    const qs=new URLSearchParams({idOrigem:String(originId)});
    for(const s of (Array.isArray(body?.situacoes)?body.situacoes:[]).slice(0,20)){
      const n=Math.trunc(Number(s));if(Number.isFinite(n))qs.append("situacoes[]",String(n));
    }
    const token=await blingHubOauth(sb);
    const r=await blingHubGet(sb,token,"/contas/receber/boletos?"+qs.toString());
    if(r.status===404)return {ok:true,boletos:[],summary:{count:0,total_cents:0},external_write:false};
    if(!r.ok)return {ok:false,status:r.status||502,error:blingHubFinanceError(r.status),provider_details:blingHubProviderDetails(r.data),external_write:false};
    const rootData=r.data?.data??r.data??{};
    const rawRows=Array.isArray(rootData)?rootData:(Array.isArray(rootData?.contas)?rootData.contas:[]);
    const boletos=rawRows.map((b:any)=>({
      id:Number(b?.id||0)||null,
      external_number:clean(b?.numeroExterno,160)||null,
      due_date:clean(b?.vencimento,20)||null,
      amount_cents:blingHubFinanceCents(b?.valor),
      status:Number(b?.situacao||0)||null,
      status_label:blingHubFinanceBoletoStatus(b?.situacao)
    })).filter((b:any)=>b.id);
    return {
      ok:true,boletos,
      summary:{
        count:boletos.length,
        total_cents:blingHubFinanceCents(rootData?.valorTotal??boletos.reduce((acc:number,b:any)=>acc+Number(b.amount_cents||0),0)/100),
        sale_number:clean(rootData?.venda?.numero,120)||null,
        invoice_number:clean(rootData?.notaFiscal?.numero,120)||null
      },
      external_write:false
    };
  }

  if(operation==="create_preview"||operation==="update_preview"){
    if(operation==="update_preview"&&id<=0)return {ok:false,status:400,error:"invalid_id",external_write:false};
    const payload=blingHubFinanceSavePayload(kind,body?.payload);
    const missing=blingHubFinanceSaveMissing(payload);
    let current:any=null,boletoPolicy:any={ok:true,is_boleto:false,blocking:[],warnings:[],external_write:false};
    if(missing.length===0){
      const token=await blingHubOauth(sb);
      boletoPolicy=await blingHubFinanceBoletoPolicy(sb,token,kind,payload);
      if(!boletoPolicy.ok&&Number(boletoPolicy.status||0)>=500)return boletoPolicy;
      if(operation==="update_preview"){
        const detail=await blingHubGet(sb,token,root+"/"+encodeURIComponent(String(id)));
        if(!detail.ok)return {ok:false,status:detail.status||502,error:blingHubFinanceError(detail.status),provider_details:blingHubProviderDetails(detail.data),external_write:false};
        current=blingHubFinanceDetailData(detail.data);
      }
    }
    const boletoBlocking=Array.isArray(boletoPolicy?.blocking)?boletoPolicy.blocking:[];
    const allMissing=[...missing,...boletoBlocking];
    return {
      ok:allMissing.length===0,status:allMissing.length?400:200,
      error:allMissing.length?(boletoBlocking.length?"boleto_validation_failed":"validation_failed"):undefined,
      preview:true,external_write:false,kind,
      operation:operation==="create_preview"?"create":"update",id:id||null,current,payload,missing:allMissing,
      boleto_policy:boletoPolicy,
      confirmation_required:true,confirmation_phrase:"CONFIRMAR"
    };
  }

  if(operation==="settle_preview"){
    if(id<=0)return {ok:false,status:400,error:"invalid_id",external_write:false};
    const token=await blingHubOauth(sb);
    const detail=await blingHubGet(sb,token,root+"/"+encodeURIComponent(String(id)));
    if(!detail.ok)return {ok:false,status:detail.status||502,error:blingHubFinanceError(detail.status),provider_details:blingHubProviderDetails(detail.data),external_write:false};
    const current=blingHubFinanceDetailData(detail.data);
    const payload=blingHubFinanceSettlementPayload(body?.payload,current);
    const missing=blingHubFinanceSettlementMissing(payload);
    return {
      ok:missing.length===0,status:missing.length?400:200,preview:true,external_write:false,kind,
      operation:"settle",id,current,payload,missing,
      confirmation_required:true,confirmation_phrase:"CONFIRMAR",
      warning:"A baixa registra o pagamento ou recebimento somente no Bling. Nenhuma transferência bancária é executada."
    };
  }

  if(!["create_execute","update_execute","settle_execute"].includes(operation)){
    return {ok:false,status:404,error:"unknown_finance_action",external_write:false};
  }
  if(clean(body?.confirmation,40)!=="CONFIRMAR"){
    return {ok:false,status:409,error:"human_confirmation_required",external_write:false};
  }
  const idem=clean(body?.idempotency_key,160);
  if(idem.length<16)return {ok:false,status:400,error:"idempotency_key_required",external_write:false};
  const idemState=await blingHubFinanceIdempotencyState(sb,idem);
  if(idemState.state==="succeeded"){
    return {ok:true,idempotent_replay:true,previous_event_id:idemState.event?.id||null,external_write:false};
  }
  if(idemState.state==="used"){
    return {ok:false,status:409,error:"idempotency_key_already_used",manual_review_required:true,previous_event_id:idemState.event?.id||null,external_write:false};
  }

  let path=root,method="POST",payload:any={};
  if(operation==="create_execute"){
    payload=blingHubFinanceSavePayload(kind,body?.payload);
    const missing=blingHubFinanceSaveMissing(payload);
    if(missing.length)return {ok:false,status:400,error:"validation_failed",missing,external_write:false};
  }else if(operation==="update_execute"){
    if(id<=0)return {ok:false,status:400,error:"invalid_id",external_write:false};
    path=root+"/"+encodeURIComponent(String(id));method="PUT";
    payload=blingHubFinanceSavePayload(kind,body?.payload);
    const missing=blingHubFinanceSaveMissing(payload);
    if(missing.length)return {ok:false,status:400,error:"validation_failed",missing,external_write:false};
  }

  const token=await blingHubOauth(sb);
  if(operation==="create_execute"||operation==="update_execute"){
    const boletoPolicy=await blingHubFinanceBoletoPolicy(sb,token,kind,payload);
    if(!boletoPolicy.ok){
      if(Number(boletoPolicy.status||0)>=500)return boletoPolicy;
      return {ok:false,status:400,error:"boleto_validation_failed",missing:boletoPolicy.blocking||[],boleto_policy:boletoPolicy,external_write:false};
    }
  }
  if(operation==="settle_execute"){
    if(id<=0)return {ok:false,status:400,error:"invalid_id",external_write:false};
    const detail=await blingHubGet(sb,token,root+"/"+encodeURIComponent(String(id)));
    if(!detail.ok)return {ok:false,status:detail.status||502,error:blingHubFinanceError(detail.status),provider_details:blingHubProviderDetails(detail.data),external_write:false};
    payload=blingHubFinanceSettlementPayload(body?.payload,blingHubFinanceDetailData(detail.data));
    const missing=blingHubFinanceSettlementMissing(payload);
    if(missing.length)return {ok:false,status:400,error:"validation_failed",missing,external_write:false};
    path=root+"/"+encodeURIComponent(String(id))+"/baixar";
  }

  await blingHubFinanceAudit(sb,"finance_action_attempt","warning",{
    operation,kind,id:id||null,idempotency_key:idem,actor_user_id:actorUserId,external_write:false
  });

  const write=operation==="update_execute"
    ? await blingHubWriteIdempotent(sb,token,path,method,payload)
    : await blingHubFinanceWriteOnce(sb,token,path,method,payload);

  if(!write.ok){
    const uncertain=Boolean(write.uncertain||write.status===0||write.status>=500);
    await blingHubFinanceAudit(sb,uncertain?"finance_action_uncertain":"finance_action_failed",uncertain?"error":"warning",{
      operation,kind,id:id||null,idempotency_key:idem,actor_user_id:actorUserId,http_status:Number(write.status||0),external_write:false,manual_review_required:uncertain
    });
    return {
      ok:false,status:uncertain?409:(write.status||502),
      error:uncertain?"bling_finance_write_uncertain":blingHubFinanceError(write.status),
      http_status:Number(write.status||0),provider_details:write.provider_details||[],
      manual_review_required:uncertain,automatic_retry:false,external_write:false
    };
  }

  const resultId=Number(write.data?.data?.id||write.data?.bordero?.id||write.data?.id||0)||null;
  await blingHubFinanceAudit(sb,"finance_action_succeeded","warning",{
    operation,kind,id:id||null,idempotency_key:idem,actor_user_id:actorUserId,http_status:write.status,result_id:resultId,external_write:true
  });
  return {ok:true,status:write.status,http_status:write.status,result_id:resultId,result:write.data||null,external_write:true,automatic_retry:operation==="update_execute"};
}

function blingHubDigits(v:any){return String(v??"").replace(/\D/g,"")}
function blingHubValidCpfCnpj(v:any){
  const d=blingHubDigits(v);
  if(![11,14].includes(d.length)||/^(\d)\1+$/.test(d))return false;
  const digit=(base:string,weights:number[])=>{
    let sum=0;
    for(let i=0;i<weights.length;i++)sum+=Number(base[i])*weights[i];
    const mod=sum%11;
    return mod<2?0:11-mod;
  };
  if(d.length===11){
    const d1=digit(d.slice(0,9),[10,9,8,7,6,5,4,3,2]);
    const d2=digit(d.slice(0,10),[11,10,9,8,7,6,5,4,3,2]);
    return d===d.slice(0,9)+String(d1)+String(d2);
  }
  const d1=digit(d.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2=digit(d.slice(0,13),[6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return d===d.slice(0,12)+String(d1)+String(d2);
}

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
  const merged=await sb.rpc("merge_bling_hub_runtime_metadata_v2",{
    p_patch:{
      selected_deposit_id:id,
      selected_deposit_name:clean(preferred?.descricao||preferred?.nome||rows[0]?.descricao||rows[0]?.nome,120)||null,
      deposit_resolved_at:new Date().toISOString()
    }
  });
  if(merged.error)throw merged.error;
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

function blingHubScalarView(obj:any){
  if(!obj||typeof obj!=="object")return {};
  const out:any={};
  for(const [k,v] of Object.entries(obj)){
    if(v===null||["string","number","boolean"].includes(typeof v))out[k]=v;
  }
  return out;
}
async function blingHubOps2OrderStockProbe(sb:any,sourceOrderIdRaw:any,limitRaw:any=3){
  const sourceOrderId=uuid(sourceOrderIdRaw);
  if(!sourceOrderId)return {ok:false,error:"invalid_source_order_id",status:400};
  const limit=Math.max(1,Math.min(5,Number(limitRaw||3)||3));
  const items=await sb.from("order_items")
    .select("product_id,name_snapshot,sku_snapshot")
    .eq("order_id",sourceOrderId)
    .not("product_id","is",null)
    .order("created_at",{ascending:true})
    .limit(50);
  if(items.error)throw items.error;
  const unique:any[]=[];const seen=new Set<string>();
  for(const it of items.data||[]){
    const pid=uuid(it.product_id);if(!pid||seen.has(pid))continue;
    seen.add(pid);unique.push({...it,product_id:pid});if(unique.length>=limit)break;
  }
  if(!unique.length)return {ok:false,error:"order_without_products",status:409};
  const ids=unique.map(x=>x.product_id);
  const links=await sb.from("bling_hub_entity_links_v2")
    .select("source_id,bling_id,status")
    .eq("source_system","vitrine_qx").eq("entity_type","product")
    .in("source_id",ids);
  if(links.error)throw links.error;
  const linkMap=new Map<string,any>((links.data||[]).map((x:any)=>[String(x.source_id),x]));
  const token=await blingHubOauth(sb);
  const depositId=await blingHubResolveDepositId(sb,token);
  const rows:any[]=[];
  for(const it of unique){
    const link=linkMap.get(it.product_id);
    if(!link||link.status!=="matched"||!Number(link.bling_id)){
      rows.push({product_id:it.product_id,name:clean(it.name_snapshot,180),sku:clean(it.sku_snapshot,120),error:"product_not_linked"});
      continue;
    }
    const q=new URLSearchParams();q.append("idsProdutos[]",String(link.bling_id));
    const r=await blingHubGet(sb,token,"/estoques/saldos?"+q.toString());
    if(!r.ok){
      rows.push({product_id:it.product_id,bling_product_id:Number(link.bling_id),name:clean(it.name_snapshot,180),error:"stock_http_"+r.status});
      continue;
    }
    const dataRows=Array.isArray(r.data?.data)?r.data.data:[];
    const row=dataRows.find((x:any)=>Number(x?.produto?.id||0)===Number(link.bling_id))||dataRows[0]||{};
    const deps=Array.isArray(row?.depositos)?row.depositos:[];
    const dep=deps.find((x:any)=>Number(x?.id||0)===depositId)||null;
    rows.push({
      product_id:it.product_id,
      bling_product_id:Number(link.bling_id),
      name:clean(it.name_snapshot,180),
      sku:clean(it.sku_snapshot,120),
      deposit_id:depositId,
      row_scalars:blingHubScalarView(row),
      deposit_scalars:blingHubScalarView(dep)
    });
  }
  return {ok:true,source_order_id:sourceOrderId,deposit_id:depositId,products:rows,external_write:false};
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
async function blingHubProductFiscalAuditReadonly(sb:any,body:any){
  const limit=Math.max(1,Math.min(100,Number(body?.limit||50)||50));
  const minRisk=Math.max(0,Math.min(100,Number(body?.min_risk??0)||0));
  const offset=Math.max(0,Number(body?.offset||0)||0);
  const requestedIds=(Array.isArray(body?.product_ids)?body.product_ids:[])
    .map((x:any)=>uuid(x)).filter(Boolean).slice(0,100);

  const riskMap=new Map<string,any>();
  let productIds:string[]=[];
  if(requestedIds.length){
    productIds=requestedIds;
  }else{
    let scanQuery=sb.from("product_fiscal_catalog_scan_v1")
      .select("product_id,risk_code,risk_score,bling_evidence_count")
      .eq("is_active",true)
      .gte("risk_score",minRisk);
    const riskCode=clean(body?.risk_code,80);
    if(riskCode)scanQuery=scanQuery.eq("risk_code",riskCode);
    if(body?.only_unseen_bling===true)scanQuery=scanQuery.eq("bling_evidence_count",0);
    const scan=await scanQuery
      .order("risk_score",{ascending:false})
      .order("product_id",{ascending:true})
      .range(offset,offset+limit-1);
    if(scan.error)throw scan.error;
    for(const row of scan.data||[]){
      const id=uuid(row.product_id);if(!id)continue;
      productIds.push(id);
      riskMap.set(id,{risk_code:clean(row.risk_code,80),risk_score:Number(row.risk_score||0)});
    }
  }

  if(!productIds.length){
    return {ok:true,selected:0,read:0,evidence_written:0,failures:[],external_write:false,bling_mutations:0};
  }

  const pq=await sb.from("products")
    .select("id,name,gtin,ncm,bling_product_id,is_active")
    .in("id",productIds);
  if(pq.error)throw pq.error;
  const productMap=new Map<string,any>((pq.data||[]).map((p:any)=>[String(p.id),p]));

  const missingLinkIds=(pq.data||[])
    .filter((p:any)=>!Number(p.bling_product_id))
    .map((p:any)=>String(p.id));
  const linkMap=new Map<string,number>();
  if(missingLinkIds.length){
    const lq=await sb.from("bling_hub_entity_links_v2")
      .select("source_id,bling_id,status")
      .eq("entity_type","product")
      .eq("status","matched")
      .in("source_id",missingLinkIds);
    if(lq.error)throw lq.error;
    for(const row of lq.data||[]){
      const id=Number(row.bling_id||0);
      if(id>0)linkMap.set(String(row.source_id),id);
    }
  }

  const token=await blingHubOauth(sb);
  const evidence:any[]=[];
  const failures:any[]=[];
  let read=0;

  for(const productId of productIds){
    const p=productMap.get(productId);
    if(!p){failures.push({product_id:productId,error:"product_not_found"});continue;}
    const blingId=Number(p.bling_product_id||linkMap.get(productId)||0);
    if(!blingId){failures.push({product_id:productId,error:"bling_product_not_linked"});continue;}

    const detail=await blingHubGet(sb,token,"/produtos/"+encodeURIComponent(String(blingId)));
    if(!detail.ok){
      failures.push({product_id:productId,bling_product_id:blingId,error:"bling_product_http_"+detail.status});
      continue;
    }
    read++;

    const current=detail.data?.data||{};
    const trib=current?.tributacao&&typeof current.tributacao==="object"?current.tributacao:{};
    const ncmRaw=blingHubDigits(trib?.ncm??current?.ncm);
    const cestRaw=blingHubDigits(trib?.cest??current?.cest);
    const originValue=trib?.origem??current?.origem;
    const originRaw=typeof originValue==="object"&&originValue!==null
      ? (originValue.codigo??originValue.id??originValue.valor??originValue.value)
      : originValue;
    const originText=String(originRaw??"").trim();
    const originCode=/^[0-8]$/.test(originText)?Number(originText):null;
    const gtin=blingHubDigits(current?.gtin)||blingHubDigits(p.gtin)||null;
    const taxGtin=blingHubDigits(current?.gtinEmbalagem??current?.gtinTributavel??current?.gtinTrib)||null;
    const ncm=/^\d{8}$/.test(ncmRaw)?ncmRaw:null;
    const cest=/^\d{7}$/.test(cestRaw)?cestRaw:null;
    const evidenceKey=[
      "bling_product_detail",String(blingId),ncm||"-",cest||"-",
      originCode===null?"-":String(originCode),gtin||"-",taxGtin||"-"
    ].join(":");

    evidence.push({
      evidence_key:evidenceKey,
      product_id:productId,
      evidence_type:"bling_product_detail",
      source_name:"Bling ERP",
      document_key:String(blingId),
      gtin,
      ncm,
      cest,
      origin_code:originCode,
      fiscal_description:clean(current?.nome||p.name,500)||null,
      observed_at:new Date().toISOString(),
      evidence_payload:{
        bling_product_id:blingId,
        fetched_at:new Date().toISOString(),
        tax_gtin:taxGtin,
        tributacao:trib,
        risk:riskMap.get(productId)||null,
        read_only:true
      }
    });
  }

  if(evidence.length){
    const up=await sb.from("product_fiscal_evidence").upsert(evidence,{onConflict:"evidence_key"});
    if(up.error)throw up.error;
  }

  const candidateRefresh=await sb.rpc("refresh_product_fiscal_candidates_r0_3");
  const reviewRefresh=await sb.rpc("refresh_product_fiscal_review_state_v1");

  return {
    ok:true,
    selected:productIds.length,
    read,
    evidence_written:evidence.length,
    failures:failures.slice(0,50),
    candidate_refresh:candidateRefresh.error?{ok:false,error:clean(candidateRefresh.error.message,300)}:candidateRefresh.data,
    review_refresh:reviewRefresh.error?{ok:false,error:clean(reviewRefresh.error.message,300)}:reviewRefresh.data,
    external_write:false,
    bling_mutations:0
  };
}
function blingHubCanonicalValue(v:any):any{
  if(Array.isArray(v))return v.map(blingHubCanonicalValue);
  if(v&&typeof v==="object"){
    const out:any={};
    for(const k of Object.keys(v).sort())out[k]=blingHubCanonicalValue(v[k]);
    return out;
  }
  return v;
}
function blingHubSameExceptCest(before:any,after:any){
  const a={...(before&&typeof before==="object"?before:{})};
  const b={...(after&&typeof after==="object"?after:{})};
  delete a.cest;delete b.cest;
  return JSON.stringify(blingHubCanonicalValue(a))===JSON.stringify(blingHubCanonicalValue(b));
}
async function blingHubProductFiscalCestCanary(sb:any,body:any,tokenOverride:any=null){
  const productId=uuid(body?.product_id);
  const confirmation=clean(body?.confirmation,200);
  if(!productId)return {ok:false,status:400,error:"product_id_required",external_write:false};
  if(confirmation!==("APLICAR_CEST_CANARIO:"+productId)){
    return {ok:false,status:409,error:"confirmation_required",required_confirmation:"APLICAR_CEST_CANARIO:"+productId,external_write:false};
  }

  const preview=await sb.from("product_fiscal_bling_diff_v1")
    .select("product_id,name,gtin,bling_product_id,proposed_ncm,proposed_cest,proposed_origin_code,diff_status,canary_eligible,bling_observed_at")
    .eq("product_id",productId)
    .maybeSingle();
  if(preview.error)throw preview.error;
  const row=preview.data;
  if(!row)return {ok:false,status:404,error:"fiscal_preview_not_found",external_write:false};
  if(row.canary_eligible!==true||row.diff_status!=="cest_missing"){
    return {ok:false,status:409,error:"canary_not_eligible",preview:row,external_write:false};
  }

  const blingId=Number(row.bling_product_id||0);
  if(!blingId)return {ok:false,status:409,error:"bling_product_not_linked",external_write:false};

  const token=tokenOverride||await blingHubOauth(sb);
  const before=await blingHubGet(sb,token,"/produtos/"+encodeURIComponent(String(blingId)));
  if(!before.ok)return {ok:false,status:before.status,error:"bling_product_read_before_failed",external_write:false};
  const beforeProduct=before.data?.data||{};
  const beforeTrib=beforeProduct?.tributacao&&typeof beforeProduct.tributacao==="object"?beforeProduct.tributacao:{};
  const beforeNcm=blingHubDigits(beforeTrib?.ncm??beforeProduct?.ncm);
  const beforeCest=blingHubDigits(beforeTrib?.cest??beforeProduct?.cest);
  const originValue=beforeTrib?.origem??beforeProduct?.origem;
  const originRaw=typeof originValue==="object"&&originValue!==null?(originValue.codigo??originValue.id??originValue.valor??originValue.value):originValue;
  const beforeOrigin=/^[0-8]$/.test(String(originRaw??"").trim())?Number(originRaw):null;

  if(beforeNcm!==String(row.proposed_ncm||"")||beforeOrigin!==Number(row.proposed_origin_code)){
    return {ok:false,status:409,error:"precondition_tax_identity_changed",before:{ncm:beforeNcm,origin:beforeOrigin,cest:beforeCest||null},preview:row,external_write:false};
  }
  if(beforeCest){
    if(beforeCest===String(row.proposed_cest||"")){
      return {ok:true,already_aligned:true,product_id:productId,bling_product_id:blingId,cest:beforeCest,external_write:false,bling_mutations:0};
    }
    return {ok:false,status:409,error:"precondition_cest_not_blank",before_cest:beforeCest,proposed_cest:row.proposed_cest,external_write:false};
  }

  const patchPayload={
    tributacao:{
      origem:beforeOrigin,
      ncm:beforeNcm,
      cest:String(row.proposed_cest||"")
    }
  };
  const write=await blingHubWriteIdempotent(
    sb,token,
    "/produtos/"+encodeURIComponent(String(blingId)),
    "PATCH",
    patchPayload
  );
  if(!write.ok){
    await sb.from("bling_hub_audit_v2").insert({
      event_type:"product_fiscal_cest_canary",
      severity:"error",
      domain:"product",
      source_system:"canonical",
      source_id:productId,
      details:{ok:false,stage:"patch",bling_product_id:blingId,status:write.status,error:write.error||null,before_tributacao:beforeTrib,proposed_patch:patchPayload,external_write:true}
    });
    return {ok:false,status:Number(write.status||409),error:"bling_product_patch_failed",provider_error:write.error||null,external_write:true,bling_mutations:0};
  }

  const after=await blingHubGet(sb,token,"/produtos/"+encodeURIComponent(String(blingId)));
  if(!after.ok){
    await sb.from("bling_hub_audit_v2").insert({
      event_type:"product_fiscal_cest_canary",
      severity:"error",
      domain:"product",
      source_system:"canonical",
      source_id:productId,
      details:{ok:false,stage:"verify_read",bling_product_id:blingId,status:after.status,before_tributacao:beforeTrib,proposed_patch:patchPayload,external_write:true}
    });
    return {ok:false,status:502,error:"bling_product_verify_read_failed",external_write:true,bling_mutations:1};
  }

  const afterProduct=after.data?.data||{};
  const afterTrib=afterProduct?.tributacao&&typeof afterProduct.tributacao==="object"?afterProduct.tributacao:{};
  const afterNcm=blingHubDigits(afterTrib?.ncm??afterProduct?.ncm);
  const afterCest=blingHubDigits(afterTrib?.cest??afterProduct?.cest);
  const afterOriginValue=afterTrib?.origem??afterProduct?.origem;
  const afterOriginRaw=typeof afterOriginValue==="object"&&afterOriginValue!==null?(afterOriginValue.codigo??afterOriginValue.id??afterOriginValue.valor??afterOriginValue.value):afterOriginValue;
  const afterOrigin=/^[0-8]$/.test(String(afterOriginRaw??"").trim())?Number(afterOriginRaw):null;
  const otherTaxFieldsStable=blingHubSameExceptCest(beforeTrib,afterTrib);
  const verified=afterNcm===beforeNcm
    &&afterOrigin===beforeOrigin
    &&afterCest===String(row.proposed_cest||"")
    &&otherTaxFieldsStable;

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"product_fiscal_cest_canary",
    severity:verified?"info":"error",
    domain:"product",
    source_system:"canonical",
    source_id:productId,
    details:{
      ok:verified,
      bling_product_id:blingId,
      stage:"verified",
      before_tributacao:beforeTrib,
      after_tributacao:afterTrib,
      proposed_patch:patchPayload,
      other_tax_fields_stable:otherTaxFieldsStable,
      external_write:true
    }
  });

  if(!verified){
    return {
      ok:false,status:409,error:"post_write_verification_failed",
      product_id:productId,bling_product_id:blingId,
      before:{ncm:beforeNcm,cest:beforeCest||null,origin:beforeOrigin},
      after:{ncm:afterNcm,cest:afterCest||null,origin:afterOrigin},
      other_tax_fields_stable:otherTaxFieldsStable,
      external_write:true,bling_mutations:1
    };
  }

  const evidenceKey=[
    "bling_product_detail",String(blingId),afterNcm||"-",afterCest||"-",
    afterOrigin===null?"-":String(afterOrigin),blingHubDigits(afterProduct?.gtin)||"-",
    blingHubDigits(afterProduct?.gtinEmbalagem??afterProduct?.gtinTributavel??afterProduct?.gtinTrib)||"-"
  ].join(":");
  const ev=await sb.from("product_fiscal_evidence").upsert({
    evidence_key:evidenceKey,
    product_id:productId,
    evidence_type:"bling_product_detail",
    source_name:"Bling ERP",
    document_key:String(blingId),
    gtin:blingHubDigits(afterProduct?.gtin)||blingHubDigits(row.gtin)||null,
    ncm:afterNcm||null,
    cest:afterCest||null,
    origin_code:afterOrigin,
    fiscal_description:clean(afterProduct?.nome||row.name,500)||null,
    observed_at:new Date().toISOString(),
    evidence_payload:{
      bling_product_id:blingId,
      fetched_at:new Date().toISOString(),
      tributacao:afterTrib,
      canary_write_verified:true,
      read_only:false
    }
  },{onConflict:"evidence_key"});
  let qualityRefresh:any={error:null},integrityRefresh:any={error:null};
  if(body?.skip_refresh!==true){
    qualityRefresh=await sb.rpc("refresh_product_fiscal_evidence_quality_v1");
    integrityRefresh=await sb.rpc("refresh_product_fiscal_rule_integrity_v1");
  }

  return {
    ok:true,
    product_id:productId,
    product_name:row.name,
    bling_product_id:blingId,
    cest:afterCest,
    other_tax_fields_stable:otherTaxFieldsStable,
    external_write:true,
    bling_mutations:1,
    verified:true,
    evidence_persisted:!ev.error,
    evidence_error:ev.error?clean(ev.error.message,300):null,
    quality_refresh_ok:!qualityRefresh.error,
    integrity_refresh_ok:!integrityRefresh.error
  };
}
async function blingHubProductFiscalCestBatch(sb:any,body:any){
  const confirmation=clean(body?.confirmation,200);
  if(confirmation!=="APLICAR_LOTE_CEST_VALIDADO"){
    return {
      ok:false,status:409,error:"confirmation_required",
      required_confirmation:"APLICAR_LOTE_CEST_VALIDADO",
      external_write:false
    };
  }

  const limit=Math.max(1,Math.min(25,Number(body?.limit||10)||10));
  const requireSupplierXml=body?.require_supplier_xml!==false;
  const cestFilter=blingHubDigits(body?.cest);
  const requestedIds=(Array.isArray(body?.product_ids)?body.product_ids:[]).map((x:any)=>uuid(x)).filter(Boolean).slice(0,20);

  let rows:any[]=[];
  try{
    if(requestedIds.length){
      let diffQuery=sb.from("product_fiscal_bling_diff_v1")
        .select("product_id,name,proposed_cest,canary_eligible,diff_status")
        .in("product_id",requestedIds)
        .eq("canary_eligible",true)
        .eq("diff_status","cest_missing");
      if(cestFilter)diffQuery=diffQuery.eq("proposed_cest",cestFilter);
      const diff=await diffQuery.order("product_id",{ascending:true}).limit(limit);
      if(diff.error)return {
        ok:false,status:500,error:"batch_direct_diff_query_failed",
        detail:clean(diff.error.message,300),external_write:false,bling_mutations:0
      };
      rows=diff.data||[];
    }else if(requireSupplierXml){
      let scanQuery=sb.from("product_fiscal_catalog_scan_v1")
        .select("product_id,supplier_xml_cest_count")
        .eq("is_active",true)
        .gt("supplier_xml_cest_count",0);
      const scan=await scanQuery
        .order("supplier_xml_cest_count",{ascending:false})
        .order("product_id",{ascending:true})
        .limit(100);
      if(scan.error)return {
        ok:false,status:500,error:"batch_candidate_scan_failed",
        detail:clean(scan.error.message,300),external_write:false,bling_mutations:0
      };
      const candidateIds=(scan.data||[]).map((x:any)=>uuid(x.product_id)).filter(Boolean);
      if(!candidateIds.length){
        return {
          ok:true,selected:0,processed:0,mutated:0,aligned:0,
          stopped_on_error:false,results:[],external_write:false
        };
      }
      let diffQuery=sb.from("product_fiscal_bling_diff_v1")
        .select("product_id,name,proposed_cest,canary_eligible,diff_status")
        .in("product_id",candidateIds)
        .eq("canary_eligible",true)
        .eq("diff_status","cest_missing");
      if(cestFilter)diffQuery=diffQuery.eq("proposed_cest",cestFilter);
      const diff=await diffQuery.order("product_id",{ascending:true}).limit(limit);
      if(diff.error)return {
        ok:false,status:500,error:"batch_diff_query_failed",
        detail:clean(diff.error.message,300),external_write:false,bling_mutations:0
      };
      rows=diff.data||[];
    }else{
      let diffQuery=sb.from("product_fiscal_bling_diff_v1")
        .select("product_id,name,proposed_cest,canary_eligible,diff_status")
        .eq("canary_eligible",true)
        .eq("diff_status","cest_missing");
      if(cestFilter)diffQuery=diffQuery.eq("proposed_cest",cestFilter);
      const diff=await diffQuery.order("product_id",{ascending:true}).limit(limit);
      if(diff.error)return {
        ok:false,status:500,error:"batch_diff_query_failed",
        detail:clean(diff.error.message,300),external_write:false,bling_mutations:0
      };
      rows=diff.data||[];
    }
  }catch(e){
    return {
      ok:false,status:502,error:"batch_selection_exception",
      detail:clean((e as Error)?.message||e,500),
      external_write:false,bling_mutations:0
    };
  }

  const results:any[]=[];
  let mutated=0,aligned=0;
  let stoppedOnError=false;
  const sharedToken=rows.length?await blingHubOauth(sb):null;

  for(const row of rows){
    const productId=uuid(row?.product_id);
    if(!productId)continue;
    try{
      const result=await blingHubProductFiscalCestCanary(sb,{
        product_id:productId,
        confirmation:"APLICAR_CEST_CANARIO:"+productId,
        skip_refresh:true
      },sharedToken);
      results.push(result);
      mutated+=Number(result?.bling_mutations||0);
      if(result?.already_aligned===true)aligned++;
      if(result?.ok!==true){
        stoppedOnError=true;
        break;
      }
    }catch(e){
      results.push({
        ok:false,
        product_id:productId,
        error:"batch_item_exception",
        detail:clean((e as Error)?.message||e,500),
        external_write:"unknown_possible",
        requires_verification:true
      });
      stoppedOnError=true;
      break;
    }
  }

  const qualityRefresh=await sb.rpc("refresh_product_fiscal_evidence_quality_v1");
  const integrityRefresh=await sb.rpc("refresh_product_fiscal_rule_integrity_v1");

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"product_fiscal_cest_batch",
    severity:stoppedOnError?"error":"info",
    domain:"product",
    source_system:"canonical",
    details:{
      selected:rows.length,
      processed:results.length,
      mutated,
      aligned,
      stopped_on_error:stoppedOnError,
      require_supplier_xml:requireSupplierXml,
      cest_filter:cestFilter||null,
      product_ids:rows.map((x:any)=>x.product_id),
      results:results.map((x:any)=>({
        product_id:x?.product_id||null,
        ok:x?.ok===true,
        verified:x?.verified===true,
        already_aligned:x?.already_aligned===true,
        bling_mutations:Number(x?.bling_mutations||0),
        error:x?.error||null
      })),
      quality_refresh_ok:!qualityRefresh.error,
      integrity_refresh_ok:!integrityRefresh.error,
      external_write:mutated>0
    }
  });

  return {
    ok:!stoppedOnError,
    selected:rows.length,
    processed:results.length,
    mutated,
    aligned,
    stopped_on_error:stoppedOnError,
    results,
    require_supplier_xml:requireSupplierXml,
    cest_filter:cestFilter||null,
    quality_refresh_ok:!qualityRefresh.error,
    integrity_refresh_ok:!integrityRefresh.error,
    external_write:mutated>0
  };
}
async function blingHubLookupProductByExactGtin(sb:any,token:string,gtinRaw:any){
  const gtin=blingHubDigits(gtinRaw);
  if(!blingHubValidGtin(gtin))return {status:"review_required",reason:"invalid_gtin",bling_id:null,candidates:[]};
  const q=new URLSearchParams({pagina:"1",limite:"20"});q.append("gtins[]",gtin);
  const r=await blingHubGet(sb,token,"/produtos?"+q.toString());
  if(!r.ok)return {status:"review_required",reason:"product_lookup_http_"+r.status,bling_id:null,candidates:[]};
  const rows=Array.isArray(r.data?.data)?r.data.data:[];
  const exact=rows.filter((p:any)=>[p?.gtin,p?.gtinEmbalagem].map((x:any)=>blingHubDigits(x)).includes(gtin));
  const ids=[...new Set(exact.map((p:any)=>Number(p?.id||0)).filter((x:number)=>x>0))];
  if(ids.length===1)return {status:"matched",reason:"gtin_exact",bling_id:ids[0],candidates:ids};
  if(ids.length>1)return {status:"ambiguous",reason:"multiple_exact_gtin",bling_id:null,candidates:ids};
  return {status:"not_found",reason:"gtin_not_found",bling_id:null,candidates:[]};
}
async function blingHubProductGtinLookupReadonly(sb:any,gtinRaw:any){
  const gtin=blingHubDigits(gtinRaw);
  if(!blingHubValidGtin(gtin)){
    return {ok:false,status:400,error:"invalid_gtin",gtin,external_write:false};
  }
  const token=await blingHubOauth(sb);
  const lookup=await blingHubLookupProductByExactGtin(sb,token,gtin);
  return {
    ok:true,
    gtin,
    lookup_status:lookup.status,
    bling_id:lookup.bling_id||null,
    candidate_ids:lookup.candidates||[],
    reason:lookup.reason||null,
    external_write:false
  };
}
async function blingHubLookupProductByExactCode(sb:any,token:string,codeRaw:any){
  const code=clean(codeRaw,120);
  if(!code)return {status:"not_found",reason:"code_missing",bling_id:null,candidates:[]};
  const ids:number[]=[];
  for(let page=1;page<=1000;page++){
    const q=new URLSearchParams({pagina:String(page),limite:"100",criterio:"5",tipo:"T"});
    const r=await blingHubGet(sb,token,"/produtos?"+q.toString());
    if(!r.ok)return {status:"review_required",reason:"product_code_lookup_http_"+r.status,bling_id:null,candidates:[]};
    const rows=Array.isArray(r.data?.data)?r.data.data:[];
    for(const row of rows){
      if(clean(row?.codigo,120)===code){
        const id=Number(row?.id||0);if(id)ids.push(id);
      }
    }
    if(rows.length<100)break;
    if(page===1000)return {status:"review_required",reason:"product_code_page_guard",bling_id:null,candidates:[]};
  }
  const unique=[...new Set(ids)];
  if(unique.length===1)return {status:"matched",reason:"code_exact",bling_id:unique[0],candidates:unique};
  if(unique.length>1)return {status:"ambiguous",reason:"multiple_exact_code",bling_id:null,candidates:unique};
  return {status:"not_found",reason:"code_not_found",bling_id:null,candidates:[]};
}
async function blingHubCreateProductOnce(sb:any,token:string,payload:any){
  await blingHubReserveSlot(sb);
  try{
    const r=await fetch(BLING_API_BASE+"/produtos",{
      method:"POST",
      headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(15000)
    });
    const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
    const providerDetails=blingHubProviderDetails(data);
    return {ok:r.ok,status:r.status,data,error:r.ok?"":clean(data?.error?.message||data?.error?.description||data?.error||raw,500),provider_details:providerDetails,provider_error:clean(JSON.stringify(data?.error||data||{}),1600),uncertain:false};
  }catch(e){
    return {ok:false,status:0,data:{},error:clean((e as Error)?.message||e,500),provider_details:[],uncertain:true};
  }
}
async function blingHubBindProductLink(sb:any,sourceSystem:string,sourceId:string,blingId:number,gtin:string,method:string){
  const now=new Date().toISOString();
  const up=await sb.from("bling_hub_entity_links_v2").upsert({
    source_system:sourceSystem,entity_type:"product",source_id:sourceId,bling_id:blingId,
    identity_kind:"gtin",identity_value:gtin,status:"matched",last_verified_at:now,updated_at:now,
    metadata:{method,gtin,verified:true,make_used:false}
  },{onConflict:"source_system,entity_type,source_id"});
  if(up.error)throw up.error;
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
      if(!["sync_product","create_product"].includes(job.operation)){
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

      let blingId=Number(link.data?.bling_id||0)||0;
      if(job.operation==="create_product"&&!blingId){
        const gtin=blingHubDigits(local?.gtin);
        if(!blingHubValidGtin(gtin)){
          await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"valid_gtin_required",p_error_message:"A valid GTIN is required to create a Bling product safely",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
          summary.review_required++;continue;
        }

        const fresh=await blingHubLookupProductByExactGtin(sb,token,gtin);
        if(fresh.status==="matched"&&fresh.bling_id){
          blingId=Number(fresh.bling_id);
          await blingHubBindProductLink(sb,job.source_system,job.source_id,blingId,gtin,"gtin_exact_before_create");
        }else if(fresh.status!=="not_found"){
          await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{candidate_ids:fresh.candidates||[]},p_error_code:fresh.reason||"product_identity_unsafe",p_error_message:"Product identity is not safe for creation",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
          summary.review_required++;continue;
        }else{
          const code=clean(local?.sku,120)||gtin;
          const byCode=await blingHubLookupProductByExactCode(sb,token,code);
          if(byCode.status==="matched"&&byCode.bling_id){
            const existingId=Number(byCode.bling_id);
            const detail=await blingHubGet(sb,token,"/produtos/"+encodeURIComponent(String(existingId)));
            const remote=detail.ok?(detail.data?.data||{}):{};
            const remoteCode=clean(remote?.codigo,120);
            const remoteGtins=[remote?.gtin,remote?.gtinEmbalagem].map((x:any)=>blingHubDigits(x)).filter(Boolean);
            if(!detail.ok||remoteCode!==code||(remoteGtins.length&&!remoteGtins.includes(gtin))){
              await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{candidate_ids:[existingId]},p_error_code:"code_match_identity_conflict",p_error_message:"Existing Bling product code conflicts with local identity",p_http_status:detail.status||null,p_retry_seconds:120,p_provider_id:String(existingId)});
              summary.review_required++;continue;
            }
            blingId=existingId;
            await blingHubBindProductLink(sb,job.source_system,job.source_id,blingId,gtin,"code_exact_before_create");
          }else if(byCode.status!=="not_found"){
            await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{candidate_ids:byCode.candidates||[]},p_error_code:byCode.reason||"product_code_identity_unsafe",p_error_message:"Product code identity is not safe for creation",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
            summary.review_required++;continue;
          }
        }

        if(!blingId){
          const createPayload=blingHubProductPayload({},local);
          const rawUnit=clean(createPayload.unidade,20).toUpperCase();
          const unitMap:any={PACOTE:"PCT",PCT:"PCT",UNIDADE:"UN",UN:"UN",CAIXA:"CX",CX:"CX",FARDO:"FD",FD:"FD",QUILO:"KG",KILO:"KG",KG:"KG",LITRO:"L",L:"L"};
          createPayload.unidade=unitMap[rawUnit]||rawUnit.replace(/[^A-Z0-9]/g,"").slice(0,6)||"UN";
          createPayload.codigo=clean(createPayload.codigo,120)||gtin;
          createPayload.gtin=gtin;
          createPayload.tipo=clean(createPayload.tipo,10)||"P";
          createPayload.formato=clean(createPayload.formato,10)||"S";
          if(!clean(createPayload.nome,220)){
            await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"product_name_required",p_error_message:"Product name is required",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
            summary.review_required++;continue;
          }

          const created=await blingHubCreateProductOnce(sb,token,createPayload);
          if(created.ok)blingId=Number(created.data?.data?.id||0)||0;

          if(!created.ok||!blingId){
            await sleep(1200);
            const recovery=await blingHubLookupProductByExactGtin(sb,token,gtin);
            if(recovery.status==="matched"&&recovery.bling_id){
              blingId=Number(recovery.bling_id);
            }else{
              await sb.rpc("finish_bling_hub_job_v2",{
                p_job_id:job.id,p_status:"review_required",
                p_result:{provider_details:created.provider_details||[],provider_error:created.provider_error||null,creation_uncertain:Boolean(created.uncertain||created.status>=500),candidate_ids:recovery.candidates||[]},
                p_error_code:created.uncertain||created.status>=500?"product_creation_uncertain":"product_create_http_"+created.status,
                p_error_message:created.error||"Bling product creation failed",
                p_http_status:created.status||null,p_retry_seconds:120,p_provider_id:null
              });
              summary.review_required++;continue;
            }
          }

          const verify=await blingHubGet(sb,token,"/produtos/"+encodeURIComponent(String(blingId)));
          if(!verify.ok||![verify.data?.data?.gtin,verify.data?.data?.gtinEmbalagem].map((x:any)=>blingHubDigits(x)).includes(gtin)){
            await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{bling_id:blingId},p_error_code:"created_product_verify_failed",p_error_message:"Created Bling product could not be verified by GTIN",p_http_status:verify.status||null,p_retry_seconds:120,p_provider_id:String(blingId)});
            summary.review_required++;continue;
          }
          await blingHubBindProductLink(sb,job.source_system,job.source_id,blingId,gtin,"created_by_hub_v2");
          await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"synced",p_result:{bling_id:blingId,created:true,verified:true,gtin},p_error_code:null,p_error_message:null,p_http_status:created.status||200,p_retry_seconds:120,p_provider_id:String(blingId)});
          summary.synced++;continue;
        }
      }

      if(!blingId){
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"product_not_linked",p_error_message:"Product is not safely linked to Bling",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
        summary.review_required++;continue;
      }
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
    {key:"invoice",path:"/nfe?pagina=1&limite=1"},
    {key:"finance_receivables",path:"/contas/receber?pagina=1&limite=1&situacoes%5B%5D=1"},
    {key:"finance_payables",path:"/contas/pagar?pagina=1&limite=1&situacao=1"},
    {key:"finance_accounts",path:"/contas-contabeis?pagina=1&limite=1&ocultarInvisiveis=true"}
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
  const runtimeUpdate=await sb.from("bling_hub_runtime_v2").update({
    last_readonly_ok_at:allCore?now:null,
    last_readonly_error:allCore?null:"one_or_more_core_probes_failed",
    updated_at:now
  }).eq("id",1);
  if(runtimeUpdate.error)throw runtimeUpdate.error;
  const metaUpdate=await sb.rpc("merge_bling_hub_runtime_metadata_v2",{
    p_patch:{readonly_probe_version:1,probes:results,deposit_candidates:deposits,probed_at:now}
  });
  if(metaUpdate.error)throw metaUpdate.error;
  await sb.from("bling_hub_audit_v2").insert({event_type:"readonly_probe",severity:allCore?"info":"warning",details:{probes:results,deposit_candidates:deposits,external_write:false,make_used:false}});
  const readiness=await blingHubReadinessExtended(sb);
  return {ok:allCore,readonly:true,external_write:false,probes:results,deposit_candidates:deposits,readiness};
}

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
function blingHubBrazilPhone(v:any){
  let d=blingHubDigits(v);
  if((d.length===12||d.length===13)&&d.startsWith("55"))d=d.slice(2);
  return d.slice(0,11);
}
function blingHubSuspiciousPersonName(local:any){
  const doc=blingHubDigits(local?.cpf_cnpj);
  if(doc.length!==11)return false;
  const raw=clean(local?.name,220);
  if(!raw)return true;
  const normalized=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
  const tokens=normalized.split(" ").filter(Boolean);
  if(tokens.length<2)return true;
  const locationPrefixes=new Set(["jd","jardim","bairro","setor","residencial","condominio","cond","rua","avenida","av","travessa","tv","lote","quadra","chacara"]);
  return locationPrefixes.has(tokens[0]);
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

  const name=clean(local?.name,220);
  const currentName=clean(current?.nome,220);
  if(name&&!(currentName&&blingHubSuspiciousPersonName(local)))payload.nome=name;
  const doc=blingHubDigits(local?.cpf_cnpj);
  if(doc){payload.numeroDocumento=doc;payload.tipo=doc.length===14?"J":"F";}
  payload.situacao=local?.is_active===false?"I":"A";
  const phone=blingHubBrazilPhone(local?.primary_whatsapp_e164);
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
async function blingHubEnsureCustomerNow(sb:any,customerIdRaw:any){
  const customerId=uuid(customerIdRaw);
  if(!customerId)return {ok:false,error:"invalid_customer",status:400,external_write:false};
  const local=await blingHubCustomerSnapshot(sb,customerId);
  if(!local)return {ok:false,error:"customer_not_found",status:404,external_write:false};

  const doc=blingHubDigits(local.cpf_cnpj);
  if(!blingHubValidCpfCnpj(doc)){
    return {ok:false,error:"valid_document_required",status:409,external_write:false};
  }

  if(Number(local.bling_contact_id||0)){
    return {
      ok:true,customer_id:customerId,bling_contact_id:Number(local.bling_contact_id),
      already_linked:true,queued:false,external_write:false
    };
  }

  const stamp=String(local.updated_at||new Date().toISOString());
  const queued=await sb.rpc("enqueue_bling_hub_job_v2",{
    p_domain:"customer",
    p_operation:"sync_customer",
    p_source_system:"canonical_ssbes",
    p_source_id:customerId,
    p_idempotency_key:"canonical_ssbes:customer:"+customerId+":"+stamp,
    p_payload:{customer_id:customerId,allow_create:true,requested_from:"order_preflight"},
    p_payload_version:1
  });
  if(queued.error)throw queued.error;

  let processed:any=null;
  try{processed=await blingHubProcessCustomerJobs(sb,1);}catch{}

  const fresh=await blingHubCustomerSnapshot(sb,customerId);
  return {
    ok:true,
    customer_id:customerId,
    bling_contact_id:Number(fresh?.bling_contact_id||0)||null,
    already_linked:false,
    queued:true,
    job_id:queued.data||null,
    processed,
    external_write:Boolean(Number(fresh?.bling_contact_id||0))
  };
}

async function blingHubReconcileCustomerReadonly(sb:any,customerIdRaw:any){
  const customerId=uuid(customerIdRaw);
  if(!customerId)return {ok:false,error:"invalid_customer",status:400,external_write:false};
  const local=await blingHubCustomerSnapshot(sb,customerId);
  if(!local)return {ok:false,error:"customer_not_found",status:404,external_write:false};

  const token=await blingHubOauth(sb);
  const now=new Date().toISOString();
  let status="review_required",reason="",blingId=Number(local.bling_contact_id||0)||null,method="";
  let candidates:number[]=[];

  if(blingId){
    const detail=await blingHubGet(sb,token,"/contatos/"+encodeURIComponent(String(blingId)));
    if(detail.ok){status="matched";method="existing_bling_contact_id";}
    else{status="review_required";reason="existing_bling_contact_http_"+detail.status;blingId=null;}
  }else{
    const found=await blingHubFindContactByDocument(sb,token,local.cpf_cnpj);
    status=found.status;reason=found.reason;blingId=found.bling_id;candidates=found.candidates||[];
    if(status==="matched"&&blingId){
      method="cpf_cnpj_exact";
      const bind=await sb.from("customers")
        .update({bling_contact_id:blingId,last_bling_sync_at:now})
        .eq("id",customerId)
        .is("bling_contact_id",null);
      if(bind.error)throw bind.error;
    }
  }

  const up=await sb.from("bling_hub_entity_links_v2").upsert({
    source_system:"canonical_ssbes",entity_type:"customer",source_id:customerId,bling_id:blingId,
    identity_kind:blingHubDigits(local.cpf_cnpj)?"cpf_cnpj":null,
    identity_value:blingHubDigits(local.cpf_cnpj)||null,
    status,last_verified_at:now,updated_at:now,
    metadata:{method:method||null,reason:reason||null,name:local.name||"",candidate_ids:candidates.slice(0,10),readonly:true}
  },{onConflict:"source_system,entity_type,source_id"});
  if(up.error)throw up.error;

  await sb.from("bling_hub_audit_v2").insert({
    event_type:"customer_reconcile_single_readonly",severity:status==="matched"?"info":"warning",domain:"customer",
    details:{source_id:customerId,status,reason:reason||null,bling_id:blingId,external_write:false,make_used:false}
  });

  return {ok:true,customer_id:customerId,status,reason:reason||null,bling_id:blingId,candidate_ids:candidates.slice(0,5),external_write:false};
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
    desired_keys:Object.keys(payload).sort(),
    phone_shape:{
      current_digits:blingHubDigits(current?.celular).length,
      local_digits:blingHubDigits(local?.primary_whatsapp_e164).length,
      normalized_local_digits:blingHubBrazilPhone(local?.primary_whatsapp_e164).length,
      desired_digits:blingHubDigits(payload?.celular).length
    }
  };
}
async function blingHubFindOrderByExternalKey(sb:any,token:string,externalKey:string){
  const q=new URLSearchParams({pagina:"1",limite:"20"});
  q.append("numerosLojas[]",externalKey);
  const r=await blingHubGet(sb,token,"/pedidos/vendas?"+q.toString());
  if(!r.ok)return {ok:false,status:r.status,match:null,matches:[]};
  const rows=(Array.isArray(r.data?.data)?r.data.data:[])
    .filter((x:any)=>clean(x?.numeroLoja,120)===externalKey);
  if(rows.length===1)return {ok:true,status:r.status,match:rows[0],matches:rows};
  return {ok:true,status:r.status,match:null,matches:rows};
}
async function blingHubCreateOrderOnce(sb:any,token:string,payload:any){
  await blingHubReserveSlot(sb);
  try{
    const r=await fetch(BLING_API_BASE+"/pedidos/vendas",{
      method:"POST",
      headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(15000)
    });
    const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
    const providerDetails=blingHubProviderDetails(data);
    return {
      ok:r.ok,status:r.status,data,
      error:clean(data?.error?.message||data?.error?.description||data?.error||raw,500),
      provider_details:providerDetails,
      uncertain:false
    };
  }catch(e){
    return {ok:false,status:0,data:{},error:clean((e as Error)?.message||e,500),provider_details:[],uncertain:true};
  }
}

async function blingHubPreviewOrderSync(sb:any,payloadRaw:any){
  const payload=payloadRaw&&typeof payloadRaw==="object"?payloadRaw:{};
  const sourceOrderId=clean(payload?.source_order_id,80);
  if(!uuid(sourceOrderId))return {ok:false,error:"invalid_order_snapshot"};

  const blockers:string[]=[];
  const issues=Array.isArray(payload?.issues)?payload.issues.map((x:any)=>clean(x,180)).filter(Boolean):[];
  if(issues.length)blockers.push(...issues);

  const customerId=uuid(payload?.customer?.source_customer_id);
  let contactId:number|null=null;
  if(!customerId){
    blockers.push("customer_not_linked");
  }else{
    const cq=await sb.from("customers").select("id,bling_contact_id,is_active,cpf_cnpj").eq("id",customerId).maybeSingle();
    if(cq.error)throw cq.error;
    contactId=Number(cq.data?.bling_contact_id||0)||null;
    if(!cq.data)blockers.push("customer_not_found");
    else if(cq.data.is_active===false)blockers.push("customer_inactive");
    else if(!contactId&&!blingHubValidCpfCnpj(cq.data.cpf_cnpj))blockers.push("customer_document_required");
    else if(!contactId)blockers.push("customer_missing_bling_contact_id");
  }

  const items=(Array.isArray(payload?.items)?payload.items:[]).slice(0,500);
  if(!items.length)blockers.push("order_without_items");
  const sourceIds=[...new Set(items.map((x:any)=>uuid(x?.product_id)).filter(Boolean))] as string[];
  const linkMap=new Map<string,any>();
  if(sourceIds.length){
    const links=await sb.from("bling_hub_entity_links_v2")
      .select("source_id,bling_id,status")
      .eq("source_system","vitrine_qx")
      .eq("entity_type","product")
      .in("source_id",sourceIds);
    if(links.error)throw links.error;
    for(const row of links.data||[])linkMap.set(row.source_id,row);
  }

  const unresolved:any[]=[];
  const resolved:any[]=[];
  let lineSum=0;
  for(const item of items){
    const productId=uuid(item?.product_id);
    const qty=Number(item?.quantity);
    const unit=Number(item?.unit_price_cents);
    if(!productId||!Number.isFinite(qty)||qty<=0||!Number.isFinite(unit)||unit<0){
      unresolved.push({
        product_id:productId||null,reason:"invalid_item_snapshot",
        sku:clean(item?.sku,120),gtin:blingHubDigits(item?.gtin),name:clean(item?.name,220)
      });
      continue;
    }
    const link=linkMap.get(productId);
    if(!link||link.status!=="matched"||!Number(link.bling_id)){
      unresolved.push({
        product_id:productId,reason:"product_not_linked",
        sku:clean(item?.sku,120),gtin:blingHubDigits(item?.gtin),name:clean(item?.name,220)
      });
      continue;
    }
    const lineTotal=Math.round(qty*unit);
    lineSum+=lineTotal;
    resolved.push({
      product_id:productId,
      bling_product_id:Number(link.bling_id),
      sku:clean(item?.sku,120),
      name:clean(item?.name,220),
      quantity:Math.round(qty*1000)/1000,
      unit_price_cents:Math.round(unit),
      line_total_cents:lineTotal,
      source_kind:clean(item?.source_kind,40)
    });
  }
  if(unresolved.length)blockers.push("unresolved_products");

  const totals=payload?.totals&&typeof payload.totals==="object"?payload.totals:{};
  const expectedProducts=Number(totals?.individual_products_cents);
  const orderTotal=Number(totals?.commercial_order_cents);
  const expectedDelta=Number(totals?.commercial_delta_cents);
  if(!Number.isFinite(orderTotal)||orderTotal<0)blockers.push("invalid_order_total");
  if(!Number.isFinite(expectedProducts)||Math.abs(expectedProducts-lineSum)>1)blockers.push("product_total_mismatch");
  const delta=Number.isFinite(orderTotal)?orderTotal-lineSum:NaN;
  if(!Number.isFinite(expectedDelta)||!Number.isFinite(delta)||Math.abs(expectedDelta-delta)>1)blockers.push("commercial_delta_mismatch");

  const delivery=payload?.delivery&&typeof payload.delivery==="object"?payload.delivery:{};
  for(const [key,label] of [["street","street"],["number","number"],["city","city"],["state","state"]]){
    if(!clean(delivery?.[key],180))blockers.push("delivery_"+label+"_required");
  }

  const uniqueBlockers=[...new Set(blockers)];
  const operationalBlockers:string[]=[];
  const queueReason=clean(payload?.queue_reason,80);
  const payment=payload?.payment&&typeof payload.payment==="object"?payload.payment:{};
  const earlyAwaiting=["awaiting_confirmation","awaiting_confirmation_canary"].includes(queueReason);
  const earlyApproved=queueReason==="approved_early_order";
  const earlyOrder=earlyAwaiting||earlyApproved;
  const separationStarted=queueReason==="first_separation" || payment?.stock_consumed===true;
  const physicalStockHandled=payment?.stock_consumed===true || (separationStarted && payment?.stock_reserved===true);
  const orderStatus=clean(payload?.status,40).toLowerCase();

  if(earlyAwaiting){
    if(!["created","storefront_received"].includes(orderStatus))operationalBlockers.push("awaiting_confirmation_status_required");
  }else if(earlyApproved){
    if(!["confirmed","processing"].includes(orderStatus))operationalBlockers.push("approved_order_status_required");
  }else{
    if(!separationStarted)operationalBlockers.push("first_separation_required");
    if(!physicalStockHandled)operationalBlockers.push("stock_not_consumed");
  }
  if(orderStatus==="cancelled")operationalBlockers.push("order_cancelled");
  if(Number.isFinite(orderTotal)&&orderTotal<7500)operationalBlockers.push("minimum_order_not_met");

  const otherExpenses=Math.max(0,Number.isFinite(delta)?delta:0);
  const discount=Math.max(0,Number.isFinite(delta)?-delta:0);
  const externalKey="VITRINE-"+sourceOrderId.replace(/-/g,"").slice(0,28);
  const createdAt=payload?.created_at?new Date(payload.created_at):new Date();
  const dateCuiaba=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Cuiaba",year:"numeric",month:"2-digit",day:"2-digit"}).format(createdAt);

  let initialBlingStatusId:number|null=null;
  if(earlyOrder){
    const runtime=await sb.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();
    if(runtime.error)throw runtime.error;
    const mapping=runtime.data?.metadata?.ops2_order_status_mapping||{};
    initialBlingStatusId=Number(earlyAwaiting?mapping.awaiting_confirmation_id:mapping.approved_separation_id)||null;
    if(mapping.state!=="prepared"||!initialBlingStatusId)operationalBlockers.push("ops2_status_mapping_not_prepared");
  }
  const writeBlockers=[...new Set([...uniqueBlockers,...operationalBlockers])];

  const orderPayload={
    contato:contactId?{id:contactId}:null,
    data:dateCuiaba,
    numeroLoja:externalKey,
    totalProdutos:Math.round(lineSum)/100,
    total:Number.isFinite(orderTotal)?Math.round(orderTotal)/100:0,
    outrasDespesas:Math.round(otherExpenses)/100,
    desconto:{valor:Math.round(discount)/100,unidade:"REAL"},
    itens:resolved.map((i:any)=>({
      produto:{id:i.bling_product_id},
      codigo:i.sku||undefined,
      descricao:i.name,
      quantidade:i.quantity,
      valor:i.unit_price_cents/100
    })),
    transporte:{etiqueta:{
      nome:clean(payload?.customer?.name,180)||"Cliente Dona Antônia",
      endereco:clean(delivery?.street,180),
      numero:clean(delivery?.number,40),
      complemento:clean([delivery?.complement,delivery?.raw_text].filter(Boolean).join(" · "),220),
      municipio:clean(delivery?.city,120),
      uf:clean(delivery?.state,2).toUpperCase(),
      cep:blingHubDigits(delivery?.postal_code),
      bairro:clean(delivery?.district||delivery?.neighborhood,140)
    }},
    observacoes:"Pedido Vitrine Dona Antônia · "+externalKey+" · Pagamento: "+clean(payload?.payment?.label||payload?.payment?.method,100)
  };
  const createOrderPayload=initialBlingStatusId?{...orderPayload,situacao:{id:initialBlingStatusId}}:orderPayload;

  return {
    ok:true,
    readonly:true,
    external_write:false,
    source_order_id:sourceOrderId,
    ready:uniqueBlockers.length===0,
    blockers:uniqueBlockers,
    write_eligible:writeBlockers.length===0,
    write_blockers:writeBlockers,
    separation_started:separationStarted,
    stock_handled:physicalStockHandled,
    unresolved_products:unresolved,
    resolved_items_count:resolved.length,
    customer_linked:Boolean(contactId),
    external_key:externalKey,
    totals:{
      product_lines_cents:lineSum,
      order_total_cents:Number.isFinite(orderTotal)?Math.round(orderTotal):null,
      other_expenses_cents:Math.round(otherExpenses),
      discount_cents:Math.round(discount),
      balances:Boolean(Number.isFinite(orderTotal)&&Math.abs((lineSum+otherExpenses-discount)-orderTotal)<=1)
    },
    desired_order:orderPayload,
    create_order:createOrderPayload,
    initial_bling_status_id:initialBlingStatusId,
    early_order:earlyOrder
  };
}

function blingHubOrderManagedProjection(order:any){
  const o=order&&typeof order==="object"?order:{};
  const etiqueta=o?.transporte?.etiqueta&&typeof o.transporte.etiqueta==="object"?o.transporte.etiqueta:{};
  const items=Array.isArray(o?.itens)?o.itens:[];
  const moneyCents=(x:any)=>Number.isFinite(Number(x))?Math.round(Number(x)*100):0;
  return {
    contato_id:Number(o?.contato?.id||0)||null,
    numeroLoja:clean(o?.numeroLoja,120),
    totalProdutos_cents:moneyCents(o?.totalProdutos),
    total_cents:moneyCents(o?.total),
    outrasDespesas_cents:moneyCents(o?.outrasDespesas),
    desconto:{
      valor_cents:moneyCents(o?.desconto?.valor),
      unidade:clean(o?.desconto?.unidade,20)
    },
    observacoes:clean(o?.observacoes,1000),
    transporte_etiqueta:{
      nome:clean(etiqueta?.nome,180),
      endereco:clean(etiqueta?.endereco,180),
      numero:clean(etiqueta?.numero,40),
      complemento:clean(etiqueta?.complemento,220),
      municipio:clean(etiqueta?.municipio,120),
      uf:clean(etiqueta?.uf,2).toUpperCase(),
      cep:blingHubDigits(etiqueta?.cep),
      bairro:clean(etiqueta?.bairro,140)
    },
    itens:items.map((i:any)=>({
      produto_id:Number(i?.produto?.id||0)||null,
      codigo:clean(i?.codigo,120),
      // O Bling normaliza a descrição conforme o cadastro do produto.
      // A identidade operacional da linha é produto/código/quantidade/valor;
      // diferenças cosméticas de descrição não devem disparar PUT nem revisão.
      quantidade:Math.round(Number(i?.quantidade||0)*1000)/1000,
      valor_cents:moneyCents(i?.valor)
    })).sort((a:any,b:any)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  };
}
function blingHubOrderPutPayload(current:any,desired:any){
  const keep=["dataSaida","dataPrevista","numeroPedidoCompra","loja","vendedor","situacao","unidadeNegocio","categoria","tributacao","intermediador","taxas","parcelas"];
  const payload:any={};
  for(const key of keep){
    if(current?.[key]!==undefined&&current?.[key]!==null)payload[key]=current[key];
  }
  Object.assign(payload,desired||{});
  payload.transporte={
    ...(current?.transporte&&typeof current.transporte==="object"?current.transporte:{}),
    ...(desired?.transporte&&typeof desired.transporte==="object"?desired.transporte:{})
  };
  if(desired?.transporte?.etiqueta){
    payload.transporte.etiqueta={
      ...(current?.transporte?.etiqueta&&typeof current.transporte.etiqueta==="object"?current.transporte.etiqueta:{}),
      ...desired.transporte.etiqueta
    };
  }
  const currentItems=Array.isArray(current?.itens)?current.itens:[];
  if(Array.isArray(desired?.itens)){
    payload.itens=desired.itens.map((item:any)=>{
      const productId=Number(item?.produto?.id||0);
      const previous=currentItems.find((x:any)=>Number(x?.produto?.id||0)===productId);
      return previous?.naturezaOperacao?{...item,naturezaOperacao:previous.naturezaOperacao}:item;
    });
  }
  delete payload.id;
  return payload;
}
function blingHubOrderManagedDiff(current:any,desired:any){
  const a=blingHubOrderManagedProjection(current),b=blingHubOrderManagedProjection(desired);
  const diff:any={};
  for(const key of Object.keys(b)){
    if(JSON.stringify((a as any)[key])!==JSON.stringify((b as any)[key]))diff[key]={from:(a as any)[key],to:(b as any)[key]};
  }
  return diff;
}

async function blingHubProcessOrderJobs(sb:any,limitRaw:any){
  const worker="bling-order-edge-"+crypto.randomUUID();
  const syncedCount=await sb.from("bling_hub_jobs_v2").select("id",{count:"exact",head:true})
    .eq("domain","order").eq("status","synced");
  if(syncedCount.error)throw syncedCount.error;

  const firstOrderCanary=Number(syncedCount.count||0)===0;
  const requestedLimit=Math.max(1,Math.min(5,Number(limitRaw||1)||1));
  const limit=firstOrderCanary?1:requestedLimit;

  const claim=await sb.rpc("claim_bling_hub_jobs_v2",{
    p_worker:worker,p_domains:["order"],p_limit:limit,p_lease_seconds:300
  });
  if(claim.error)throw claim.error;

  const jobs=claim.data||[];
  const summary:any={
    ok:true,claimed:jobs.length,processed:0,synced:0,review_required:0,retry:0,failed:0,existing:0,created:0,updated:0,unchanged:0,
    first_order_canary:firstOrderCanary,canary_attempted:false,canary_passed:false,canary_paused:false
  };
  if(!jobs.length)return summary;

  const token=await blingHubOauth(sb);
  let canaryWriteAttempted=false;
  let canaryWriteFailed=false;

  for(const job of jobs){
    summary.processed++;
    try{
      if(job.operation==="sync_order_status"){
        const localStatus=clean(job.payload?.local_status,40);
        const [runtime,link]=await Promise.all([
          sb.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle(),
          sb.from("bling_hub_entity_links_v2")
            .select("bling_id,status")
            .eq("source_system","vitrine_qx")
            .eq("entity_type","order")
            .eq("source_id",job.source_id)
            .maybeSingle()
        ]);
        if(runtime.error)throw runtime.error;
        if(link.error)throw link.error;
        if(!link.data||link.data.status!=="matched"||!Number(link.data.bling_id)){
          await sb.rpc("finish_bling_hub_job_v2",{
            p_job_id:job.id,p_status:"synced",
            p_result:{local_status:localStatus,no_external_order:true,external_write:false},
            p_error_code:null,p_error_message:null,p_http_status:null,p_retry_seconds:120,p_provider_id:null
          });
          summary.synced++;
          continue;
        }
        const catalog=runtime.data?.metadata?.order_status_catalog||{};
        if(catalog.status_updates_enabled!==true){
          await sb.rpc("finish_bling_hub_job_v2",{
            p_job_id:job.id,p_status:"review_required",
            p_result:{
              local_status:localStatus,
              bling_order_id:Number(link.data.bling_id),
              catalog_state:clean(catalog.state,80)||"unknown",
              required_resource:clean(catalog.required_resource,120)||null,
              external_write:false
            },
            p_error_code:"order_status_updates_disabled",
            p_error_message:"Order status update is disabled until the Bling status catalog is authorized",
            p_http_status:Number(catalog.http_status||0)||null,p_retry_seconds:120,p_provider_id:String(link.data.bling_id)
          });
          summary.review_required++;
          continue;
        }
        await sb.rpc("finish_bling_hub_job_v2",{
          p_job_id:job.id,p_status:"review_required",
          p_result:{local_status:localStatus,bling_order_id:Number(link.data.bling_id),external_write:false},
          p_error_code:"order_status_mapping_not_approved",
          p_error_message:"Order status catalog is available but no approved local-to-Bling mapping is active",
          p_http_status:null,p_retry_seconds:120,p_provider_id:String(link.data.bling_id)
        });
        summary.review_required++;
        continue;
      }
      if(job.operation!=="sync_order"){
        await sb.rpc("finish_bling_hub_job_v2",{
          p_job_id:job.id,p_status:"review_required",p_result:{},
          p_error_code:"unsupported_operation",p_error_message:"Unsupported order operation",
          p_http_status:null,p_retry_seconds:120,p_provider_id:null
        });
        summary.review_required++;
        continue;
      }

      const preview=await blingHubPreviewOrderSync(sb,job.payload);
      if(!preview.ok||!preview.write_eligible){
        await sb.rpc("finish_bling_hub_job_v2",{
          p_job_id:job.id,p_status:"review_required",
          p_result:{
            blockers:preview.blockers||[],
            write_blockers:preview.write_blockers||[],
            unresolved_products:preview.unresolved_products||[],
            totals:preview.totals||{}
          },
          p_error_code:"order_not_write_eligible",
          p_error_message:"Order snapshot is not eligible for Bling write",
          p_http_status:null,p_retry_seconds:120,p_provider_id:null
        });
        summary.review_required++;
        continue;
      }

      if(firstOrderCanary){
        canaryWriteAttempted=true;
        summary.canary_attempted=true;
      }

      const externalKey=String(preview.external_key);
      const existing=await blingHubFindOrderByExternalKey(sb,token,externalKey);

      if(!existing.ok){
        const transient=existing.status===429||existing.status>=500;
        const st=transient?"retry":"review_required";
        await sb.rpc("finish_bling_hub_job_v2",{
          p_job_id:job.id,p_status:st,p_result:{external_key:externalKey},
          p_error_code:"order_reconcile_http_"+existing.status,
          p_error_message:"Could not reconcile Bling order before create",
          p_http_status:existing.status,p_retry_seconds:120,p_provider_id:null
        });
        if(firstOrderCanary&&!transient)canaryWriteFailed=true;
        summary[st]++;
        continue;
      }

      if(existing.matches.length>1){
        await sb.rpc("finish_bling_hub_job_v2",{
          p_job_id:job.id,p_status:"review_required",
          p_result:{external_key:externalKey,match_count:existing.matches.length},
          p_error_code:"duplicate_external_order_key",
          p_error_message:"More than one Bling order has the same external key",
          p_http_status:200,p_retry_seconds:120,p_provider_id:null
        });
        if(firstOrderCanary)canaryWriteFailed=true;
        summary.review_required++;
        continue;
      }

      let blingOrderId=Number(existing.match?.id||0)||null;
      let creationResult:any=null;

      if(!blingOrderId){
        creationResult=await blingHubCreateOrderOnce(sb,token,preview.create_order||preview.desired_order);
        if(!creationResult.ok){
          if(creationResult.status===429){
            await sb.rpc("finish_bling_hub_job_v2",{
              p_job_id:job.id,p_status:"retry",p_result:{external_key:externalKey},
              p_error_code:"order_create_rate_limited",
              p_error_message:creationResult.error||"Bling rate limited order creation",
              p_http_status:429,p_retry_seconds:120,p_provider_id:null
            });
            summary.retry++;
            continue;
          }

          // POST is never blindly retried. Reconcile by the immutable external key first.
          await sleep(1200);
          const recovery=await blingHubFindOrderByExternalKey(sb,token,externalKey);
          if(recovery.ok&&recovery.matches.length===1){
            blingOrderId=Number(recovery.match?.id||0)||null;
          }else{
            await sb.rpc("finish_bling_hub_job_v2",{
              p_job_id:job.id,p_status:"review_required",
              p_result:{
                external_key:externalKey,
                provider_details:creationResult.provider_details||[],
                creation_uncertain:Boolean(creationResult.uncertain||creationResult.status>=500)
              },
              p_error_code:creationResult.uncertain||creationResult.status>=500
                ?"order_creation_uncertain"
                :"order_create_http_"+creationResult.status,
              p_error_message:creationResult.error||"Bling order creation failed",
              p_http_status:creationResult.status||null,p_retry_seconds:120,p_provider_id:null
            });
            if(firstOrderCanary)canaryWriteFailed=true;
            summary.review_required++;
            continue;
          }
        }else{
          blingOrderId=Number(creationResult.data?.data?.id||0)||null;
          if(!blingOrderId){
            await sleep(1200);
            const recovery=await blingHubFindOrderByExternalKey(sb,token,externalKey);
            if(recovery.ok&&recovery.matches.length===1){
              blingOrderId=Number(recovery.match?.id||0)||null;
            }
          }
        }
      }

      if(!blingOrderId){
        await sb.rpc("finish_bling_hub_job_v2",{
          p_job_id:job.id,p_status:"review_required",
          p_result:{external_key:externalKey},
          p_error_code:"bling_order_id_missing",
          p_error_message:"Bling order outcome could not be identified safely",
          p_http_status:creationResult?.status||null,p_retry_seconds:120,p_provider_id:null
        });
        if(firstOrderCanary)canaryWriteFailed=true;
        summary.review_required++;
        continue;
      }

      const detail=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)));
      if(!detail.ok){
        await sb.rpc("finish_bling_hub_job_v2",{
          p_job_id:job.id,p_status:"review_required",
          p_result:{external_key:externalKey,bling_order_id:blingOrderId},
          p_error_code:"post_create_verify_http_"+detail.status,
          p_error_message:"Bling order exists but verification failed",
          p_http_status:detail.status,p_retry_seconds:120,p_provider_id:String(blingOrderId)
        });
        if(firstOrderCanary)canaryWriteFailed=true;
        summary.review_required++;
        continue;
      }

      let remote=detail.data?.data||{};
      const expectedTotal=Number(preview.totals?.order_total_cents||0);
      let managedChanges:any={};
      let updatedExisting=false;

      if(existing.match){
        managedChanges=blingHubOrderManagedDiff(remote,preview.desired_order);
        if(Object.keys(managedChanges).length){
          if(Number(remote?.notaFiscal?.id||0)){
            await sb.rpc("finish_bling_hub_job_v2",{
              p_job_id:job.id,p_status:"review_required",
              p_result:{external_key:externalKey,bling_order_id:blingOrderId,changes:managedChanges},
              p_error_code:"order_has_invoice",
              p_error_message:"Bling order already has an invoice and was not changed",
              p_http_status:409,p_retry_seconds:120,p_provider_id:String(blingOrderId)
            });
            summary.review_required++;
            continue;
          }
          const putPayload=blingHubOrderPutPayload(remote,preview.desired_order);
          const write=await blingHubWriteIdempotent(
            sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)),"PUT",putPayload
          );
          if(!write.ok){
            const st=write.status===429||write.status>=500||write.status===0?"retry":"review_required";
            await sb.rpc("finish_bling_hub_job_v2",{
              p_job_id:job.id,p_status:st,
              p_result:{external_key:externalKey,bling_order_id:blingOrderId,changes:managedChanges,provider_details:write.provider_details||[]},
              p_error_code:"order_put_http_"+write.status,
              p_error_message:write.error||"Bling order update failed",
              p_http_status:write.status||null,p_retry_seconds:120,p_provider_id:String(blingOrderId)
            });
            summary[st]++;
            continue;
          }
          const after=await blingHubGet(sb,token,"/pedidos/vendas/"+encodeURIComponent(String(blingOrderId)));
          if(!after.ok){
            await sb.rpc("finish_bling_hub_job_v2",{
              p_job_id:job.id,p_status:"review_required",
              p_result:{external_key:externalKey,bling_order_id:blingOrderId,changes:managedChanges,write_ok:true},
              p_error_code:"post_update_order_verify_http_"+after.status,
              p_error_message:"Bling order update succeeded but verification failed",
              p_http_status:after.status,p_retry_seconds:120,p_provider_id:String(blingOrderId)
            });
            summary.review_required++;
            continue;
          }
          remote=after.data?.data||{};
          const remaining=blingHubOrderManagedDiff(remote,preview.desired_order);
          if(Object.keys(remaining).length){
            await sb.rpc("finish_bling_hub_job_v2",{
              p_job_id:job.id,p_status:"review_required",
              p_result:{external_key:externalKey,bling_order_id:blingOrderId,changes:managedChanges,remaining},
              p_error_code:"post_update_order_mismatch",
              p_error_message:"Bling order differs after update",
              p_http_status:200,p_retry_seconds:120,p_provider_id:String(blingOrderId)
            });
            summary.review_required++;
            continue;
          }
          updatedExisting=true;
          summary.updated++;
        }else{
          summary.unchanged++;
        }
      }

      const remoteKey=clean(remote?.numeroLoja,120);
      const remoteTotal=Math.round(Number(remote?.total||0)*100);
      if(remoteKey!==externalKey||Math.abs(remoteTotal-expectedTotal)>1){
        await sb.rpc("finish_bling_hub_job_v2",{
          p_job_id:job.id,p_status:"review_required",
          p_result:{
            external_key:externalKey,bling_order_id:blingOrderId,
            remote_key_matches:remoteKey===externalKey,
            total_matches:Math.abs(remoteTotal-expectedTotal)<=1,
            updated:updatedExisting
          },
          p_error_code:"post_create_order_mismatch",
          p_error_message:"Bling order verification did not match local snapshot",
          p_http_status:200,p_retry_seconds:120,p_provider_id:String(blingOrderId)
        });
        if(firstOrderCanary)canaryWriteFailed=true;
        summary.review_required++;
        continue;
      }

      const now=new Date().toISOString();
      const link=await sb.from("bling_hub_entity_links_v2").upsert({
        source_system:"vitrine_qx",entity_type:"order",source_id:job.source_id,bling_id:blingOrderId,
        identity_kind:"numeroLoja",identity_value:externalKey,status:"matched",
        last_verified_at:now,updated_at:now,
        metadata:{verified:true,total_cents:expectedTotal,created_by_hub:!existing.match,updated_by_hub:updatedExisting,make_used:false}
      },{onConflict:"source_system,entity_type,source_id"});
      if(link.error)throw link.error;

      await sb.rpc("finish_bling_hub_job_v2",{
        p_job_id:job.id,p_status:"synced",
        p_result:{bling_order_id:blingOrderId,external_key:externalKey,verified:true,created:!existing.match,updated:updatedExisting,changes:managedChanges},
        p_error_code:null,p_error_message:null,p_http_status:200,p_retry_seconds:120,
        p_provider_id:String(blingOrderId)
      });

      summary.synced++;
      if(firstOrderCanary)summary.canary_passed=true;
      if(existing.match){summary.existing++;}else{summary.created++;}
    }catch(e){
      const msg=clean((e as Error)?.message||e,500);
      await sb.rpc("finish_bling_hub_job_v2",{
        p_job_id:job.id,p_status:"review_required",p_result:{},
        p_error_code:"order_worker_exception",p_error_message:msg,
        p_http_status:null,p_retry_seconds:120,p_provider_id:null
      });
      if(firstOrderCanary&&canaryWriteAttempted)canaryWriteFailed=true;
      summary.review_required++;
    }
  }

  if(firstOrderCanary&&canaryWriteAttempted){
    const now=new Date().toISOString();

    if(summary.canary_passed){
      const rollout=await sb.rpc("set_bling_hub_order_rollout_v2",{
        p_state:"canary_passed",
        p_details:{
          passed_at:now,
          job_id:jobs[0]?.id||null,
          source_id:jobs[0]?.source_id||null
        },
        p_disable_orders:false
      });
      if(rollout.error)throw rollout.error;

      await sb.from("bling_hub_audit_v2").insert({
        event_type:"order_canary_passed",severity:"info",domain:"order",
        details:{
          job_id:jobs[0]?.id||null,source_id:jobs[0]?.source_id||null,
          created:summary.created,existing:summary.existing,make_used:false
        }
      });
    }else if(canaryWriteFailed){
      const rollout=await sb.rpc("set_bling_hub_order_rollout_v2",{
        p_state:"paused_after_canary_failure",
        p_details:{
          paused_at:now,
          job_id:jobs[0]?.id||null,
          source_id:jobs[0]?.source_id||null
        },
        p_disable_orders:true
      });
      if(rollout.error)throw rollout.error;

      await sb.from("bling_hub_audit_v2").insert({
        event_type:"order_canary_paused",severity:"error",domain:"order",
        details:{
          job_id:jobs[0]?.id||null,source_id:jobs[0]?.source_id||null,
          reason:"non_transient_or_verification_failure",make_used:false
        }
      });
      summary.canary_paused=true;
    }
  }

  return summary;
}
async function blingHubCreateContactOnce(sb:any,token:string,payload:any){
  await blingHubReserveSlot(sb);
  try{
    const r=await fetch(BLING_API_BASE+"/contatos",{
      method:"POST",
      headers:{Authorization:"Bearer "+token,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(15000)
    });
    const raw=await r.text();let data:any={};try{data=raw?JSON.parse(raw):{}}catch{}
    const providerDetails=blingHubProviderDetails(data);
    return {ok:r.ok,status:r.status,data,error:r.ok?"":clean(data?.error?.message||data?.error?.description||data?.error||raw,500),provider_details:providerDetails,provider_error:clean(JSON.stringify(data?.error||data||{}),1600),uncertain:false};
  }catch(e){
    return {ok:false,status:0,data:{},error:clean((e as Error)?.message||e,500),provider_details:[],uncertain:true};
  }
}
async function blingHubBindCustomer(sb:any,customerId:string,blingId:number,doc:string,method:string){
  const now=new Date().toISOString();
  const bind=await sb.from("customers").update({bling_contact_id:blingId,last_bling_sync_at:now}).eq("id",customerId);
  if(bind.error)throw bind.error;
  const up=await sb.from("bling_hub_entity_links_v2").upsert({
    source_system:"canonical_ssbes",entity_type:"customer",source_id:customerId,bling_id:blingId,
    identity_kind:"cpf_cnpj",identity_value:doc,status:"matched",last_verified_at:now,updated_at:now,
    metadata:{method,verified:true,make_used:false}
  },{onConflict:"source_system,entity_type,source_id"});
  if(up.error)throw up.error;
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
      let blingId=Number(local.bling_contact_id||0)||0;
      let createdContact=false;
      if(!blingId){
        const doc=blingHubDigits(local.cpf_cnpj);
        if(!blingHubValidCpfCnpj(doc)){
          await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"valid_document_required",p_error_message:"Valid CPF/CNPJ is required for safe Bling contact creation",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
          summary.review_required++;continue;
        }

        const found=await blingHubFindContactByDocument(sb,token,doc);
        if(found.status==="matched"&&found.bling_id){
          blingId=Number(found.bling_id);
          await blingHubBindCustomer(sb,local.id,blingId,doc,"cpf_cnpj_exact_before_create");
        }else if(found.status!=="not_found"){
          await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{candidate_ids:found.candidates||[]},p_error_code:found.reason||"customer_identity_unsafe",p_error_message:"Customer identity is not safe for creation",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
          summary.review_required++;continue;
        }else if(job.payload?.allow_create===true){
          const desired=blingHubCustomerPayload({},local);
          if(!clean(desired.nome,220)||!blingHubValidCpfCnpj(desired.numeroDocumento)){
            await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"customer_create_payload_invalid",p_error_message:"Customer create payload is incomplete",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
            summary.review_required++;continue;
          }
          const created=await blingHubCreateContactOnce(sb,token,desired);
          if(created.ok)blingId=Number(created.data?.data?.id||0)||0;
          if(!created.ok||!blingId){
            await sleep(1200);
            const recovery=await blingHubFindContactByDocument(sb,token,doc);
            if(recovery.status==="matched"&&recovery.bling_id){
              blingId=Number(recovery.bling_id);
            }else{
              await sb.rpc("finish_bling_hub_job_v2",{
                p_job_id:job.id,p_status:"review_required",
                p_result:{provider_details:created.provider_details||[],provider_error:created.provider_error||null,creation_uncertain:Boolean(created.uncertain||created.status>=500),candidate_ids:recovery.candidates||[]},
                p_error_code:created.uncertain||created.status>=500?"customer_creation_uncertain":"contact_create_http_"+created.status,
                p_error_message:created.error||"Bling contact creation failed",
                p_http_status:created.status||null,p_retry_seconds:120,p_provider_id:null
              });
              summary.review_required++;continue;
            }
          }
          const verify=await blingHubGet(sb,token,"/contatos/"+encodeURIComponent(String(blingId)));
          if(!verify.ok||blingHubDigits(verify.data?.data?.numeroDocumento)!==doc){
            await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{bling_id:blingId},p_error_code:"created_contact_verify_failed",p_error_message:"Created Bling contact could not be verified by document",p_http_status:verify.status||null,p_retry_seconds:120,p_provider_id:String(blingId)});
            summary.review_required++;continue;
          }
          await blingHubBindCustomer(sb,local.id,blingId,doc,"created_by_hub_v2");
          createdContact=true;
        }else{
          await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:"review_required",p_result:{},p_error_code:"customer_create_not_authorized",p_error_message:"Customer creation requires explicit authorization",p_http_status:null,p_retry_seconds:120,p_provider_id:null});
          summary.review_required++;continue;
        }
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
        await sb.rpc("finish_bling_hub_job_v2",{p_job_id:job.id,p_status:status,p_result:{changes,provider_details:write.provider_details||[],provider_error:write.provider_error||null},p_error_code:"contact_put_http_"+write.status,p_error_message:write.error||"Bling contact update failed",p_http_status:write.status||null,p_retry_seconds:120,p_provider_id:String(blingId)});
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
      p_payload:{customer_id:customerId,allow_create:blingHubValidCpfCnpj(snapshot?.cpf_cnpj)},p_payload_version:1
    });
    if(q.error)throw q.error;
  }catch(e){
    console.error("bling_customer_enqueue_failed",clean((e as Error)?.message||e,300));
  }
  return {ok:true,customer_id:customerId,customer:savedCustomer};
}

async function vitrineAdminAuth(sb:any,req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false,status:401,error:"admin_auth_required"};
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  if(userError||!userData?.user?.id)return {ok:false,status:401,error:"admin_session_invalid"};
  const {data:admin,error:adminError}=await sb.from("admin_users")
    .select("role,is_active")
    .eq("user_id",userData.user.id)
    .maybeSingle();
  if(adminError)return {ok:false,status:500,error:"admin_lookup_failed"};
  if(!admin?.is_active)return {ok:false,status:403,error:"admin_not_authorized"};
  return {ok:true,status:200,user_id:userData.user.id,role:admin.role||"viewer"};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return json({ok:false,error:"server_config"},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const requestUrl=new URL(req.url);
  if(req.method==="GET"){
    if(requestUrl.searchParams.has("code")||requestUrl.searchParams.has("state")||requestUrl.searchParams.has("error")){
      try{return await blingOauthCallback(sb,req)}catch(e){console.error("bling_oauth_callback",clean((e as Error)?.message||e,300));return Response.redirect("https://donaantonia.com.br/vitrine/admin/?bling_oauth=error&detail=callback_failed#today",302)}
    }
    return Response.redirect("https://donaantonia.com.br/vitrine/admin/",302);
  }
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  if(requestUrl.searchParams.get("source")==="bling-webhook-v2"){
    const rawBody=await req.text();
    try{return await blingWebhookReceive(sb,req,rawBody)}
    catch(e){
      console.error("bling_webhook_receive",clean((e as Error)?.message||e,300));
      return json({ok:false,error:"webhook_receive_failed"},500);
    }
  }
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action||"dashboard",60).toLowerCase();

  if(action==="purchase_xml"){
    return await handlePurchaseXmlRequest(req,body,false);
  }

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
      if(subaction==="finance_overview"){
        const financeUser=await blingHubFinanceAuthorizedUser(sb,req);
        if(!financeUser.ok)return json({ok:false,error:financeUser.error},Number(financeUser.status||401));
        const result=await blingHubFinanceOverview(sb);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="finance_action"){
        const financeUser=await blingHubFinanceAuthorizedUser(sb,req);
        if(!financeUser.ok)return json({ok:false,error:financeUser.error},Number(financeUser.status||401));
        const result=await blingHubFinanceAction(sb,body,financeUser.user_id||null);
        return json(result,result.ok?200:Number(result.status||409));
      }

      if(subaction==="purchase_xml_daily_sync"){
        return await handlePurchaseXmlRequest(req,{purchase_action:"daily_sync"},true);
      }
      if(subaction==="fiscal_nfe_entry_backfill"){
        const result=await blingHubNfeEntryBackfill(sb,body?.steps);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="product_fiscal_audit_readonly"){
        const result=await blingHubProductFiscalAuditReadonly(sb,body);
        return json(result,result.ok?200:207);
      }
      if(subaction==="product_fiscal_cest_canary"){
        try{
          const result=await blingHubProductFiscalCestCanary(sb,body);
          return json(result,result.ok?200:Number(result.status||409));
        }catch(e){
          return json({
            ok:false,
            error:"product_fiscal_cest_canary_exception",
            detail:clean((e as Error)?.message||e,500),
            external_write:"unknown_possible",
            requires_verification:true
          },502);
        }
      }
      if(subaction==="product_fiscal_cest_batch"){
        try{
          const result=await blingHubProductFiscalCestBatch(sb,body);
          return json(result,result.ok?200:409);
        }catch(e){
          return json({
            ok:false,
            error:"product_fiscal_cest_batch_exception",
            detail:clean((e as Error)?.message||e,500),
            external_write:"unknown_possible",
            requires_verification:true
          },502);
        }
      }
      if(subaction==="reconcile_products_readonly"){
        const result=await blingHubReconcileProductsReadonly(sb,body?.items);
        return json(result,200);
      }
      if(subaction==="reconcile_product_catalog_readonly"){
        const result=await blingHubReconcileProductCatalogReadonly(sb,body?.items);
        return json(result,200);
      }
      if(subaction==="product_gtin_lookup_readonly"){
        const result=await blingHubProductGtinLookupReadonly(sb,body?.gtin);
        return json(result,result.ok?200:Number(result.status||409));
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
      if(subaction==="reconcile_customer_readonly"){
        const result=await blingHubReconcileCustomerReadonly(sb,body?.customer_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ensure_customer_now"){
        const result=await blingHubEnsureCustomerNow(sb,body?.customer_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="preview_customer_sync"){
        const result=await blingHubPreviewCustomerSync(sb,body?.customer_id);
        return json(result,result.ok?200:409);
      }
      if(subaction==="process_customer_jobs"){
        const result=await blingHubProcessCustomerJobs(sb,body?.limit);
        return json(result,200);
      }
      if(subaction==="order_status_catalog"){
        const result=await blingHubOrderStatusCatalog(sb);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ops2_webhook_receiver_canary"){
        const result=await blingHubOps2WebhookReceiverCanary(sb);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ops2_webhook_reconcile_canary"){
        const result=await blingHubOps2WebhookReconcileCanary(sb,body?.event_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ops2_stock_mirror_event_canary"){
        const result=await blingHubOps2StockMirrorEventCanary(sb,body?.event_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ops2_stock_mirror_backfill_batch"){
        const result=await blingHubOps2StockMirrorBackfillBatch(sb,body?.after_bling_id,body?.limit);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ops2_prepare_order_workflow"){
        const result=await blingHubOps2PrepareOrderWorkflow(sb);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="preview_order_sync"){
        const result=await blingHubPreviewOrderSync(sb,body?.payload);
        return json(result,result.ok?200:409);
      }
      if(subaction==="ops2_order_remote_probe"){
        const result=await blingHubOps2OrderRemoteProbe(sb,body?.source_order_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ops2_canary_order_status"){
        const result=await blingHubOps2CanaryOrderStatus(sb,body?.source_order_id,body?.target_key);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ops2_ensure_order_state"){
        const result=await blingHubOps2EnsureOrderState(sb,body?.payload,body?.target_key,body?.canary===true);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ops2_physical_stock_canary"){
        const result=await blingHubOps2PhysicalStockCanary(sb,body?.payload);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="ops2_launch_physical_stock"){
        const result=await blingHubOps2LaunchPhysicalStock(sb,body?.payload);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="order_link_status"){
        const result=await blingHubVitrineOrderLinkStatus(sb,body?.source_order_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="fiscal_status"){
        const result=await blingHubVitrineFiscalStatus(sb,body?.source_order_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="fiscal_dispatch_gate"){
        const result=await blingHubVitrineDispatchFiscalGate(sb,body?.source_order_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="fiscal_dispatch_preview"){
        const result=await blingHubVitrineDispatchFiscalPreview(sb,body?.source_order_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="fiscal_document_pdf"){
        const result=await blingHubVitrineDanfePdf(sb,body?.source_order_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="fiscal_dispatch_canary_arm"){
        const result=await blingHubVitrineDispatchFiscalArm(sb,body?.source_order_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="fiscal_dispatch_canary_disarm"){
        const result=await blingHubVitrineDispatchFiscalDisarm(sb);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="fiscal_dispatch_canary_human_execute"){
        const result=await blingHubVitrineDispatchFiscalHumanExecute(sb,body?.source_order_id,body?.confirmation);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="fiscal_dispatch_canary"){
        const result=await blingHubVitrineDispatchFiscalCanary(sb,body?.source_order_id);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="fiscal_pending_orders"){
        const result=await blingHubVitrinePendingClosures(sb,body?.limit);
        return json(result,200);
      }
      if(subaction==="fiscal_confirm_payment"){
        const result=await blingHubVitrineConfirmFiscalPayment(sb,body?.source_order_id,body?.payment_method);
        return json(result,result.ok?200:Number(result.status||409));
      }
      if(subaction==="process_order_jobs"){
        const result=await blingHubProcessOrderJobs(sb,body?.limit);
        return json(result,200);
      }
      if(subaction==="process_cycle"){
        const limit=Math.max(1,Math.min(10,Number(body?.limit||3)||3));
        const results:any={};
        results.products=await blingHubProcessProductJobs(sb,limit);
        results.stock=await blingHubProcessStockJobs(sb,limit);
        results.customers=await blingHubProcessCustomerJobs(sb,limit);
        results.orders=await blingHubProcessOrderJobs(sb,Math.min(limit,3));
        results.webhooks=await blingHubProcessWebhookInbox(sb,limit);
        return json({ok:true,cycle:true,results},200);
      }
      if(subaction==="ops2_order_stock_probe"){
        const result=await blingHubOps2OrderStockProbe(sb,body?.source_order_id,body?.limit);
        return json(result,result.ok?200:Number(result.status||409));
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
        const allowedOperations=new Set(["sync_product","create_product","set_stock","sync_customer","sync_order","sync_order_status","prepare_fiscal"]);
        if(!allowedDomains.has(domain)||!allowedOperations.has(operation)||!sourceId||!key)return json({ok:false,error:"invalid_job"},400);
        if(domain==="order"&&operation==="sync_order_status"){
          const runtime=await sb.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();
          if(runtime.error)throw runtime.error;
          const catalog=runtime.data?.metadata?.order_status_catalog||{};
          if(catalog.status_updates_enabled!==true){
            return json({
              ok:true,queued:false,skipped:true,
              reason:"order_status_updates_disabled",
              catalog_state:clean(catalog.state,80)||"unknown",
              required_resource:clean(catalog.required_resource,120)||null,
              http_status:Number(catalog.http_status||0)||null,
              external_write:false
            },200);
          }
        }
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
        const allowedOperations=new Set(["sync_product","create_product","set_stock","sync_customer","sync_order","sync_order_status","prepare_fiscal"]);
        const ids:any[]=[];
        let skippedStatusJobs=0;
        let statusCatalog:any=null;
        if(jobs.some((job:any)=>clean(job?.domain,40)==="order"&&clean(job?.operation,80)==="sync_order_status")){
          const runtime=await sb.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();
          if(runtime.error)throw runtime.error;
          statusCatalog=runtime.data?.metadata?.order_status_catalog||{};
        }
        for(const job of jobs){
          const domain=clean(job?.domain,40),operation=clean(job?.operation,80),sourceId=clean(job?.source_id,160),key=clean(job?.idempotency_key,240);
          if(!allowedDomains.has(domain)||!allowedOperations.has(operation)||!sourceId||!key)return json({ok:false,error:"invalid_job_batch"},400);
          if(domain==="order"&&operation==="sync_order_status"&&statusCatalog?.status_updates_enabled!==true){
            skippedStatusJobs++;
            continue;
          }
          const q=await sb.rpc("enqueue_bling_hub_job_v2",{
            p_domain:domain,p_operation:operation,p_source_system:"vitrine_qx",p_source_id:sourceId,
            p_idempotency_key:key,p_payload:obj(job?.payload),p_payload_version:1
          });
          if(q.error)throw q.error;
          ids.push(q.data);
        }
        return json({
          ok:true,queued:ids.length,job_ids:ids,
          skipped_status_jobs:skippedStatusJobs,
          status_sync_skipped:skippedStatusJobs>0,
          external_write:false
        });
      }
      return json({ok:false,error:"writes_disabled",mode:"observe"},409);
    }catch(e){
      const message=clean((e as Error)?.message||e,300);
      await sb.from("bling_hub_runtime_v2").update({last_readonly_error:message,updated_at:new Date().toISOString()}).eq("id",1);
      return json({ok:false,error:message,readonly:true,external_write:false},502);
    }
  }

  if(action==="vitrine_customer_lookup_phone"){
    const rawPhone=clean(body?.phone,40);
    const suffix=vitrineDigits(body?.phone_suffix||rawPhone,8).slice(-8);
    if(!rawPhone&&suffix.length!==8)return json({ok:false,error:"phone_required"},400);
    try{
      let rows:any[]=[];
      if(vitrineDigits(rawPhone,20).length>=10){
        const resolved=await sb.rpc("lookup_customer_by_phone",{p_phone:rawPhone});
        if(resolved.error)throw resolved.error;
        const customerId=uuid(resolved.data?.[0]?.customer_id);
        if(customerId){
          const exact=await sb.from("customers")
            .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
            .eq("id",customerId)
            .maybeSingle();
          if(exact.error)throw exact.error;
          if(exact.data)rows=[exact.data];
        }
      }
      if(!rows.length&&suffix.length===8){
        const q=await sb.from("customers")
          .select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,birthday_day,birthday_month,order_count,lifetime_value,created_at,updated_at")
          .ilike("primary_whatsapp_e164","%"+suffix)
          .order("is_active",{ascending:false})
          .order("updated_at",{ascending:false})
          .limit(3);
        if(q.error)throw q.error;
        rows=q.data||[];
      }
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

  if(new Set(["vitrine_customers_list","vitrine_customer_get","vitrine_customer_save","vitrine_customer_history","vitrine_customer_order_detail"]).has(action)){
    const auth=await vitrineAdminAuth(sb,req);
    if(!auth.ok)return json({ok:false,error:auth.error},Number(auth.status||401));
    if(action==="vitrine_customer_save"&&!["owner","admin","manager"].includes(String(auth.role||""))){
      return json({ok:false,error:"editor_required"},403);
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