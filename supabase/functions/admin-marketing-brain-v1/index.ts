import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const num=(v:unknown,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const arr=(v:unknown)=>Array.isArray(v)?v:[];
const extractOutput=(payload:any)=>{
  if(typeof payload?.output_text==="string"&&payload.output_text.trim())return payload.output_text.trim();
  for(const item of Array.isArray(payload?.output)?payload.output:[]){
    for(const part of Array.isArray(item?.content)?item.content:[]){
      if(typeof part?.text==="string"&&part.text.trim())return part.text.trim();
    }
  }
  return "";
};

function channelPlan(){
  return {
    instagram:{story:true,carousel:true,reel_10s:true},
    facebook:{image_post:true,story:"capability_check"},
    pinterest:{pin:true},
    whatsapp:{status:"manual_confirm"}
  };
}

function deterministicStrategy(items:any[]){
  const groups=new Map<string,any[]>();
  for(const item of items){
    const key=clean(item?.category||"Destaques",80)||"Destaques";
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key)!.push(item);
  }
  const ranked=[...groups.entries()].map(([category,list])=>{
    const sorted=[...list].sort((a,b)=>num(b.score)-num(a.score));
    const top=sorted.slice(0,3);
    const offerCount=top.filter(x=>x.is_offer&&num(x.offer_price)>0&&num(x.offer_price)<num(x.price)).length;
    const subcategories=new Set(top.map(x=>clean(x?.subcategory||"",80)).filter(Boolean));
    const cohesionPenalty=Math.max(0,subcategories.size-1)*9;
    const sameSubcategoryBonus=subcategories.size===1&&top.length>=2?12:0;
    return {
      category,
      items:top,
      groupScore:top.reduce((s,x)=>s+num(x.score),0)+offerCount*5+Math.min(3,top.length)*2+sameSubcategoryBonus-cohesionPenalty,
      offerCount,
      subcategories:[...subcategories]
    };
  }).filter(x=>x.items.length>=2).sort((a,b)=>b.groupScore-a.groupScore);
  const chosen=ranked[0]||{category:clean(items[0]?.category||"Destaques",80),items:items.slice(0,3),offerCount:items.slice(0,3).filter(x=>x.is_offer).length,subcategories:[]};
  const hasOffers=chosen.offerCount>=1;
  const category=chosen.category||"Destaques";
  const theme=chosen.subcategories?.length===1?chosen.subcategories[0]:category;
  return {
    no_action:false,
    campaign_name:(hasOffers?"Ofertas de ":"Destaques de ")+theme,
    objective:"Gerar vendas com produtos comercialmente ativos, bom estoque e margem segura.",
    insight:hasOffers?"Há oportunidades reais de preço em um grupo coerente de produtos, sem promover itens com prejuízo.":"Há produtos relacionados com estoque e margem saudáveis que podem receber destaque.",
    angle:hasOffers?"economia_com_margem":"utilidade_e_valor",
    hook:hasOffers?("Boas oportunidades em "+theme+" para aproveitar agora."):("Vale a pena conhecer estes destaques de "+theme+"."),
    cta:"Peça pelo WhatsApp ou compre no site da Dona Antônia.",
    rationale:"Seleção determinística baseada em coerência temática, oferta válida, margem, estoque, qualidade do cadastro e antirrepetição.",
    product_ids:chosen.items.map((x:any)=>String(x.product_id)),
    recommended_formats:["instagram_story","instagram_carousel","instagram_reel_10s","facebook_image","pinterest_pin","whatsapp_status"]
  };
}

