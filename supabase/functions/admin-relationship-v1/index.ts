import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=300)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!serviceKey)return json({ok:false,error:"server_config"},500);
  const auth=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!auth)return json({ok:false,error:"unauthorized"},401);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(auth);
  if(userError||!userData?.user)return json({ok:false,error:"unauthorized"},401);
  const user=userData.user;
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active").eq("user_id",user.id).maybeSingle();
  if(adminError||!admin?.is_active||!["owner","operator"].includes(admin.role))return json({ok:false,error:"forbidden"},403);

  const body=await req.json().catch(()=>({}));
  const action=clean((body as any)?.action||"overview",40);

  if(action==="overview"){
    const [
      summaryR,customersR,opportunitiesR,readyProductsR,blockedProductsR,
      briefsR,templatesR,identityR,metaErrorsR,providerContactsR,consentsR
    ]=await Promise.all([
      sb.rpc("relationship_command_summary_v1"),
      sb.from("customer_commercial_profile_v1")
        .select("customer_id,name,primary_whatsapp_e164,order_count,lifetime_value,average_ticket,last_order_at,days_since_last_order,recent_engagement,profile_completeness,data_quality_score")
        .order("lifetime_value",{ascending:false}).limit(30),
      sb.from("customer_marketing_opportunities")
        .select("id,customer_id,strategy_key,title,confidence,status,exclusions,product_candidates,last_evaluated_at,expires_at,customer:customers(name)")
        .in("status",["suggested","suppressed"]).order("confidence",{ascending:false}).limit(40),
      sb.from("product_marketing_readiness_v1")
        .select("product_id,name,brand,category,stock,effective_price,is_offer,offer_price,known_purchase_count,readiness_score")
        .eq("marketing_eligible",true).order("known_purchase_count",{ascending:false}).limit(30),
      sb.from("product_marketing_readiness_v1")
        .select("product_id,name,brand,category,stock,readiness_score,exclusion_reasons")
        .eq("marketing_eligible",false).order("readiness_score",{ascending:false}).limit(30),
      sb.from("marketing_strategy_briefs")
        .select("id,strategy_key,mode,status,ai_used,model_used,confidence,updated_at")
        .neq("status","archived").order("updated_at",{ascending:false}).limit(30),
      sb.from("whatsapp_direct_templates")
        .select("template_key,category,language_code,purpose,current_version,local_status,validation_status,meta_status,ai_generated,updated_at")
        .neq("local_status","archived").order("updated_at",{ascending:false}).limit(40),
      sb.from("customer_identity_resolution_evaluations")
        .select("id,decision,customer_id,confidence,source,channel,match_method,review_status,created_at")
        .eq("review_status","pending").order("created_at",{ascending:false}).limit(30),
      sb.from("meta_control_plane_errors")
        .select("id,operation,provider_error_code,message,retryable,severity,occurred_at,resolved_at")
        .is("resolved_at",null).order("occurred_at",{ascending:false}).limit(30),
      sb.from("channel_provider_contact_states")
        .select("id,provider_key,display_name,phone_e164,customer_id,tags,last_event_at,updated_at")
        .order("updated_at",{ascending:false}).limit(30),
      sb.from("customer_consent_current_v1")
        .select("customer_id,channel,purpose,status,source,occurred_at")
        .eq("channel","whatsapp").order("occurred_at",{ascending:false}).limit(100)
    ]);
    const errors=[summaryR,customersR,opportunitiesR,readyProductsR,blockedProductsR,briefsR,templatesR,identityR,metaErrorsR,providerContactsR,consentsR]
      .map((x:any)=>x.error).filter(Boolean);
    if(errors.length)return json({ok:false,error:"relationship_overview_failed",detail:clean(errors[0]?.message,500)},500);
    return json({
      ok:true,
      summary:summaryR.data||{},
      customers:customersR.data||[],
      opportunities:opportunitiesR.data||[],
      products:{ready:readyProductsR.data||[],blocked:blockedProductsR.data||[]},
      marketing_briefs:briefsR.data||[],
      templates:templatesR.data||[],
      identity_pending:identityR.data||[],
      meta_errors:metaErrorsR.data||[],
      provider_contacts:providerContactsR.data||[],
      consents:consentsR.data||[],
      read_only:true,
      external_side_effect:false,
      version:"cm1.15-v1"
    });
  }

  if(action==="audit"){
    const limit=Math.max(10,Math.min(100,Number((body as any)?.limit||50)));
    const [actionsR,eventsR,providerR,metaR]=await Promise.all([
      sb.from("ai_action_executions").select("id,action_key,status,channel,customer_id,decision,side_effect_performed,estimated_cost_brl,actual_cost_brl,created_at,finished_at").order("created_at",{ascending:false}).limit(limit),
      sb.from("marketing_events").select("id,entity_type,entity_id,event_type,actor_id,data,created_at").order("created_at",{ascending:false}).limit(limit),
      sb.from("channel_provider_event_receipts").select("id,provider_key,processing_status,conversation_id,customer_id,context,occurred_at,received_at").order("received_at",{ascending:false}).limit(limit),
      sb.from("meta_control_plane_errors").select("id,operation,provider_error_code,message,severity,retryable,occurred_at,resolved_at").order("occurred_at",{ascending:false}).limit(limit)
    ]);
    const err=actionsR.error||eventsR.error||providerR.error||metaR.error;
    if(err)return json({ok:false,error:"relationship_audit_failed",detail:clean(err.message,500)},500);
    return json({ok:true,actions:actionsR.data||[],marketing_events:eventsR.data||[],provider_events:providerR.data||[],meta_errors:metaR.data||[],external_side_effect:false,version:"cm1.15-v1"});
  }

  return json({ok:false,error:"unknown_action"},400);
});
