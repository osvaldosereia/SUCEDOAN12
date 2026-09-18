import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const CORS={"Access-Control-Allow-Origin":"https://donaantonia.com.br","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=1000)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const validUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const graphVersion=()=>clean(Deno.env.get("META_GRAPH_VERSION")||"",20);
const graphVersionReady=()=>/^v\d+\.\d+$/.test(graphVersion());
const secureReady=()=>Boolean(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")&&Deno.env.get("META_APP_SECRET")&&Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")&&graphVersionReady());
async function sha256(bytes:Uint8Array){const copy=new Uint8Array(bytes);const hash=await crypto.subtle.digest("SHA-256",copy.buffer);return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("")}
function parseButtons(input:unknown){const rows=Array.isArray(input)?input.slice(0,3):[];if(Array.isArray(input)&&input.length>3)throw new Error("max_3_buttons");return rows.map((x:any,i)=>{if(x?.url||x?.link||String(x?.type||"").toLowerCase().includes("url"))throw new Error("url_buttons_not_allowed");const id=clean(x?.id||`button_${i+1}`,256),title=clean(x?.title,20);if(!id||!title)throw new Error("invalid_button");return {id,title,type:"reply"}})}

const cleanText=(v:unknown,max=4096)=>String(v??"").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,"").replace(/\r\n/g,"\n").trim().slice(0,max);
const num=(v:unknown,d=0)=>{const n=Number(v);return Number.isFinite(n)?n:d};
const templateAiSchema={
  type:"object",additionalProperties:false,
  required:["template_key","meta_template_name","category","language_code","purpose","body_text","media_kind","buttons","notes"],
  properties:{
    template_key:{type:"string",maxLength:120},
    meta_template_name:{type:"string",maxLength:512},
    category:{type:"string",enum:["UTILITY","MARKETING","AUTHENTICATION"]},
    language_code:{type:"string",maxLength:20},
    purpose:{type:"string",maxLength:500},
    body_text:{type:"string",maxLength:4096},
    media_kind:{type:"string",enum:["none","image","video","document"]},
    buttons:{type:"array",maxItems:10,items:{type:"object"}},
    notes:{type:"string",maxLength:1000}
  }
};
function extractOutput(payload:any){for(const item of Array.isArray(payload?.output)?payload.output:[])for(const part of Array.isArray(item?.content)?item.content:[])if(typeof part?.text==="string"&&part.text.trim())return part.text.trim();return ""}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";if(!url||!service)return json({ok:false,error:"server_config"},500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return json({ok:false,error:"missing_token"},401);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const userResult=await sb.auth.getUser(token);if(userResult.error||!userResult.data?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const user=userResult.data.user;const adminResult=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",user.id).maybeSingle();if(adminResult.error)return json({ok:false,error:"admin_lookup_failed"},500);if(!adminResult.data?.is_active)return json({ok:false,error:"admin_not_authorized"},403);
  const role=adminResult.data.role,isOwner=role==="owner",canWrite=isOwner||role==="operator";
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}const action=clean(body?.action||"dashboard",80).toLowerCase();

  if(action==="dashboard"){
    const [cfgR,accountR,eventR,stateR,basketR]=await Promise.all([
      sb.from("whatsapp_direct_config").select("*").eq("id",1).maybeSingle(),
      sb.from("whatsapp_accounts").select("id,slug,display_name,phone_e164,phone_number_id,waba_id,is_active").eq("is_active",true).order("created_at",{ascending:true}).limit(1).maybeSingle(),
      sb.from("whatsapp_direct_events").select("id,event_type,direction,payload,created_at").order("created_at",{ascending:false}).limit(30),
      sb.from("whatsapp_direct_state").select("state"),
      sb.from("basket_templates").select("id",{count:"exact",head:true}).eq("is_active",true)
    ]);
    if(cfgR.error||accountR.error||eventR.error||stateR.error)return json({ok:false,error:"dashboard_failed"},500);
    const counts:Record<string,number>={};for(const x of stateR.data||[])counts[x.state]=(counts[x.state]||0)+1;
    const callback=`${url.replace(/\/$/,"")}/functions/v1/whatsapp-meta-direct-v1`;
    return json({ok:true,user:{role,display_name:adminResult.data.display_name||null},config:cfgR.data||null,account:accountR.data||null,readiness:{ready:secureReady(),access:Boolean(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")),app_secret:Boolean(Deno.env.get("META_APP_SECRET")),verify_token:Boolean(Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")),graph_version:graphVersionReady(),graph_version_value:graphVersionReady()?graphVersion():null,callback_url:callback},state_counts:counts,active_baskets:basketR.count||0,recent_events:eventR.data||[]});
  }
  if(action==="templates"){const {data,error}=await sb.from("whatsapp_direct_templates").select("*").order("template_key",{ascending:true});if(error)return json({ok:false,error:"templates_failed",detail:error.message},500);return json({ok:true,templates:data||[]})}
  if(action==="template_library"){
    const [templatesR,versionsR,summaryR,runtimeR,briefsR,assetsR,metaR]=await Promise.all([
      sb.from("whatsapp_direct_templates").select("*").neq("local_status","archived").order("updated_at",{ascending:false}),
      sb.from("whatsapp_direct_template_versions").select("id,template_key,version,local_status,validation_status,source_kind,ai_generated,change_note,created_at,updated_at,meta_status").order("created_at",{ascending:false}).limit(200),
      sb.rpc("whatsapp_template_draft_summary_v1"),
      sb.from("marketing_runtime_config").select("metadata,max_daily_ai_cost_cents").eq("id",1).maybeSingle(),
      sb.from("marketing_strategy_briefs").select("id,brief_key,strategy_key,mode,status,brief,confidence,updated_at").neq("status","archived").order("updated_at",{ascending:false}).limit(80),
      sb.from("marketing_assets").select("id,title,media_kind,status,updated_at").in("status",["draft","rendered","review","approved"]).order("updated_at",{ascending:false}).limit(100),
      sb.rpc("get_meta_control_plane_snapshot_v1")
    ]);
    const err=templatesR.error||versionsR.error||summaryR.error||runtimeR.error||briefsR.error||assetsR.error||metaR.error;
    if(err)return json({ok:false,error:"template_library_failed",detail:clean(err.message,500)},500);
    const meta=runtimeR.data?.metadata||{};
    return json({
      ok:true,
      templates:templatesR.data||[],
      versions:versionsR.data||[],
      summary:summaryR.data||{},
      strategy_briefs:briefsR.data||[],
      creative_assets:assetsR.data||[],
      meta_control_plane:metaR.data||{},
      policy:{
        manual_enabled:meta.template_manual_enabled===true,
        ai_enabled:meta.template_ai_enabled===true,
        ai_max_daily_calls:num(meta.template_ai_max_daily_calls,0),
        ai_model_task:clean(meta.template_ai_model_task||"whatsapp_template_copy",80),
        submit_enabled:meta.template_submit_enabled===true,
        auto_submit_enabled:meta.template_auto_submit_enabled===true,
        external_side_effect:false
      },
      external_side_effect:false
    });
  }
  if(action==="template_versions"){
    const key=clean(body?.template_key,120).toLowerCase();
    if(!key)return json({ok:false,error:"template_key_required"},400);
    const {data,error}=await sb.from("whatsapp_direct_template_versions").select("*").eq("template_key",key).order("version",{ascending:false}).limit(50);
    if(error)return json({ok:false,error:"template_versions_failed",detail:error.message},500);
    return json({ok:true,template_key:key,versions:data||[],external_side_effect:false});
  }
  if(action==="template_validate"){
    const key=clean(body?.template_key,120).toLowerCase();
    const bodyText=cleanText(body?.body_text,4096);
    const category=clean(body?.category||"UTILITY",40).toUpperCase();
    const language=clean(body?.language_code||"pt_BR",20);
    const media=clean(body?.media_kind||"none",20).toLowerCase();
    const buttons=Array.isArray(body?.buttons)?body.buttons:[];
    const {data,error}=await sb.rpc("validate_whatsapp_template_draft_v1",{
      p_template_key:key,p_body_text:bodyText,p_category:category,p_language_code:language,p_buttons:buttons,p_media_kind:media
    });
    if(error)return json({ok:false,error:"template_validation_failed",detail:error.message},400);
    return json({ok:true,validation:data,meta_submission_performed:false,external_side_effect:false});
  }
  if(action==="basket_assets"){
    const [basketR,assetR]=await Promise.all([sb.from("basket_templates").select("id,name,base_price,image_url,sort_order,is_active,basket_template_items(id,quantity,sort_order,product:products(id,name,brand,packaging))").eq("is_active",true).order("sort_order",{ascending:true}).order("name",{ascending:true}),sb.from("whatsapp_basket_media_assets").select("*")]);
    if(basketR.error||assetR.error)return json({ok:false,error:"basket_assets_failed",detail:basketR.error?.message||assetR.error?.message},500);const assets=new Map((assetR.data||[]).map((x:any)=>[x.basket_id,x]));return json({ok:true,baskets:(basketR.data||[]).map((b:any)=>({...b,asset:assets.get(b.id)||null}))});
  }
  if(!canWrite)return json({ok:false,error:"read_only"},403);

  if(action==="meta_diagnostics_readonly"){
    const access=Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"",version=graphVersion();
    if(!access)return json({ok:false,error:"meta_credentials_missing",external_side_effect:false},409);
    if(!graphVersionReady())return json({ok:false,error:"meta_graph_version_unverified",external_side_effect:false},409);

    const accountR=await sb.from("whatsapp_accounts")
      .select("id,display_name,phone_e164,phone_number_id,waba_id,is_active")
      .eq("is_active",true).order("created_at",{ascending:true}).limit(1).maybeSingle();
    if(accountR.error||!accountR.data?.phone_number_id||!accountR.data?.waba_id)
      return json({ok:false,error:"meta_account_missing",external_side_effect:false},409);
    const account=accountR.data;

    const channelR=await sb.from("channel_accounts")
      .select("id,channel,external_account_id,outbound_enabled,capabilities,metadata")
      .eq("channel","whatsapp").eq("external_account_id",account.phone_number_id)
      .limit(1).maybeSingle();
    if(channelR.error||!channelR.data?.id)
      return json({ok:false,error:"meta_channel_account_missing",external_side_effect:false},409);
    const channel=channelR.data;

    const graphGet=async(path:string)=>{
      const response=await fetch(`https://graph.facebook.com/${version}/${path}`,{
        method:"GET",
        headers:{Authorization:`Bearer ${access}`,"Accept":"application/json"}
      });
      const payload=await response.json().catch(()=>({}));
      return {
        ok:response.ok,
        status:response.status,
        payload,
        api_version:clean(response.headers.get("facebook-api-version")||version,20)
      };
    };

    const [permissionsR,subscriptionsR,phoneR]=await Promise.all([
      graphGet("me/permissions"),
      graphGet(`${encodeURIComponent(account.waba_id)}/subscribed_apps`),
      graphGet(`${encodeURIComponent(account.phone_number_id)}?fields=id,display_phone_number,verified_name,quality_rating`)
    ]);

    const checkedAt=new Date().toISOString();
    const rawPermissions=Array.isArray(permissionsR.payload?.data)?permissionsR.payload.data:[];
    const permissionMap=new Map(rawPermissions.map((x:any)=>[clean(x?.permission,160),clean(x?.status,40).toLowerCase()]));
    const requiredPermissions=["whatsapp_business_management","whatsapp_business_messaging"];
    const permissionRows=requiredPermissions.map(permission_key=>({
      channel_account_id:channel.id,
      permission_key,
      status:permissionMap.get(permission_key)==="granted"?"granted":"missing",
      source:"supabase_meta_readonly_probe",
      evidence:{
        http_status:permissionsR.status,
        api_version:permissionsR.api_version,
        checked_by:user.id,
        external_side_effect:false
      },
      checked_at:checkedAt,
      expires_at:null,
      updated_at:checkedAt
    }));
    const permissionsWrite=await sb.from("meta_account_permissions")
      .upsert(permissionRows,{onConflict:"channel_account_id,permission_key"});
    if(permissionsWrite.error)
      return json({ok:false,error:"meta_permissions_evidence_write_failed",detail:clean(permissionsWrite.error.message,500),external_side_effect:false},500);

    const subscribedApps=Array.isArray(subscriptionsR.payload?.data)?subscriptionsR.payload.data:[];
    const subscriptionIds=subscribedApps
      .map((x:any)=>clean(x?.whatsapp_business_api_data?.id||x?.id,120))
      .filter(Boolean);
    const phoneQuality=clean(phoneR.payload?.quality_rating,80)||null;
    const errors=[
      !permissionsR.ok?{operation:"permissions",status:permissionsR.status}:null,
      !subscriptionsR.ok?{operation:"subscribed_apps",status:subscriptionsR.status}:null,
      !phoneR.ok?{operation:"phone_number",status:phoneR.status}:null
    ].filter(Boolean);

    const healthWrite=await sb.from("meta_provider_health_snapshots").insert({
      channel_account_id:channel.id,
      provider:"meta_cloud_api",
      provider_state:"read_only",
      graph_api_version:permissionsR.api_version||subscriptionsR.api_version||phoneR.api_version||version,
      waba_id:account.waba_id,
      phone_number_id:account.phone_number_id,
      phone_quality:phoneQuality,
      account_quality:null,
      messaging_limit:null,
      webhook_state:subscriptionsR.ok&&subscriptionIds.length>0?"waba_subscribed":"unverified",
      template_state:null,
      flow_state:null,
      health_score:null,
      errors,
      capabilities:{
        graph_reachable:permissionsR.ok||subscriptionsR.ok||phoneR.ok,
        waba_subscription_present:subscriptionsR.ok&&subscriptionIds.length>0,
        subscribed_app_ids:subscriptionIds,
        phone_verified_name:clean(phoneR.payload?.verified_name,200)||null,
        display_phone_number:clean(phoneR.payload?.display_phone_number,80)||null
      },
      permissions:Object.fromEntries(requiredPermissions.map(k=>[k,permissionMap.get(k)==="granted"?"granted":"missing"])),
      provider_snapshot:{
        source:"supabase_meta_readonly_probe",
        permission_http_status:permissionsR.status,
        subscription_http_status:subscriptionsR.status,
        phone_http_status:phoneR.status,
        api_version:permissionsR.api_version||subscriptionsR.api_version||phoneR.api_version||version,
        checked_by:user.id,
        external_side_effect:false
      },
      checked_at:checkedAt
    }).select("id,provider_state,graph_api_version,waba_id,phone_number_id,phone_quality,webhook_state,checked_at").single();
    if(healthWrite.error)
      return json({ok:false,error:"meta_health_evidence_write_failed",detail:clean(healthWrite.error.message,500),external_side_effect:false},500);

    const readinessR=await sb.rpc("evaluate_meta_direct_readiness_v1",{p_channel_account_id:channel.id});
    if(readinessR.error)
      return json({ok:false,error:"meta_readiness_failed",detail:clean(readinessR.error.message,500),external_side_effect:false},500);

    return json({
      ok:true,
      mode:"READ_ONLY",
      graph_api_version:healthWrite.data?.graph_api_version||version,
      permissions:Object.fromEntries(requiredPermissions.map(k=>[k,permissionMap.get(k)==="granted"?"granted":"missing"])),
      phone:{
        id:account.phone_number_id,
        display_phone_number:clean(phoneR.payload?.display_phone_number,80)||null,
        verified_name:clean(phoneR.payload?.verified_name,200)||null,
        quality_rating:phoneQuality
      },
      waba:{
        id:account.waba_id,
        subscribed_app_ids:subscriptionIds,
        subscription_observed:subscriptionsR.ok&&subscriptionIds.length>0
      },
      webhook:{
        state:healthWrite.data?.webhook_state||"unverified",
        callback_verified:false,
        note:"A assinatura da WABA foi observada, mas o callback do Meta Direct ainda exige verificação própria."
      },
      readiness:readinessR.data||{},
      gates:{
        canonical_outbound_enabled:channel.outbound_enabled===true,
        meta_direct_ready:channel.capabilities?.meta_direct_ready===true
      },
      external_side_effect:false,
      meta_message_sent:false,
      meta_configuration_changed:false
    });
  }

  if(action==="template_save_draft"){
    const key=clean(body?.template_key,120).toLowerCase();
    const purpose=cleanText(body?.purpose,500);
    const bodyText=cleanText(body?.body_text,4096);
    if(!key||!purpose||!bodyText)return json({ok:false,error:"template_fields_required"},400);
    const buttons=Array.isArray(body?.buttons)?body.buttons:[];
    const strategyBriefId=validUuid(body?.strategy_brief_id)?clean(body.strategy_brief_id,80):null;
    const creativeAssetId=validUuid(body?.creative_asset_id)?clean(body.creative_asset_id,80):null;
    const {data,error}=await sb.rpc("save_whatsapp_template_draft_v1",{
      p_template_key:key,
      p_meta_template_name:clean(body?.meta_template_name,512)||null,
      p_category:clean(body?.category||"UTILITY",40).toUpperCase(),
      p_language_code:clean(body?.language_code||"pt_BR",20),
      p_purpose:purpose,
      p_body_text:bodyText,
      p_media_kind:clean(body?.media_kind||"none",20).toLowerCase(),
      p_media_url:clean(body?.media_url,1200)||null,
      p_buttons:buttons,
      p_strategy_key:clean(body?.strategy_key,120)||null,
      p_strategy_brief_id:strategyBriefId,
      p_creative_asset_id:creativeAssetId,
      p_notes:cleanText(body?.notes,1500)||null,
      p_source_kind:"manual",
      p_ai_generated:false,
      p_change_note:cleanText(body?.change_note,800)||"Alteração manual pelo Admin",
      p_created_by:user.id
    });
    if(error)return json({ok:false,error:"template_save_failed",detail:clean(error.message,500)},400);
    if(data?.ok===false)return json(data,400);
    return json({...data,meta_submission_performed:false,external_side_effect:false});
  }

  if(action==="template_ai_draft"){
    const runtimeR=await sb.from("marketing_runtime_config").select("metadata,max_daily_ai_cost_cents").eq("id",1).maybeSingle();
    if(runtimeR.error)return json({ok:false,error:"template_ai_policy_failed"},500);
    const meta=runtimeR.data?.metadata||{};
    if(meta.template_ai_enabled!==true){
      return json({
        ok:false,error:"template_ai_disabled",
        detail:"O assistente de IA está programado, mas o gate de custo permanece fechado.",
        policy:{enabled:false,max_daily_calls:num(meta.template_ai_max_daily_calls,0),submit_enabled:false},
        external_side_effect:false
      },409);
    }
    const maxCalls=Math.max(0,Math.min(20,num(meta.template_ai_max_daily_calls,0)));
    if(maxCalls<=0||num(runtimeR.data?.max_daily_ai_cost_cents,0)<=0)return json({ok:false,error:"template_ai_budget_closed",external_side_effect:false},409);
    const since=new Date(Date.now()-86400000).toISOString();
    const {count,error:countError}=await sb.from("whatsapp_direct_template_versions").select("id",{count:"exact",head:true}).eq("ai_generated",true).gte("created_at",since);
    if(countError)return json({ok:false,error:"template_ai_usage_check_failed"},500);
    if(num(count,0)>=maxCalls)return json({ok:false,error:"template_ai_daily_limit_reached",limit:maxCalls,external_side_effect:false},429);

    const briefId=validUuid(body?.strategy_brief_id)?clean(body.strategy_brief_id,80):null;
    let brief:any=null;
    if(briefId){
      const br=await sb.from("marketing_strategy_briefs").select("id,strategy_key,brief,confidence,status").eq("id",briefId).maybeSingle();
      if(br.error)return json({ok:false,error:"strategy_brief_lookup_failed"},500);
      brief=br.data||null;
    }
    const prompt=cleanText(body?.prompt,1500);
    if(!brief&&!prompt)return json({ok:false,error:"template_ai_context_required"},400);

    let key=Deno.env.get("OPENAI_API_KEY")||"";
    if(!key){
      const secretR=await sb.rpc("get_conversation_worker_provider_secret_v1");
      if(!secretR.error&&typeof secretR.data==="string")key=secretR.data;
    }
    if(!key)return json({ok:false,error:"openai_not_configured"},503);

    const model=clean(meta.template_ai_model||meta.strategy_model||"gpt-5.6-luna",80);
    const maxOutput=Math.max(300,Math.min(900,num(meta.template_ai_max_output_tokens,700)));
    const instructions=[
      "Você cria somente RASCUNHOS locais de templates de WhatsApp para a Dona Antônia.",
      "Não afirme que o template está aprovado pela Meta.",
      "Não invente desconto, preço, estoque, consentimento, vantagem ou condição comercial.",
      "Use variáveis somente no formato {{1}}, {{2}} em sequência sem pular números.",
      "Prefira texto simples, humano, objetivo e fácil para clientes com pouca familiaridade digital.",
      "Se for MARKETING, não contorne consentimento ou Customer Protection.",
      "Não gere links ou dados pessoais. O resultado não será enviado nem submetido automaticamente."
    ].join(" ");
    const aiInput={
      prompt,
      strategy_brief:brief?{strategy_key:brief.strategy_key,brief:brief.brief,confidence:brief.confidence}:null,
      requested_category:clean(body?.category||"",40)||null,
      requested_language:clean(body?.language_code||"pt_BR",20),
      constraints:{draft_only:true,submit_to_meta:false,external_side_effect:false}
    };
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model,instructions,input:JSON.stringify(aiInput),
        text:{format:{type:"json_schema",name:"whatsapp_template_draft",strict:true,schema:templateAiSchema}},
        max_output_tokens:maxOutput
      })
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)return json({ok:false,error:"template_ai_provider_failed",status:response.status,detail:clean(payload?.error?.message||"",500),external_side_effect:false},502);
    const output=extractOutput(payload);
    let draft:any;try{draft=JSON.parse(output)}catch{return json({ok:false,error:"template_ai_invalid_json",external_side_effect:false},502)}
    const save=await sb.rpc("save_whatsapp_template_draft_v1",{
      p_template_key:clean(draft.template_key,120).toLowerCase(),
      p_meta_template_name:clean(draft.meta_template_name,512)||null,
      p_category:clean(draft.category||"UTILITY",40).toUpperCase(),
      p_language_code:clean(draft.language_code||"pt_BR",20),
      p_purpose:cleanText(draft.purpose,500),
      p_body_text:cleanText(draft.body_text,4096),
      p_media_kind:clean(draft.media_kind||"none",20).toLowerCase(),
      p_media_url:null,
      p_buttons:Array.isArray(draft.buttons)?draft.buttons:[],
      p_strategy_key:brief?.strategy_key||clean(body?.strategy_key,120)||null,
      p_strategy_brief_id:briefId,
      p_creative_asset_id:null,
      p_notes:cleanText(draft.notes,1500)||null,
      p_source_kind:"ai_draft",
      p_ai_generated:true,
      p_change_note:"Rascunho criado pelo assistente de IA; revisão humana obrigatória",
      p_created_by:user.id
    });
    if(save.error)return json({ok:false,error:"template_ai_save_failed",detail:clean(save.error.message,500),external_side_effect:false},500);
    if(save.data?.ok===false)return json(save.data,400);
    return json({
      ...save.data,
      ai:{model,response_id:payload?.id||null,usage:payload?.usage||null},
      meta_submission_performed:false,
      external_side_effect:false
    });
  }

  if(action==="save_config"){
    const current=await sb.from("whatsapp_direct_config").select("*").eq("id",1).maybeSingle();if(current.error||!current.data)return json({ok:false,error:"config_not_found"},404);const patch:any={updated_at:new Date().toISOString()};
    if(body.storefront_url!==undefined){const v=clean(body.storefront_url,1000);if(!/^https:\/\/donaantonia\.com\.br\//i.test(v))return json({ok:false,error:"invalid_storefront_url"},400);patch.storefront_url=v}
    if(body.public_phone!==undefined){const d=digits(body.public_phone);if(d&&![10,11,12,13].includes(d.length))return json({ok:false,error:"invalid_public_phone"},400);patch.public_phone=clean(body.public_phone,40)||null}
    for(const [key,max] of [["greeting_text",500],["catalog_text",2000],["address_request_text",3000],["address_audio_url",1200]] as const)if(body[key]!==undefined)patch[key]=clean(body[key],max)||null;
    if(typeof body.require_location==="boolean")patch.require_location=body.require_location;
    if(body.enabled!==undefined||body.release_mode!==undefined){if(!isOwner)return json({ok:false,error:"owner_required"},403);const nextEnabled=body.enabled===undefined?current.data.enabled:body.enabled===true;const mode=body.release_mode===undefined?current.data.release_mode:clean(body.release_mode,20);if(!["off","homologation","live"].includes(mode))return json({ok:false,error:"invalid_release_mode"},400);if((nextEnabled||mode!=="off")&&!secureReady())return json({ok:false,error:"meta_credentials_missing"},409);patch.enabled=nextEnabled;patch.release_mode=mode}
    const {data,error}=await sb.from("whatsapp_direct_config").update(patch).eq("id",1).select("*").single();if(error)return json({ok:false,error:"config_save_failed",detail:error.message},400);return json({ok:true,config:data});
  }
  if(action==="save_template"){
    return json({ok:false,error:"legacy_template_write_disabled",detail:"Use template_save_draft do CM-1.13. O fluxo novo é versionado, validado e DRAFT-only.",external_side_effect:false},409);
  }
  if(action==="sync_meta_templates"){
    const access=Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"",version=graphVersion();if(!access)return json({ok:false,error:"meta_credentials_missing"},409);if(!graphVersionReady())return json({ok:false,error:"meta_graph_version_unverified"},409);const account=await sb.from("whatsapp_accounts").select("waba_id").eq("is_active",true).limit(1).maybeSingle();if(account.error||!account.data?.waba_id)return json({ok:false,error:"waba_missing"},409);
    const endpoint=`https://graph.facebook.com/${version}/${encodeURIComponent(account.data.waba_id)}/message_templates?fields=name,status,category,language,components&limit=100`;const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${access}`}});const payload=await response.json().catch(()=>({}));if(!response.ok)return json({ok:false,error:"meta_templates_failed",detail:clean(payload?.error?.message||"Meta error",500)},400);const templates=Array.isArray(payload?.data)?payload.data:[];for(const t of templates){const name=clean(t?.name,512);if(!name)continue;await sb.from("whatsapp_direct_templates").update({meta_status:clean(t?.status,40)||"unknown",updated_at:new Date().toISOString()}).eq("meta_template_name",name)}return json({ok:true,templates:templates.map((t:any)=>({name:t.name,status:t.status,category:t.category,language:t.language,components:t.components}))});
  }
  if(action==="save_basket_asset"){
    const basketId=clean(body.basket_id,80);if(!validUuid(basketId))return json({ok:false,error:"invalid_basket_id"},400);const dataUrl=String(body.data_url||"");const match=dataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);if(!match)return json({ok:false,error:"invalid_image_data"},400);const binary=atob(match[2]);if(binary.length>5*1024*1024)return json({ok:false,error:"image_too_large"},413);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const hash=await sha256(bytes),ext=match[1]==="jpeg"?"jpg":"png",bucket="whatsapp-public-assets",path=`baskets/${basketId}/${hash.slice(0,20)}.${ext}`;
    const bucketResult=await sb.storage.getBucket(bucket);if(bucketResult.error){const created=await sb.storage.createBucket(bucket,{public:true,fileSizeLimit:5242880,allowedMimeTypes:["image/png","image/jpeg"]});if(created.error)return json({ok:false,error:"bucket_create_failed",detail:created.error.message},500)}
    const upload=await sb.storage.from(bucket).upload(path,bytes,{contentType:match[1]==="jpeg"?"image/jpeg":"image/png",upsert:true});if(upload.error)return json({ok:false,error:"asset_upload_failed",detail:upload.error.message},500);const publicUrl=sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;const {data,error}=await sb.from("whatsapp_basket_media_assets").upsert({basket_id:basketId,vertical_image_url:publicUrl,source_hash:hash,width:1080,height:1920,status:"ready",updated_at:new Date().toISOString()},{onConflict:"basket_id"}).select("*").single();if(error)return json({ok:false,error:"asset_record_failed",detail:error.message},500);return json({ok:true,asset:data});
  }
  return json({ok:false,error:"unknown_action"},400);
});