const strategySchema={
  type:"object",additionalProperties:false,
  required:["no_action","campaign_name","objective","insight","angle","hook","cta","rationale","product_ids","recommended_formats"],
  properties:{
    no_action:{type:"boolean"},
    campaign_name:{type:"string",maxLength:120},
    objective:{type:"string",maxLength:240},
    insight:{type:"string",maxLength:360},
    angle:{type:"string",maxLength:120},
    hook:{type:"string",maxLength:220},
    cta:{type:"string",maxLength:180},
    rationale:{type:"string",maxLength:420},
    product_ids:{type:"array",items:{type:"string"},maxItems:4},
    recommended_formats:{type:"array",items:{type:"string",enum:["instagram_story","instagram_carousel","instagram_reel_10s","facebook_image","pinterest_pin","whatsapp_status"]},maxItems:6}
  }
};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return json({ok:false,error:"server_config"},500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({ok:false,error:"missing_token"},401);

  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  if(userError||!userData?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const user=userData.user;
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",user.id).maybeSingle();
  if(adminError)return json({ok:false,error:"admin_lookup_failed"},500);
  if(!admin?.is_active||!["owner","operator"].includes(admin.role))return json({ok:false,error:"admin_not_authorized"},403);

  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action||"shortlist",50).toLowerCase();

  const {data:runtime,error:runtimeError}=await sb.from("marketing_runtime_config").select("*").eq("id",1).maybeSingle();
  if(runtimeError||!runtime)return json({ok:false,error:"runtime_unavailable"},500);
  const meta=runtime.metadata&&typeof runtime.metadata==="object"?runtime.metadata:{};
  const maxCandidates=Math.max(3,Math.min(30,num(meta.strategy_max_candidates,18)));
  const lookbackDays=Math.max(0,Math.min(90,num(meta.strategy_lookback_days,14)));

  const getShortlist=async()=>{
    const {data,error}=await sb.rpc("marketing_product_shortlist_v1",{p_limit:maxCandidates,p_lookback_days:lookbackDays});
    if(error)throw new Error(error.message);
    return Array.isArray(data)?data:[];
  };

  if(action==="shortlist"){
    try{
      const items=await getShortlist();
      return json({ok:true,items,policy:{max_candidates:maxCandidates,lookback_days:lookbackDays,deterministic_first:true},external_side_effect:false});
    }catch(error){return json({ok:false,error:"shortlist_failed",detail:clean((error as Error)?.message,500)},500)}
  }

  const createDraft=async(strategy:any,items:any[],strategyMode:string,model:string|null,usage:any=null,responseId:string|null=null)=>{
    const allowed=new Set(items.map(x=>String(x.product_id)));
    const selected=arr(strategy?.product_ids).map(String).filter(id=>allowed.has(id)).slice(0,4);
    if(selected.length<1)return {ok:false,error:"strategy_has_no_valid_products"};

    const contentPolicy={
      strategy_version:"marketing_brain_v1",
      strategy_mode:strategyMode,
      insight:clean(strategy.insight,360),
      angle:clean(strategy.angle,120),
      hook:clean(strategy.hook,220),
      cta:clean(strategy.cta,180),
      rationale:clean(strategy.rationale,420),
      image_quality:"low",
      image_variants:1,
      video_mode:"light_motion",
      video_duration_seconds:10,
      generative_video:false,
      reuse_assets_first:true
    };
    const productSelection={
      method:"marketing_product_shortlist_v1",
      product_ids:selected,
      candidates_considered:items.length,
      lookback_days:lookbackDays,
      deterministic_first:true
    };
    const aiPolicy={
      strategy_mode:strategyMode,
      model:model,
      max_candidates:maxCandidates,
      max_output_tokens:num(meta.strategy_max_output_tokens,900),
      auto_escalation:false,
      image_quality:"low",
      image_variants:1,
      generative_video:false,
      light_motion_duration_seconds:10
    };
    const {data,error}=await sb.rpc("create_marketing_campaign_draft_v1",{
      p_name:clean(strategy.campaign_name,120)||"Campanha Dona Antônia",
      p_objective:clean(strategy.objective,240)||null,
      p_content_policy:contentPolicy,
      p_product_selection:productSelection,
      p_schedule_rule:{mode:"draft_only",timezone:runtime.default_timezone||"America/Cuiaba"},
      p_channel_plan:channelPlan(),
      p_ai_policy:aiPolicy,
      p_actor:user.id
    });
    if(error)return {ok:false,error:"campaign_create_failed",detail:error.message};
    if(!data?.ok)return data;
    await sb.from("marketing_events").insert({
      entity_type:"campaign",
      entity_id:String(data.id),
      event_type:strategyMode==="ai"?"strategy_ai_attached":"strategy_deterministic_attached",
      actor_id:user.id,
      data:{strategy_mode:strategyMode,model:model,response_id:responseId,usage:usage||null,selected_product_ids:selected},
      external_side_effect:false
    });
    return {ok:true,campaign_id:data.id,status:"draft",strategy,selected_product_ids:selected,external_side_effect:false};
  };

  if(action==="create_deterministic_draft"){
    try{
      const items=await getShortlist();
      if(items.length<1)return json({ok:false,error:"no_eligible_products"},409);
      const strategy=deterministicStrategy(items);
      const result=await createDraft(strategy,items,"deterministic",null);
      return json(result,result?.ok?200:400);
    }catch(error){return json({ok:false,error:"deterministic_draft_failed",detail:clean((error as Error)?.message,500)},500)}
  }

  if(action==="strategy_preview"||action==="generate_ai_draft"){
    if(meta.strategy_ai_enabled!==true)return json({
      ok:false,error:"strategy_ai_disabled",
      detail:"IA de estratégia permanece bloqueada para evitar custo nesta fase.",
      policy:{model:clean(meta.strategy_model||"gpt-5.6-luna",80),max_daily_calls:num(meta.strategy_max_daily_calls,0)},
      external_side_effect:false
    },409);

    const maxDailyCalls=Math.max(0,Math.min(20,num(meta.strategy_max_daily_calls,0)));
    if(maxDailyCalls<=0)return json({ok:false,error:"strategy_ai_budget_closed",external_side_effect:false},409);

    const since=new Date(Date.now()-86400000).toISOString();
    const {count,error:countError}=await sb.from("marketing_events").select("id",{count:"exact",head:true}).eq("event_type","strategy_ai_generated").gte("created_at",since);
    if(countError)return json({ok:false,error:"strategy_usage_check_failed"},500);
    if(num(count,0)>=maxDailyCalls)return json({ok:false,error:"strategy_daily_limit_reached",limit:maxDailyCalls,external_side_effect:false},429);

    let key=Deno.env.get("OPENAI_API_KEY")||"";
    if(!key){
      const {data:vaultKey,error:vaultError}=await sb.rpc("get_conversation_worker_provider_secret_v1");
      if(!vaultError&&typeof vaultKey==="string")key=vaultKey;
    }
    if(!key)return json({ok:false,error:"openai_not_configured"},503);

    let items:any[]=[];
    try{items=await getShortlist()}catch(error){return json({ok:false,error:"shortlist_failed",detail:clean((error as Error)?.message,500)},500)}
    if(items.length<1)return json({ok:false,error:"no_eligible_products"},409);

    const compact=items.map(x=>({
      id:x.product_id,name:x.name,brand:x.brand||null,category:x.category||null,subcategory:x.subcategory||null,
      price:num(x.price),effective_price:num(x.effective_price),stock:num(x.stock),is_offer:Boolean(x.is_offer),
      margin_percent:x.margin_percent==null?null:num(x.margin_percent),offer_discount_percent:num(x.offer_discount_percent),
      score:num(x.score),reasons:x.reasons||[]
    }));
    const model=clean(meta.strategy_model||"gpt-5.6-luna",80);
    const maxOutput=Math.max(400,Math.min(1200,num(meta.strategy_max_output_tokens,900)));
    const instructions="Você é o Marketing Brain da Dona Antônia, mercado local de Cuiabá e Várzea Grande. Escolha uma oportunidade comercial coerente entre os candidatos fornecidos. Nunca invente produto, preço, desconto, benefício, estoque ou marca. Prefira 1 a 4 produtos com tema único. Considere estoque, margem, oferta, utilidade e variedade. Não escolha item fora da lista. Se não houver boa oportunidade, no_action=true. Para vídeo, use apenas reel_10s quase estático; não proponha vídeo generativo. Seja objetivo e comercial, sem linguagem exagerada.";
    const input=JSON.stringify({candidates:compact,constraints:{image_quality:"low",image_variants:1,video_mode:"light_motion",video_duration_seconds:10,generative_video:false,channels:channelPlan()}});
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({model:model,instructions:instructions,input:input,text:{format:{type:"json_schema",name:"marketing_strategy",strict:true,schema:strategySchema}},max_output_tokens:maxOutput})
    });
    if(!response.ok)return json({ok:false,error:"strategy_provider_failed",status:response.status},502);
    const payload=await response.json();
    const output=extractOutput(payload);
    let strategy:any;try{strategy=JSON.parse(output)}catch{return json({ok:false,error:"strategy_invalid_json"},502)}

    const allowed=new Set(items.map(x=>String(x.product_id)));
    strategy.product_ids=arr(strategy.product_ids).map(String).filter((id:string)=>allowed.has(id)).slice(0,4);
    if(strategy.no_action!==true&&strategy.product_ids.length<1)return json({ok:false,error:"strategy_invalid_products"},502);

    await sb.from("marketing_events").insert({
      entity_type:"marketing_brain",entity_id:null,event_type:"strategy_ai_generated",actor_id:user.id,
      data:{model:model,response_id:payload?.id||null,usage:payload?.usage||null,candidates:items.length,no_action:Boolean(strategy.no_action)},
      external_side_effect:false
    });

    if(action==="strategy_preview"||strategy.no_action===true){
      return json({ok:true,strategy:strategy,model:model,usage:payload?.usage||null,response_id:payload?.id||null,created_campaign:false,external_side_effect:false});
    }

    const result=await createDraft(strategy,items,"ai",model,payload?.usage||null,payload?.id||null);
    return json(result,result?.ok?200:400);
  }

  return json({ok:false,error:"unknown_action"},400);
});