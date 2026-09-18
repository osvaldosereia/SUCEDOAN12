import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const json=(origin:string|null,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});
const text=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const int=(v:unknown,min=1,max=100)=>Math.min(max,Math.max(min,Number.parseInt(String(v??min),10)||min));
const money=(v:unknown)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const firstName=(v:unknown)=>text(v,120).split(/\s+/)[0]||'Oi';
const digits=(v:unknown)=>String(v??'').replace(/\D/g,'');
const numberValue=(v:unknown)=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const normalizePhone=(v:unknown)=>{let d=digits(v);if(!d)return null;if(d.startsWith('55')&&(d.length===12||d.length===13))return `+${d}`;if(d.length===10||d.length===11)return `+55${d}`;return null};
const safeGoogleMapsUrl=(v:unknown)=>{const raw=text(v,1200);if(!raw)return null;try{const u=new URL(raw);const h=u.hostname.toLowerCase();const allowed=u.protocol==='https:'&&(h==='maps.app.goo.gl'||h==='goo.gl'||h==='google.com'||h.endsWith('.google.com'));return allowed?u.toString():null}catch{return null}};

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json(null,{ok:false,error:"origin_not_allowed"},403);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json(origin,{ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json(origin,{ok:false,error:"server_config"},500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return json(origin,{ok:false,error:"missing_token"},401);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:ud,error:ue}=await sb.auth.getUser(token);if(ue||!ud?.user?.id)return json(origin,{ok:false,error:"invalid_user"},401);
  const user=ud.user;const {data:admin,error:ae}=await sb.from("admin_users").select("role,is_active,display_name").eq("user_id",user.id).maybeSingle();if(ae)return json(origin,{ok:false,error:"admin_lookup_failed"},500);if(!admin?.is_active)return json(origin,{ok:false,error:"admin_not_authorized"},403);
  const canWrite=admin.role==='owner'||admin.role==='operator';let body:any;try{body=await req.json()}catch{body={}}const action=text(body?.action||'customers',60).toLowerCase();

  if(action==='customers'){
    const limit=int(body?.limit,10,80),page=int(body?.page,1,100000),from=(page-1)*limit,to=from+limit-1,q=text(body?.q,100).replace(/[,%()]/g,' ').trim(),segment=text(body?.segment,80).toLowerCase();
    const allowedSegments=new Set([
      'comprou_alguma_vez','primeira_compra','primeiro_comprador','recorrente','mensal','inativo','alto_valor',
      'comprador_cesta','produtos_avulsos','cesta_favorita','proximo_recompra','sem_compra_30d','sem_compra_60d',
      'mercearia','lavanderia','higiene','cesta_basica','falou_nao_comprou','carrinho_nao_concluido',
      'marketing_permitido','marketing_nao_permitido','atendimento_problema','baixa_qualidade_dados'
    ]);
    let segmentIds:string[]|null=null;
    if(segment){
      if(!allowedSegments.has(segment))return json(origin,{ok:false,error:'invalid_segment'},400);
      const {data:segmentRows,error:segmentError}=await sb.rpc('query_customer_segment_v1',{p_segment_key:segment,p_value:null,p_limit:1000,p_offset:0});
      if(segmentError)return json(origin,{ok:false,error:'customer_segments_filter_failed',detail:segmentError.message},400);
      const ids=(segmentRows||[]).map((row:any)=>String(row.customer_id||'')).filter(Boolean);
      segmentIds=ids;
      if(!ids.length)return json(origin,{ok:true,customers:[],total:0,page,limit,segment,segment_engine:'cm1.8-v1'});
    }
    let query=sb.from('customers').select('id,name,cpf_cnpj,primary_whatsapp_e164,preferred_reply,shopping_mode,catalog_skill_score,catalog_open_count,catalog_success_count,order_count,lifetime_value,last_order_at,last_catalog_at,is_active,updated_at',{count:'exact'}).order('last_order_at',{ascending:false,nullsFirst:false}).range(from,to);
    if(segmentIds)query=query.in('id',segmentIds);
    if(q)query=query.or(`name.ilike.%${q}%,primary_whatsapp_e164.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`);
    const {data,error,count}=await query;
    if(error)return json(origin,{ok:false,error:'customers_failed',detail:error.message},400);
    const rows=[];
    for(const customerRow of data||[]){
      const {data:mode}=await sb.rpc('resolve_customer_shopping_mode',{p_customer_id:customerRow.id});
      rows.push({...customerRow,resolved_shopping_mode:mode||'whatsapp_only'});
    }
    return json(origin,{ok:true,customers:rows,total:count||0,page,limit,segment:segment||null,segment_engine:'cm1.8-v1'});
  }
  if(action==='customer'){
    const id=text(body?.id,80);if(!id)return json(origin,{ok:false,error:'id_required'},400);const {data:customer,error}=await sb.from('customers').select('*').eq('id',id).maybeSingle();if(error||!customer)return json(origin,{ok:false,error:'customer_not_found'},404);
    const [{data:mode},{data:stats},{data:orders},{data:addresses},{data:recommendations,error:re}]=await Promise.all([
      sb.rpc('resolve_customer_shopping_mode',{p_customer_id:id}),
      sb.from('customer_product_stats').select('purchase_count,total_quantity,total_spent,first_purchase_at,last_purchase_at,product:products(id,name,price,image_url,category,brand,packaging,stock,is_offer)').eq('customer_id',id).order('last_purchase_at',{ascending:false}).limit(50),
      sb.from('orders').select('id,bling_order_id,status,total,confirmed_at,created_at,other_expenses,discount').eq('customer_id',id).order('created_at',{ascending:false}).limit(30),
      sb.from('customer_addresses').select('id,label,street,number,neighborhood,city,state,postal_code,is_default,is_active,last_confirmed_at').eq('customer_id',id).eq('is_active',true).order('is_default',{ascending:false}),
      sb.rpc('get_customer_recommendations',{p_customer_id:id,p_limit:30,p_kind:'personalized'})
    ]);if(re)return json(origin,{ok:false,error:'recommendations_failed',detail:re.message},400);
    const salesPlan={shopping_mode:mode||'whatsapp_only',preferred_reply:customer.preferred_reply||'auto',try_room_first:(mode==='catalog_first'),offer_room_as_option:(mode==='hybrid'),keep_whatsapp_primary:(mode==='whatsapp_only'),seller_audio_candidate:(customer.preferred_reply==='audio'||customer.preferred_reply==='auto')};
    return json(origin,{ok:true,customer,resolved_shopping_mode:mode||'whatsapp_only',sales_plan:salesPlan,purchased_products:stats||[],orders:orders||[],addresses:addresses||[],recommendations:recommendations||[]});
  }
  if(action==='customer_360'){
    const id=text(body?.id,80);if(!id)return json(origin,{ok:false,error:'id_required'},400);
    const {data:customer,error:customerError}=await sb.from('customers').select('*').eq('id',id).maybeSingle();
    if(customerError||!customer)return json(origin,{ok:false,error:'customer_not_found'},404);
    const timelineLimit=int(body?.timeline_limit,10,100);
    const [
      {data:phones,error:phonesError},
      {data:emails,error:emailsError},
      {data:addresses,error:addressesError},
      {data:identities,error:identitiesError},
      {data:consents,error:consentsError},
      {data:intelligence,error:intelligenceError},
      {data:segments,error:segmentsError},
      {data:timeline,error:timelineError},
      {data:behavior,error:behaviorError},
      {data:handoffs,error:handoffsError},
      {data:identityEvaluations,error:identityEvaluationsError},
      {data:productStats,error:productStatsError},
      {data:conversations,error:conversationsError},
      {data:carts,error:cartsError},
      {data:serviceMemory,error:serviceMemoryError},
      {data:substitutionPreferences,error:substitutionPreferencesError},
      {data:marketingTouchpoints,error:marketingTouchpointsError},
      {data:marketingEvents,error:marketingEventsError},
      {data:consentLedger,error:consentLedgerError},
      {data:customerProtection,error:customerProtectionError},
      {data:dynamicSegments,error:dynamicSegmentsError}
    ]=await Promise.all([
      sb.from('customer_phones').select('id,phone_e164,source,is_primary,verified_at,created_at').eq('customer_id',id).order('is_primary',{ascending:false}),
      sb.from('customer_emails').select('id,email,verification_status,is_primary,source,verified_at,linked_at,created_at').eq('customer_id',id).order('is_primary',{ascending:false}),
      sb.from('customer_addresses').select('id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,is_active,last_confirmed_at,google_maps_url,latitude,longitude').eq('customer_id',id).order('is_default',{ascending:false}),
      sb.from('customer_channel_identities').select('id,channel,channel_account_id,external_user_id,identity_kind,verification_status,verified_at,evidence,created_at,updated_at,linked_at').eq('customer_id',id).order('updated_at',{ascending:false}),
      sb.from('customer_channel_consents').select('id,channel,channel_identity_id,customer_email_id,purpose,status,source,evidence,occurred_at,created_at').eq('customer_id',id).order('occurred_at',{ascending:false}),
      sb.rpc('get_customer_purchase_intelligence_v1',{p_customer_id:id,p_product_limit:10,p_category_limit:8}),
      sb.rpc('get_customer_commercial_segments_v1',{p_customer_id:id}),
      sb.from('customer_timeline_v1').select('customer_id,conversation_id,occurred_at,channel,event_kind,direction,title,body_text,reference_id,metadata').eq('customer_id',id).order('occurred_at',{ascending:false}).limit(timelineLimit),
      sb.from('customer_behavior_events').select('id,conversation_id,event_type,event_data,occurred_at').eq('customer_id',id).order('occurred_at',{ascending:false}).limit(50),
      sb.from('human_handoffs').select('id,conversation_id,reason,priority,status,summary,channel,created_at,claimed_at,resolved_at,sla_due_at').eq('customer_id',id).order('created_at',{ascending:false}).limit(20),
      sb.from('customer_identity_resolution_evaluations').select('id,decision,confidence,confidence_scope,match_method,review_status,source,channel,evidence,created_at,matched_at,reviewed_at').eq('customer_id',id).order('created_at',{ascending:false}).limit(20),
      sb.from('customer_product_stats').select('purchase_count,total_quantity,total_spent,first_purchase_at,last_purchase_at,product:products(id,name,brand,category,subcategory,packaging,image_url,is_active)').eq('customer_id',id).order('last_purchase_at',{ascending:false}).limit(100),
      sb.from('conversations').select('id,source,status,stage,response_preference,human_required,context_summary,opened_at,last_inbound_at,last_outbound_at,mode,sales_pressure_level,proactive_offer_count,upsell_declined,fast_checkout,last_offer_at,room_last_active_at,channel,channel_account_id,external_user_id,created_at,updated_at').eq('customer_id',id).order('updated_at',{ascending:false}).limit(30),
      sb.from('carts').select('id,conversation_id,basket_id,status,subtotal,adjustments,total,currency,expires_at,created_at,updated_at,pricing_status,pricing_issues').eq('customer_id',id).order('updated_at',{ascending:false}).limit(30),
      sb.from('customer_service_memory').select('id,memory_key,memory_value,confidence,status,expires_at,source_kind,evidence_count,last_evidence_at,metadata,created_at,updated_at').eq('customer_id',id).order('updated_at',{ascending:false}).limit(50),
      sb.from('customer_substitution_preferences').select('id,product_id,substitution_group_id,basket_id,preference,notes,created_at,updated_at').eq('customer_id',id).order('updated_at',{ascending:false}).limit(50),
      sb.from('marketing_attribution_touchpoints').select('id,asset_id,campaign_id,channel,touchpoint_type,subject_ref,parent_touchpoint_id,evidence_key,evidence_source,occurred_at,evidence,created_at').eq('subject_ref',id).order('occurred_at',{ascending:false}).limit(50),
      sb.from('marketing_events').select('id,entity_type,entity_id,event_type,data,external_side_effect,created_at').eq('entity_type','customer').eq('entity_id',id).order('created_at',{ascending:false}).limit(50),
      sb.from('customer_channel_consent_events_v1').select('id,channel,channel_identity_id,customer_email_id,purpose,status,source,evidence,policy_version,event_key,occurred_at,created_at').eq('customer_id',id).order('occurred_at',{ascending:false}).limit(100),
      sb.rpc('evaluate_customer_contact_eligibility_v1',{p_customer_id:id,p_channel:'whatsapp',p_purpose:'marketing'}),
      sb.rpc('get_customer_dynamic_segments_v1',{p_customer_id:id})
    ]);
    const failures=[
      ['phones',phonesError],['emails',emailsError],['addresses',addressesError],['identities',identitiesError],
      ['consents',consentsError],['intelligence',intelligenceError],['segments',segmentsError],['timeline',timelineError],
      ['behavior',behaviorError],['handoffs',handoffsError],['identity_evaluations',identityEvaluationsError],
      ['product_stats',productStatsError],['conversations',conversationsError],['carts',cartsError],
      ['service_memory',serviceMemoryError],['substitution_preferences',substitutionPreferencesError],
      ['marketing_touchpoints',marketingTouchpointsError],['marketing_events',marketingEventsError],
      ['consent_ledger',consentLedgerError],['customer_protection',customerProtectionError],
      ['dynamic_segments',dynamicSegmentsError]
    ].filter(([,e])=>Boolean(e)).map(([part,e]:any)=>({part,error:e.message}));
    if(failures.length)return json(origin,{ok:false,error:'customer_360_failed',failures},400);
    const activeConsents=(consents||[]).reduce((acc:any,row:any)=>{
      const key=`${row.channel}:${row.purpose}`;if(!acc[key])acc[key]=row;return acc;
    },{});
    const productRows=(productStats||[]).filter((x:any)=>x.product);
    const brandMap=new Map<string,any>();
    const categoryMap=new Map<string,any>();
    for(const rawRow of productRows){
      const row:any=rawRow;
      const brand=text(row.product?.brand,120)||'Sem marca';
      const category=text(row.product?.category,120)||'Sem categoria';
      const brandAgg=brandMap.get(brand)||{brand,purchase_count:0,total_quantity:0,total_spent:0,last_purchase_at:null};
      brandAgg.purchase_count+=Number(row.purchase_count||0);
      brandAgg.total_quantity+=Number(row.total_quantity||0);
      brandAgg.total_spent+=Number(row.total_spent||0);
      if(!brandAgg.last_purchase_at||String(row.last_purchase_at||'')>String(brandAgg.last_purchase_at||''))brandAgg.last_purchase_at=row.last_purchase_at||null;
      brandMap.set(brand,brandAgg);
      const categoryAgg=categoryMap.get(category)||{category,purchase_count:0,total_quantity:0,total_spent:0,last_purchase_at:null};
      categoryAgg.purchase_count+=Number(row.purchase_count||0);
      categoryAgg.total_quantity+=Number(row.total_quantity||0);
      categoryAgg.total_spent+=Number(row.total_spent||0);
      if(!categoryAgg.last_purchase_at||String(row.last_purchase_at||'')>String(categoryAgg.last_purchase_at||''))categoryAgg.last_purchase_at=row.last_purchase_at||null;
      categoryMap.set(category,categoryAgg);
    }
    const brands=[...brandMap.values()].sort((a,b)=>b.total_spent-a.total_spent||b.purchase_count-a.purchase_count).slice(0,20);
    const categories=[...categoryMap.values()].sort((a,b)=>b.total_spent-a.total_spent||b.purchase_count-a.purchase_count).slice(0,20);
    const segmentKeys=Array.isArray(dynamicSegments?.segments)?dynamicSegments.segments:(Array.isArray(segments?.segments)?segments.segments:[]);
    const lifecycle=Number(intelligence?.order_count||0)===0?'prospect':
      segmentKeys.includes('inativo')?'inactive':
      segmentKeys.includes('primeiro_comprador')?'new_customer':
      (segmentKeys.includes('recorrente')||segmentKeys.includes('mensal'))?'recurring':'active';
    const interactionCandidates=[
      ...(timeline||[]).map((x:any)=>x.occurred_at),
      ...(conversations||[]).flatMap((x:any)=>[x.last_inbound_at,x.last_outbound_at,x.updated_at]),
      customer.last_catalog_at,customer.last_order_at
    ].filter(Boolean).map((x:any)=>new Date(x)).filter((x:Date)=>!Number.isNaN(x.getTime())).sort((a:Date,b:Date)=>b.getTime()-a.getTime());
    const lastInteractionAt=interactionCandidates[0]?.toISOString()||null;
    const openCart=(carts||[]).find((x:any)=>['draft','open','active'].includes(String(x.status||'').toLowerCase()))||null;
    const dataQuality={
      has_name:Boolean(customer.name),
      has_phone:Boolean(customer.primary_whatsapp_e164||(phones||[]).length),
      has_document:Boolean(customer.cpf_cnpj),
      has_address:Boolean((addresses||[]).some((x:any)=>x.is_active!==false)),
      has_verified_channel:Boolean((identities||[]).some((x:any)=>x.verification_status==='verified')),
      has_purchase_history:Number(intelligence?.order_count||0)>0,
      has_positive_marketing_consent:Object.values(activeConsents).some((x:any)=>x.purpose==='marketing'&&x.status==='granted')
    };
    const completeness=Math.round(Object.values(dataQuality).filter(Boolean).length/Object.keys(dataQuality).length*100);
    return json(origin,{
      ok:true,
      customer,
      contact:{phones:phones||[],emails:emails||[],addresses:addresses||[],channel_identities:identities||[]},
      consent:{current:activeConsents,ledger:consentLedger||[]},
      summary:{
        lifecycle,
        customer_since:customer.created_at||null,
        last_interaction_at:lastInteractionAt,
        last_purchase_at:intelligence?.last_order_at||customer.last_order_at||null,
        order_count:Number(intelligence?.order_count||customer.order_count||0),
        lifetime_value:Number(intelligence?.lifetime_value||customer.lifetime_value||0),
        average_ticket:Number(intelligence?.average_ticket||0),
        open_cart:openCart?{id:openCart.id,total:openCart.total,status:openCart.status,updated_at:openCart.updated_at}:null
      },
      commercial:{intelligence:intelligence||{},segments:dynamicSegments||segments||{},legacy_segments:segments||{},products:productRows,brands,categories},
      activity:{timeline:timeline||[],behavior_events:behavior||[],handoffs:handoffs||[],conversations:conversations||[],carts:carts||[]},
      preferences:{service_memory:serviceMemory||[],substitutions:substitutionPreferences||[]},
      marketing:{touchpoints:marketingTouchpoints||[],events:marketingEvents||[]},
      customer_protection:customerProtection||{},
      identity_resolution:{latest:(identityEvaluations||[])[0]||null,evaluations:identityEvaluations||[]},
      data_quality:{...dataQuality,completeness_percent:completeness}
    });
  }
  if(action==='segment_registry'){
    const [{data:registry,error:registryError},{data:summary,error:summaryError}]=await Promise.all([
      sb.from('customer_segment_registry_v1').select('segment_key,label,requires_value,description').order('requires_value').order('label'),
      sb.rpc('segment_engine_summary_v1')
    ]);
    if(registryError||summaryError)return json(origin,{ok:false,error:'segment_registry_failed',detail:registryError?.message||summaryError?.message},400);
    return json(origin,{ok:true,registry:registry||[],summary:summary||{},engine_version:'cm1.8-v1'});
  }
  if(action==='contact_eligibility'){
    const id=text(body?.id,80),channel=text(body?.channel||'whatsapp',40).toLowerCase(),purpose=text(body?.purpose||'marketing',40).toLowerCase();
    if(!id)return json(origin,{ok:false,error:'id_required'},400);
    const {data,error}=await sb.rpc('evaluate_customer_contact_eligibility_v1',{p_customer_id:id,p_channel:channel,p_purpose:purpose});
    if(error)return json(origin,{ok:false,error:'contact_eligibility_failed',detail:error.message},400);
    return json(origin,{ok:true,eligibility:data||{}});
  }
  if(action==='record_consent'){
    if(!canWrite)return json(origin,{ok:false,error:'read_only'},403);
    const id=text(body?.id,80),channel=text(body?.channel||'whatsapp',40).toLowerCase(),purpose=text(body?.purpose||'marketing',40).toLowerCase(),status=text(body?.status,20).toLowerCase();
    const method=text(body?.method,80).toLowerCase(),note=text(body?.note,1000),policyVersion=text(body?.policy_version||'admin-manual-v1',120);
    if(!id)return json(origin,{ok:false,error:'id_required'},400);
    if(!['granted','denied','revoked','unknown'].includes(status))return json(origin,{ok:false,error:'invalid_consent_status'},400);
    if(status==='granted'&&method!=='manual_documented')return json(origin,{ok:false,error:'manual_grant_requires_documented_evidence'},400);
    if(status==='granted'&&note.length<10)return json(origin,{ok:false,error:'manual_grant_note_required'},400);
    const evidence={method:method||'admin_record',note:note||null,actor_role:admin.role,actor_display_name:admin.display_name||null};
    const {data,error}=await sb.rpc('record_customer_consent_v1',{
      p_customer_id:id,p_channel:channel,p_purpose:purpose,p_status:status,
      p_source:'admin_customer_360',p_policy_version:policyVersion,p_evidence:evidence,
      p_event_key:null,p_recorded_by:user.id
    });
    if(error)return json(origin,{ok:false,error:'record_consent_failed',detail:error.message},400);
    const {data:eligibility}=await sb.rpc('evaluate_customer_contact_eligibility_v1',{p_customer_id:id,p_channel:channel,p_purpose:purpose});
    return json(origin,{ok:true,consent:data,eligibility:eligibility||{}});
  }
  if(action==='suppress_contact'){
    if(!canWrite)return json(origin,{ok:false,error:'read_only'},403);
    const id=text(body?.id,80),channel=text(body?.channel||'whatsapp',40).toLowerCase(),purpose=text(body?.purpose||'marketing',40).toLowerCase(),reasonCode=text(body?.reason_code,80).toLowerCase(),notes=text(body?.notes,1000);
    const allowedReasons=new Set(['customer_request','complaint','wrong_number','manual_hold','legal_request']);
    if(!id)return json(origin,{ok:false,error:'id_required'},400);
    if(!allowedReasons.has(reasonCode))return json(origin,{ok:false,error:'invalid_suppression_reason'},400);
    const {data,error}=await sb.from('customer_contact_suppressions').insert({
      customer_id:id,channel,purpose,reason_code:reasonCode,source:'admin_customer_360',
      notes:notes||null,evidence:{actor_role:admin.role,actor_display_name:admin.display_name||null},
      active:true,created_by:user.id
    }).select('id,customer_id,channel,purpose,reason_code,source,notes,active,expires_at,created_at').single();
    if(error)return json(origin,{ok:false,error:'contact_suppression_failed',detail:error.message},400);
    const {data:eligibility}=await sb.rpc('evaluate_customer_contact_eligibility_v1',{p_customer_id:id,p_channel:channel,p_purpose:purpose});
    return json(origin,{ok:true,suppression:data,eligibility:eligibility||{}});
  }
  if(action==='release_suppression'){
    if(!canWrite)return json(origin,{ok:false,error:'read_only'},403);
    const suppressionId=text(body?.suppression_id,80);
    if(!suppressionId)return json(origin,{ok:false,error:'suppression_id_required'},400);
    const {data:existing,error:lookupError}=await sb.from('customer_contact_suppressions').select('id,customer_id,channel,purpose,active').eq('id',suppressionId).maybeSingle();
    if(lookupError||!existing)return json(origin,{ok:false,error:'suppression_not_found'},404);
    const {data,error}=await sb.from('customer_contact_suppressions').update({active:false,revoked_at:new Date().toISOString(),revoked_by:user.id}).eq('id',suppressionId).select('id,customer_id,channel,purpose,reason_code,active,revoked_at').single();
    if(error)return json(origin,{ok:false,error:'release_suppression_failed',detail:error.message},400);
    const {data:eligibility}=await sb.rpc('evaluate_customer_contact_eligibility_v1',{p_customer_id:existing.customer_id,p_channel:existing.channel||'whatsapp',p_purpose:existing.purpose||'marketing'});
    return json(origin,{ok:true,suppression:data,eligibility:eligibility||{}});
  }
  if(action==='identity_readiness'){
    const {data,error}=await sb.rpc('identity_resolution_readiness_v1');
    if(error)return json(origin,{ok:false,error:'identity_readiness_failed',detail:error.message},400);
    return json(origin,{ok:true,readiness:data||{}});
  }
  if(action==='identity_conflicts'){
    const limit=int(body?.limit,10,100);
    const {data,error}=await sb.from('customer_identity_resolution_evaluations')
      .select('id,decision,confidence,confidence_scope,match_method,review_status,source,channel,evidence,created_at,reviewed_at,review_notes')
      .eq('decision','conflict')
      .eq('review_status','pending')
      .order('created_at',{ascending:false})
      .limit(limit);
    if(error)return json(origin,{ok:false,error:'identity_conflicts_failed',detail:error.message},400);
    const conflicts=[];
    for(const row of data||[]){
      const candidateIds=Array.isArray(row.evidence?.candidate_ids)?row.evidence.candidate_ids.map((x:any)=>String(x)).filter(Boolean):[];
      let candidates:any[]=[];
      if(candidateIds.length){
        const {data:candidateRows,error:candidateError}=await sb.from('customers')
          .select('id,name,primary_whatsapp_e164,cpf_cnpj,bling_contact_id,order_count,lifetime_value,last_order_at')
          .in('id',candidateIds);
        if(candidateError)return json(origin,{ok:false,error:'identity_conflict_candidates_failed',detail:candidateError.message},400);
        candidates=candidateRows||[];
      }
      conflicts.push({...row,candidates});
    }
    return json(origin,{ok:true,conflicts});
  }
  if(action==='identity_review'){
    if(!canWrite)return json(origin,{ok:false,error:'read_only'},403);
    const evaluationId=text(body?.id,80),review=text(body?.review,20).toLowerCase(),notes=text(body?.notes,1000),selectedCustomerId=text(body?.customer_id,80)||null;
    if(!evaluationId)return json(origin,{ok:false,error:'id_required'},400);
    if(!['approved','rejected'].includes(review))return json(origin,{ok:false,error:'invalid_review'},400);
    const {data:evaluation,error:lookupError}=await sb.from('customer_identity_resolution_evaluations')
      .select('id,decision,evidence,review_status')
      .eq('id',evaluationId).maybeSingle();
    if(lookupError||!evaluation)return json(origin,{ok:false,error:'identity_evaluation_not_found'},404);
    if(evaluation.review_status!=='pending')return json(origin,{ok:false,error:'identity_review_already_closed'},409);
    const candidates=Array.isArray(evaluation.evidence?.candidate_ids)?evaluation.evidence.candidate_ids.map((x:any)=>String(x)):[];
    if(review==='approved'){
      if(!selectedCustomerId)return json(origin,{ok:false,error:'customer_id_required'},400);
      if(!candidates.includes(selectedCustomerId))return json(origin,{ok:false,error:'customer_not_in_candidates'},400);
    }
    const patch:any={
      review_status:review,
      reviewed_at:new Date().toISOString(),
      reviewed_by:user.id,
      review_notes:notes||null
    };
    if(review==='approved')patch.customer_id=selectedCustomerId;
    const {data,error}=await sb.from('customer_identity_resolution_evaluations')
      .update(patch).eq('id',evaluationId)
      .select('id,decision,customer_id,confidence,match_method,review_status,reviewed_at,review_notes').single();
    if(error)return json(origin,{ok:false,error:'identity_review_failed',detail:error.message},400);
    return json(origin,{ok:true,evaluation:data,side_effects:'review_only_no_merge'});
  }
  if(action==='customer_history'){
    const id=text(body?.id,80);if(!id)return json(origin,{ok:false,error:'id_required'},400);
    const page=int(body?.page,1,100000),limit=int(body?.limit,5,50),offset=(page-1)*limit;
    const [{data:intelligence,error:intelligenceError},{data:history,error:historyError},{data:segments,error:segmentsError},historyCount]=await Promise.all([
      sb.rpc('get_customer_purchase_intelligence_v1',{p_customer_id:id,p_product_limit:8,p_category_limit:5}),
      sb.rpc('get_customer_purchase_history_v1',{p_customer_id:id,p_limit:limit,p_offset:offset}),
      sb.rpc('get_customer_commercial_segments_v1',{p_customer_id:id}),
      sb.from('orders').select('id',{count:'exact',head:true}).eq('customer_id',id)
    ]);
    if(intelligenceError)return json(origin,{ok:false,error:'customer_intelligence_failed',detail:intelligenceError.message},400);
    if(historyError)return json(origin,{ok:false,error:'customer_history_failed',detail:historyError.message},400);
    if(segmentsError)return json(origin,{ok:false,error:'customer_segments_failed',detail:segmentsError.message},400);
    if(historyCount.error)return json(origin,{ok:false,error:'customer_history_count_failed',detail:historyCount.error.message},400);
    return json(origin,{ok:true,intelligence:intelligence||{},segments:segments||{},orders:history||[],total:historyCount.count||0,page,limit});
  }
  if(action==='customer_history_order'){
    const customerId=text(body?.customer_id,80),orderId=text(body?.order_id,80);
    if(!customerId||!orderId)return json(origin,{ok:false,error:'ids_required'},400);
    const {data,error}=await sb.rpc('get_customer_order_detail_v1',{p_customer_id:customerId,p_order_id:orderId});
    if(error)return json(origin,{ok:false,error:'customer_order_history_failed',detail:error.message},400);
    if(!data||Object.keys(data).length===0)return json(origin,{ok:false,error:'order_not_found'},404);
    return json(origin,{ok:true,detail:data});
  }
  if(action==='save_customer'){
    if(!canWrite)return json(origin,{ok:false,error:'read_only'},403);
    const id=text(body?.id,80),name=text(body?.name,180),phone=normalizePhone(body?.phone),cpf=digits(body?.cpf_cnpj)||null,email=text(body?.email,320).toLowerCase()||null;
    if(!name)return json(origin,{ok:false,error:'name_required'},400);
    if(body?.phone&&!phone)return json(origin,{ok:false,error:'invalid_phone'},400);
    if(phone){
      let dup=sb.from('customers').select('id').eq('primary_whatsapp_e164',phone);
      if(id)dup=dup.neq('id',id);
      const {data:duplicate}=await dup.limit(1).maybeSingle();
      if(duplicate)return json(origin,{ok:false,error:'phone_already_used'},409);
    }
    const row:any={name,cpf_cnpj:cpf,primary_whatsapp_e164:phone,is_active:body?.is_active!==false,updated_at:new Date().toISOString()};
    let customer:any;
    if(id){
      const {data,error}=await sb.from('customers').update(row).eq('id',id).select('id,name,cpf_cnpj,primary_whatsapp_e164,is_active').single();
      if(error)return json(origin,{ok:false,error:'customer_save_failed',detail:error.message},400);
      customer=data;
    }else{
      const {data,error}=await sb.from('customers').insert(row).select('id,name,cpf_cnpj,primary_whatsapp_e164,is_active').single();
      if(error)return json(origin,{ok:false,error:'customer_save_failed',detail:error.message},400);
      customer=data;
    }
    const customerId=customer.id;
    if(phone){
      await sb.from('customer_phones').delete().eq('customer_id',customerId);
      const {error}=await sb.from('customer_phones').insert({customer_id:customerId,phone_e164:phone,source:'admin',is_primary:true,linked_by_admin_user_id:user.id});
      if(error)return json(origin,{ok:false,error:'phone_save_failed',detail:error.message},400);
    }
    if(email){
      await sb.from('customer_emails').delete().eq('customer_id',customerId);
      const {error}=await sb.from('customer_emails').insert({customer_id:customerId,email,email_normalized:email,verification_status:'unverified',is_primary:true,source:'admin',evidence:{},linked_by_admin_user_id:user.id});
      if(error)return json(origin,{ok:false,error:'email_save_failed',detail:error.message},400);
    }
    if(body?.address&&typeof body.address==='object'){
      const a=body.address,rawMaps=text(a.google_maps_url,1200),mapsUrl=safeGoogleMapsUrl(rawMaps);
      if(rawMaps&&!mapsUrl)return json(origin,{ok:false,error:'invalid_google_maps_url'},400);
      const payload={
        customer_id:customerId,label:text(a.label,80)||'Principal',street:text(a.street,180)||null,number:text(a.number,60)||null,
        complement:text(a.complement,180)||null,neighborhood:text(a.neighborhood,180)||null,city:text(a.city,120)||null,
        state:text(a.state,2).toUpperCase()||'MT',postal_code:digits(a.postal_code)||null,reference:text(a.reference,300)||null,
        google_maps_url:mapsUrl,is_default:true,is_active:true,updated_at:new Date().toISOString()
      };
      const {data:existing}=await sb.from('customer_addresses').select('id').eq('customer_id',customerId).eq('is_default',true).limit(1).maybeSingle();
      if(existing){
        const {error}=await sb.from('customer_addresses').update(payload).eq('id',existing.id);
        if(error)return json(origin,{ok:false,error:'address_save_failed',detail:error.message},400);
      }else{
        const {error}=await sb.from('customer_addresses').insert(payload);
        if(error)return json(origin,{ok:false,error:'address_save_failed',detail:error.message},400);
      }
    }
    return json(origin,{ok:true,customer});
  }
  if(action==='set_shopping_mode'){
    if(!canWrite)return json(origin,{ok:false,error:'read_only'},403);const id=text(body?.id,80),mode=text(body?.mode,30);if(!['auto','catalog_first','whatsapp_only','hybrid'].includes(mode))return json(origin,{ok:false,error:'invalid_mode'},400);const {data,error}=await sb.from('customers').update({shopping_mode:mode,updated_at:new Date().toISOString()}).eq('id',id).select('id,shopping_mode,catalog_skill_score').single();if(error)return json(origin,{ok:false,error:'update_failed',detail:error.message},400);return json(origin,{ok:true,customer:data});
  }
  if(action==='record_signal'){
    if(!canWrite)return json(origin,{ok:false,error:'read_only'},403);const id=text(body?.id,80),eventType=text(body?.event_type,60);const allowed=['catalog_capable_signal','catalog_preferred_explicit','whatsapp_only_explicit','hybrid_preferred_explicit'];if(!allowed.includes(eventType))return json(origin,{ok:false,error:'invalid_event'},400);
    const {error}=await sb.from('customer_behavior_events').insert({customer_id:id,conversation_id:body?.conversation_id||null,event_type:eventType,event_data:body?.event_data&&typeof body.event_data==='object'?body.event_data:{}});if(error)return json(origin,{ok:false,error:'event_failed',detail:error.message},400);
    const {data:s}=await sb.from('catalog_sessions').select('id').eq('customer_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();if(s?.id)await sb.from('catalog_events').insert({catalog_session_id:s.id,customer_id:id,event_type:eventType,event_data:{source:'admin_signal'}});else{if(eventType==='catalog_preferred_explicit')await sb.from('customers').update({shopping_mode:'catalog_first',catalog_skill_score:60}).eq('id',id);if(eventType==='whatsapp_only_explicit')await sb.from('customers').update({shopping_mode:'whatsapp_only',catalog_skill_score:0}).eq('id',id);if(eventType==='hybrid_preferred_explicit')await sb.from('customers').update({shopping_mode:'hybrid'}).eq('id',id);if(eventType==='catalog_capable_signal')await sb.from('customers').update({catalog_skill_score:15}).eq('id',id).lt('catalog_skill_score',15)}return json(origin,{ok:true});
  }
  if(action==='create_catalog'||action==='create_room'){
    if(!canWrite)return json(origin,{ok:false,error:'read_only'},403);const id=text(body?.id,80),kind=text(body?.kind||'personalized',30),limit=int(body?.limit,1,30);if(!id)return json(origin,{ok:false,error:'id_required'},400);const {data:customer}=await sb.from('customers').select('id,name').eq('id',id).maybeSingle();if(!customer)return json(origin,{ok:false,error:'customer_not_found'},404);
    const {data:session,error}=await sb.rpc('create_customer_catalog_session',{p_customer_id:id,p_conversation_id:body?.conversation_id||null,p_cart_id:body?.cart_id||null,p_kind:kind,p_limit:limit,p_created_by:user.id});if(error)return json(origin,{ok:false,error:'room_create_failed',detail:error.message},400);
    await sb.from('catalog_sessions').update({experience:'shopping_room',current_view:kind==='basket'?'basket':'home',last_activity_at:new Date().toISOString()}).eq('id',session.id);
    const {data:items}=await sb.from('catalog_session_items').select('rank,reason,product:products(name,price)').eq('catalog_session_id',session.id).order('rank',{ascending:true});const link=`https://donaantonia.com.br/comprar/?s=${session.token}`;
    const lines=(items||[]).slice(0,30).map((x:any,i:number)=>`${i+1}. ${text(x.product?.name,70)} — ${money(x.product?.price)}`);const intro=kind==='offers'?`${firstName(customer.name)}, hoje estou com vários produtos em oferta. Separei algumas opções para você:`:`${firstName(customer.name)}, preparei sua Sala de Compra com algumas sugestões:`;const whatsappText=[intro,'',...lines,'',`Para ver as fotos, montar e conferir o pedido: ${link}`].join('\n');const voiceIntro=kind==='offers'?`${firstName(customer.name)}, hoje eu estou com vários produtos em oferta. Vou abrir sua Sala de Compra para você olhar com calma, tá?`:`${firstName(customer.name)}, eu preparei sua Sala de Compra com algumas sugestões e você pode escolher do seu jeito.`;
    return json(origin,{ok:true,session,link,room_url:link,whatsapp_text:whatsappText,voice_intro:voiceIntro,item_count:session.item_count||0});
  }
  return json(origin,{ok:false,error:'unknown_action'},400);
});
