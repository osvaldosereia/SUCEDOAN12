import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {
  DEFAULT_STRATEGY_WEIGHTS_V1,
  rankOffers,
  chooseFormat,
} from "../_shared/marketing-strategy-engine-v1.mjs";
import {
  findReusableTemplate,
  buildStrategyTemplateDraft,
  buildStrategyTemplateProfile,
  strategyTemplateName,
} from "../_shared/marketing-template-strategy-v1.mjs";
import {
  buildTemplateCacheRows,
  listTemplatesViaMeta,
  createTemplateViaMeta,
  MetaTemplatesError,
} from "../_shared/whatsapp-meta-templates-v1.mjs";
import {
  createCarouselTemplateViaMeta,
  uploadTemplateMediaSampleViaMeta,
  MetaCarouselError,
} from "../_shared/whatsapp-meta-carousel-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_WHATSAPP_ACCESS_TOKEN=(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"").trim();
const META_WHATSAPP_GRAPH_VERSION=(Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"").trim();
const META_APP_ID=(Deno.env.get("META_APP_ID")||Deno.env.get("WHATSAPP_APP_ID")||"").trim();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const MAX_BODY_BYTES=48000;
const MAX_MEDIA_BYTES=18*1024*1024;
const MEDIA_HOSTS=new Set([
  "donaantonia.com.br","www.donaantonia.com.br","ssbesxgaijknwsjbsbcz.supabase.co",
  "firebasestorage.googleapis.com","storage.googleapis.com",
]);
const FORBIDDEN_FIELDS=new Set([
  "waba_id","to_phone_e164","destination_phone","phone_number_id","access_token",
  "service_role","service_key","outbox_id","runtime_mode","campaigns_enabled","ana_enabled",
]);
const GET_ACTIONS=new Set(["overview","detail","calendar","opportunities","learnings","settings"]);
const POST_ACTIONS=new Set([
  "generate","regenerate","edit_draft","request_internal_approval","approve_internal","discard",
  "save_weights","save_seasonality","submit_template","refresh_template_status",
]);
const GENERATE_FIELDS=new Set(["whatsapp_account_id","period_start","period_end","schedule_suggestion","prefer_carousel","regenerated_from"]);
const EDIT_FIELDS=new Set(["strategy_id","expected_revision","objective","copy_snapshot","schedule_suggestion","offer_format"]);
const TRANSITION_FIELDS=new Set(["strategy_id","expected_revision","reason"]);
const TEMPLATE_GATE_FIELDS=new Set(["strategy_id","expected_revision"]);
const WEIGHT_FIELDS=new Set(["weights","version_note"]);
const SEASONALITY_FIELDS=new Set(["rule_key","name","starts_on","ends_on","month_numbers","day_of_month_start","day_of_month_end","priority","score_effect","operational_closed","metadata"]);
const WEIGHT_KEYS=Object.keys(DEFAULT_STRATEGY_WEIGHTS_V1);

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const objectLike=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const validUuid=(value:unknown)=>{const s=String(value??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const clean=(value:unknown,max=300)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const onlyKeys=(body:Record<string,unknown>,allowed:Set<string>)=>Object.keys(body).every(key=>allowed.has(key));
const clamp01=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0};
const metaReady=()=>Boolean(META_WHATSAPP_ACCESS_TOKEN&&/^v\d+\.\d+$/.test(META_WHATSAPP_GRAPH_VERSION));

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  return {ok:true as const,status:200,user_id:user.data.user.id};
}
function hasForbiddenField(value:unknown):boolean{
  if(Array.isArray(value))return value.some(hasForbiddenField);
  if(!objectLike(value))return false;
  for(const [key,nested] of Object.entries(value)){
    if(FORBIDDEN_FIELDS.has(String(key).toLowerCase()))return true;
    if(hasForbiddenField(nested))return true;
  }
  return false;
}
async function readJsonBody(req:Request){
  const raw=await req.text();
  if(raw.length>MAX_BODY_BYTES)return {ok:false as const,error:"payload_too_large"};
  if(!raw.trim())return {ok:true as const,body:{}};
  try{const parsed=JSON.parse(raw);if(!objectLike(parsed))return {ok:false as const,error:"invalid_json_body"};return {ok:true as const,body:parsed as Record<string,unknown>}}
  catch{return {ok:false as const,error:"invalid_json_body"}}
}
function isoDate(value:unknown,fallback:string){
  const raw=String(value??"").trim();
  if(!raw)return fallback;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:null;
}
function isoDateTime(value:unknown){
  const raw=String(value??"").trim();if(!raw)return null;
  const ms=Date.parse(raw);return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
function localDateParts(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Cuiaba",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const pick=(type:string)=>parts.find(p=>p.type===type)?.value||"";
  return {date:`${pick("year")}-${pick("month")}-${pick("day")}`,month:Number(pick("month")),day:Number(pick("day"))};
}
function moneyBRL(value:unknown){
  const amount=Number(value||0);
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number.isFinite(amount)?amount:0);
}
function seasonalityApplies(row:any,parts:{date:string,month:number,day:number}){
  if(row?.is_active!==true)return false;
  if(row?.starts_on&&parts.date<String(row.starts_on))return false;
  if(row?.ends_on&&parts.date>String(row.ends_on))return false;
  const months=Array.isArray(row?.month_numbers)?row.month_numbers.map(Number):[];
  if(months.length&&!months.includes(parts.month))return false;
  if(row?.day_of_month_start&&parts.day<Number(row.day_of_month_start))return false;
  if(row?.day_of_month_end&&parts.day>Number(row.day_of_month_end))return false;
  return true;
}
function fallbackCopy(offers:any[],format:string){
  if(format==="carousel")return {
    copy_source:"fallback",
    headline:"Cestas e Kits da semana",
    body:"Escolha a opção que combina melhor com sua casa. Entrega grátis quando elegível para sua região.",
    cta:"Ver opções",
  };
  const offer=offers[0]||{};
  return {
    copy_source:"fallback",
    headline:String(offer.public_name||"Oferta Dona Antônia"),
    body:`${String(offer.public_name||"Cesta ou Kit")} por ${moneyBRL(offer.sale_price)}. Entrega grátis quando elegível para sua região.`,
    cta:"Ver cesta ou kit",
  };
}
async function activeWeights(){
  const result=await db.from("marketing_strategy_weight_sets_v1").select("id,version,weights,created_at").eq("is_active",true).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(result.error)throw result.error;
  if(result.data&&objectLike((result.data as any).weights))return result.data as any;
  return {id:null,version:"v1-fallback",weights:DEFAULT_STRATEGY_WEIGHTS_V1,created_at:null};
}
async function activeSeasonality(){
  const result=await db.from("marketing_seasonality_rules_v1").select("*").eq("is_active",true).order("priority",{ascending:false}).order("created_at",{ascending:false});
  if(result.error)throw result.error;
  return result.data||[];
}
async function eligibleCatalog(){
  const result=await db.from("basket_commercial_catalog_v1")
    .select("source_kind,commercial_id,basket_id,standalone_kit_template_id,model_name,category_id,category_name,category_slug,model_active,category_active,image_url,public_lot_id,public_lot_code,public_available,availability_reason,public_name,sale_price,public_lot_built_at")
    .eq("model_active",true)
    .eq("category_active",true)
    .gt("public_available",0)
    .eq("availability_reason","available")
    .gte("sale_price",75)
    .order("public_available",{ascending:false})
    .order("public_name",{ascending:true});
  if(result.error)throw result.error;
  return result.data||[];
}
async function audienceSnapshot(){
  const result=await db.rpc("marketing_preview_audience_v1",{p_filters:{},p_limit:1,p_offset:0});
  if(result.error)throw result.error;
  const data=result.data||{};
  return {
    mode:"all_eligible",
    filters:{},
    weekly_frequency_cap:1,
    found_count:Number(data?.found_count||0),
    eligible_count:Number(data?.eligible_count||0),
    excluded_count:Number(data?.excluded_count||0),
    exclusion_reasons:objectLike(data?.exclusion_reasons)?data.exclusion_reasons:{},
  };
}
async function usedOfferIds(){
  const result=await db.from("marketing_strategy_offers_v1").select("commercial_id").limit(5000);
  if(result.error)throw result.error;
  return new Set((result.data||[]).map((row:any)=>String(row.commercial_id||"")).filter(Boolean));
}
async function historicalPerformance(){
  const result=await db.rpc("marketing_strategy_offer_performance_v1");
  if(result.error){
    console.warn("marketing_strategy_performance_unavailable",String(result.error.message||result.error).slice(0,180));
    return new Map<string,any>();
  }
  const items=Array.isArray(result.data?.items)?result.data.items:[];
  return new Map<string,any>(items.map((item:any)=>[String(item?.commercial_id||""),item]).filter(([key])=>Boolean(key)) as [string,any][]);
}
function scoredInputs(catalog:any[],seasonality:any[],used:Set<string>,performance:Map<string,any>){
  const parts=localDateParts();
  const rules=seasonality.filter(row=>seasonalityApplies(row,parts));
  const maxSeasonality=Math.max(0,...rules.map(row=>Number(row.score_effect||0)));
  const maxStock=Math.max(1,...catalog.map(row=>Number(row.public_available||0)));
  return catalog.map(row=>{
    const history=performance.get(String(row.commercial_id||""))||null;
    const historicalSignal=history?clamp01(history.score_signal):undefined;
    return {
      ...row,
      signals:{
        availability_stock:clamp01(Number(row.public_available||0)/maxStock),
        seasonality:clamp01(maxSeasonality/20),
        audience_fit:0,
        historical_performance:historicalSignal,
        exploration:used.has(String(row.commercial_id||""))?0.25:1,
        operational_quality:(row.public_lot_id&&row.public_name&&row.image_url)?1:0.8,
      },
      strategy_evidence:{
        seasonality_rule_keys:rules.map(rule=>rule.rule_key),
        cold_start_audience:true,
        had_previous_strategy_offer:used.has(String(row.commercial_id||"")),
        historical_performance:history?{
          evidence_level:history.evidence_level||"insufficient",
          delivered:Number(history.delivered||0),
          orders:Number(history.orders||0),
          revenue:Number(history.revenue||0),
          revenue_per_1000_delivered:Number(history.revenue_per_1000_delivered||0),
          score_signal:Number(history.score_signal||0),
        }:null,
      },
    };
  });
}
async function buildRecommendation(preferCarousel:boolean){
  const [catalog,weights,seasonality,used,audience,performance]=await Promise.all([eligibleCatalog(),activeWeights(),activeSeasonality(),usedOfferIds(),audienceSnapshot(),historicalPerformance()]);
  if(!catalog.length)return {ok:false as const,error:"no_eligible_offers"};
  const ranked=rankOffers(scoredInputs(catalog,seasonality,used,performance),weights.weights||DEFAULT_STRATEGY_WEIGHTS_V1,{minimum:75,limit:10});
  if(!ranked.length)return {ok:false as const,error:"no_eligible_offers"};
  const hasHistoricalEvidence=[...performance.values()].some((item:any)=>Number(item?.delivered||0)>=30||Number(item?.orders||0)>=3);
  const coldStart=!hasHistoricalEvidence;
  const format=chooseFormat(ranked,{preferCarousel,coldStart,maxCards:4});
  const selected=format.offer_ids.map((id:string)=>ranked.find((row:any)=>String(row.commercial_id)===id)).filter(Boolean);
  const top=selected[0];
  const topHistory=performance.get(String(top?.commercial_id||""))||null;
  const reasons=[
    "Somente Cestas/Kits ativos, disponíveis e acima do pedido mínimo entram na recomendação.",
    audience.eligible_count>0?`${audience.eligible_count} clientes estão elegíveis antes da revalidação final.`:"Ainda não há clientes elegíveis no preview atual.",
    topHistory&&String(topHistory.evidence_level)!=="insufficient"
      ?`O histórico próprio já influencia esta oferta: ${Number(topHistory.orders||0)} pedidos diretos e R$ ${Number(topHistory.revenue_per_1000_delivered||0).toFixed(2)} por 1.000 entregues.`
      :(used.has(String(top?.commercial_id||""))?"A oferta já apareceu em estratégia anterior, mas ainda precisa de mais evidência.":"A oferta ainda precisa formar histórico próprio e recebe espaço de exploração controlada."),
  ];
  return {ok:true as const,ranked,selected,format:format.format,weights,seasonality,audience,reasons,coldStart,performance_count:performance.size};
}
async function appendEvent(strategyId:string,eventType:string,actorUserId:string,metadata:Record<string,unknown>={}){
  const result=await db.rpc("marketing_strategy_append_event_v1",{p_strategy_id:strategyId,p_event_type:eventType,p_actor_user_id:actorUserId,p_metadata:metadata});
  if(result.error)throw result.error;
  return result.data;
}
async function generateStrategy(body:Record<string,unknown>,adminUserId:string){
  if(!onlyKeys(body,GENERATE_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const accountId=validUuid(body.whatsapp_account_id);if(!accountId)return {status:400,data:{ok:false,error:"invalid_whatsapp_account_id"}};
  const today=localDateParts().date;
  const periodStart=isoDate(body.period_start,today);if(!periodStart)return {status:400,data:{ok:false,error:"invalid_period_start"}};
  const defaultEnd=new Date(`${periodStart}T12:00:00Z`);defaultEnd.setUTCDate(defaultEnd.getUTCDate()+6);
  const periodEnd=isoDate(body.period_end,defaultEnd.toISOString().slice(0,10));if(!periodEnd||periodEnd<periodStart)return {status:400,data:{ok:false,error:"invalid_period_end"}};
  const account=await db.from("whatsapp_accounts").select("id,is_active").eq("id",accountId).eq("is_active",true).maybeSingle();
  if(account.error)throw account.error;if(!account.data)return {status:404,data:{ok:false,error:"account_not_available"}};
  const rec=await buildRecommendation(body.prefer_carousel!==false);if(!rec.ok)return {status:422,data:{ok:false,error:rec.error}};
  const schedule=body.schedule_suggestion===undefined?null:isoDateTime(body.schedule_suggestion);if(body.schedule_suggestion!==undefined&&!schedule)return {status:400,data:{ok:false,error:"invalid_schedule_suggestion"}};
  const copy=fallbackCopy(rec.selected,rec.format);
  const score=Number(rec.selected[0]?.total||0);
  const runInsert={
    whatsapp_account_id:accountId,period_start:periodStart,period_end:periodEnd,status:"draft",objective:"weekly_basket_kit",
    audience_snapshot:rec.audience,offer_format:rec.format,copy_snapshot:copy,schedule_suggestion:schedule,score,
    score_breakdown:rec.selected[0]?.breakdown||{},weight_set_id:rec.weights.id||null,weight_version_snapshot:rec.weights.version,
    weight_snapshot:rec.weights.weights||DEFAULT_STRATEGY_WEIGHTS_V1,evidence:{reasons:rec.reasons,cold_start:rec.coldStart,eligible_offer_count:rec.ranked.length,historical_offer_count:rec.performance_count},
    created_by:adminUserId,metadata:{copy_source:"fallback",regenerated_from:validUuid(body.regenerated_from)||null},
  };
  const inserted=await db.from("marketing_strategy_runs_v1").insert(runInsert).select("*").single();
  if(inserted.error)throw inserted.error;
  const run=inserted.data as any;
  const offerRows=rec.selected.map((row:any,index:number)=>({
    strategy_id:run.id,position:index+1,source_kind:String(row.source_kind||"basket") === "kit"?"kit":"basket",
    commercial_id:row.commercial_id,public_lot_id:row.public_lot_id||null,public_name:row.public_name||row.model_name,
    image_url:row.image_url||null,category_id:row.category_id||null,category_name:row.category_name||null,
    sale_price_snapshot:Number(row.sale_price||0),public_available_snapshot:Number(row.public_available||0),
    availability_reason_snapshot:String(row.availability_reason||"available"),score:Number(row.total||0),
    score_breakdown:row.breakdown||{},reasons:row.reasons||[],evidence:row.strategy_evidence||{},
  }));
  const offers=await db.from("marketing_strategy_offers_v1").insert(offerRows).select("*").order("position");
  if(offers.error)throw offers.error;
  await appendEvent(run.id,"generated",adminUserId,{copy_source:"fallback",offer_count:offerRows.length,audience_mode:"all_eligible",cold_start:rec.coldStart,historical_offer_count:rec.performance_count});
  return {status:201,data:{ok:true,strategy:{...run,offers:offers.data||[]},reasons:rec.reasons}};
}
async function regenerateStrategy(body:Record<string,unknown>,adminUserId:string){
  const previous=validUuid(body.regenerated_from);if(!previous)return {status:400,data:{ok:false,error:"invalid_regenerated_from"}};
  const prev=await db.from("marketing_strategy_runs_v1").select("id,whatsapp_account_id,period_start,period_end,schedule_suggestion").eq("id",previous).maybeSingle();
  if(prev.error)throw prev.error;if(!prev.data)return {status:404,data:{ok:false,error:"strategy_not_found"}};
  const merged={...body,whatsapp_account_id:(prev.data as any).whatsapp_account_id,period_start:(prev.data as any).period_start,period_end:(prev.data as any).period_end,schedule_suggestion:body.schedule_suggestion??(prev.data as any).schedule_suggestion,regenerated_from:previous};
  const result=await generateStrategy(merged,adminUserId);
  if(result.data?.ok===true)await appendEvent(previous,"regenerated",adminUserId,{new_strategy_id:result.data.strategy?.id||null});
  return result;
}
async function strategyDetail(strategyId:string){
  const result=await db.rpc("marketing_strategy_detail_v1",{p_strategy_id:strategyId});
  if(result.error)throw result.error;
  const data=result.data||{ok:false,error:"strategy_not_found"};
  return {status:data?.ok===true?200:404,data};
}
async function overview(){
  const rows=await db.from("marketing_strategy_runs_v1").select("id,whatsapp_account_id,period_start,period_end,status,objective,offer_format,score,schedule_suggestion,created_at,updated_at").order("created_at",{ascending:false}).limit(20);
  if(rows.error)throw rows.error;
  const counts:Record<string,number>={};for(const row of rows.data||[])counts[String((row as any).status)]=(counts[String((row as any).status)]||0)+1;
  return {ok:true,items:rows.data||[],counts};
}
async function calendar(url:URL){
  const start=isoDate(url.searchParams.get("start"),localDateParts().date);if(!start)return {status:400,data:{ok:false,error:"invalid_start"}};
  const end=isoDate(url.searchParams.get("end"),start);if(!end||end<start)return {status:400,data:{ok:false,error:"invalid_end"}};
  const [runs,rules]=await Promise.all([
    db.from("marketing_strategy_runs_v1").select("id,period_start,period_end,status,objective,offer_format,score,schedule_suggestion").lte("period_start",end).gte("period_end",start).order("period_start"),
    db.from("marketing_seasonality_rules_v1").select("id,rule_key,version,name,starts_on,ends_on,month_numbers,day_of_month_start,day_of_month_end,priority,score_effect,operational_closed,is_active").eq("is_active",true).order("priority",{ascending:false}),
  ]);
  if(runs.error)throw runs.error;if(rules.error)throw rules.error;
  return {status:200,data:{ok:true,start,end,strategies:runs.data||[],seasonality:rules.data||[]}};
}
async function opportunities(){
  const rec=await buildRecommendation(true);if(!rec.ok)return {status:200,data:{ok:true,items:[],reason:rec.error}};
  return {status:200,data:{ok:true,items:rec.ranked.slice(0,10).map((row:any)=>({commercial_id:row.commercial_id,public_name:row.public_name,category_name:row.category_name,sale_price:row.sale_price,public_available:row.public_available,score:row.total,score_breakdown:row.breakdown,reasons:row.reasons,evidence:row.strategy_evidence}))}};
}
async function learnings(){
  const result=await db.rpc("marketing_strategy_learnings_v1");
  if(result.error)throw result.error;
  return result.data||{ok:true,evidence_level:"insufficient",sample:{completed_strategies:0},items:[]};
}
async function settings(){
  const [weights,rules]=await Promise.all([activeWeights(),activeSeasonality()]);
  return {ok:true,weights,seasonality:rules};
}
async function editDraft(body:Record<string,unknown>,adminUserId:string){
  if(!onlyKeys(body,EDIT_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const id=validUuid(body.strategy_id),revision=Number(body.expected_revision);if(!id||!Number.isInteger(revision)||revision<1)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const current=await db.from("marketing_strategy_runs_v1").select("id,status,revision").eq("id",id).maybeSingle();if(current.error)throw current.error;
  if(!current.data)return {status:404,data:{ok:false,error:"strategy_not_found"}};
  if(!["draft","awaiting_internal_approval"].includes(String((current.data as any).status)))return {status:409,data:{ok:false,error:"strategy_not_editable"}};
  if(Number((current.data as any).revision)!==revision)return {status:409,data:{ok:false,error:"revision_conflict",revision:(current.data as any).revision}};
  const patch:any={status:"draft",revision:revision+1,updated_at:new Date().toISOString()};
  if(body.objective!==undefined){const objective=clean(body.objective,120);if(!objective)return {status:400,data:{ok:false,error:"invalid_objective"}};patch.objective=objective}
  if(body.copy_snapshot!==undefined){if(!objectLike(body.copy_snapshot))return {status:400,data:{ok:false,error:"invalid_copy_snapshot"}};patch.copy_snapshot=body.copy_snapshot}
  if(body.schedule_suggestion!==undefined){const schedule=body.schedule_suggestion===null?null:isoDateTime(body.schedule_suggestion);if(body.schedule_suggestion!==null&&!schedule)return {status:400,data:{ok:false,error:"invalid_schedule_suggestion"}};patch.schedule_suggestion=schedule}
  if(body.offer_format!==undefined){const format=clean(body.offer_format,20);if(!["single","carousel"].includes(format))return {status:400,data:{ok:false,error:"invalid_offer_format"}};patch.offer_format=format}
  const updated=await db.from("marketing_strategy_runs_v1").update(patch).eq("id",id).eq("revision",revision).select("*").maybeSingle();if(updated.error)throw updated.error;if(!updated.data)return {status:409,data:{ok:false,error:"revision_conflict"}};
  await appendEvent(id,"draft_edited",adminUserId,{previous_status:(current.data as any).status});
  return {status:200,data:{ok:true,strategy:updated.data}};
}
async function transition(body:Record<string,unknown>,adminUserId:string,toStatus:string){
  if(!onlyKeys(body,TRANSITION_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const id=validUuid(body.strategy_id),revision=Number(body.expected_revision);if(!id||!Number.isInteger(revision)||revision<1)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const result=await db.rpc("marketing_strategy_transition_v1",{p_strategy_id:id,p_expected_revision:revision,p_to_status:toStatus,p_actor_user_id:adminUserId,p_reason:clean(body.reason,500)||null});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"transition_failed"};
  return {status:data?.ok===true?200:(data?.error==="revision_conflict"||data?.error==="strategy_invalid_transition"?409:400),data};
}
async function requestInternalApproval(body:Record<string,unknown>,adminUserId:string){return transition(body,adminUserId,"awaiting_internal_approval")}
async function approveInternal(body:Record<string,unknown>,adminUserId:string){return transition(body,adminUserId,"approved_internal")}
async function discardStrategy(body:Record<string,unknown>,adminUserId:string){return transition(body,adminUserId,"discarded")}

async function accountById(accountId:string){
  const result=await db.from("whatsapp_accounts").select("id,waba_id,is_active").eq("id",accountId).eq("is_active",true).maybeSingle();
  if(result.error)throw result.error;
  return result.data||null;
}
async function strategyForTemplate(strategyId:string){
  const result=await db.from("marketing_strategy_runs_v1")
    .select("id,whatsapp_account_id,status,revision,offer_format,copy_snapshot,template_id,metadata")
    .eq("id",strategyId).maybeSingle();
  if(result.error)throw result.error;
  return result.data||null;
}
async function strategyOffers(strategyId:string){
  const result=await db.from("marketing_strategy_offers_v1")
    .select("id,strategy_id,position,commercial_id,public_lot_id,public_name,image_url,sale_price_snapshot,public_available_snapshot,availability_reason_snapshot")
    .eq("strategy_id",strategyId).order("position");
  if(result.error)throw result.error;
  return result.data||[];
}
async function strategyTemplateCandidates(accountId:string){
  const rows=await db.from("whatsapp_templates_v1")
    .select("id,whatsapp_account_id,meta_template_id,name,language,category,status,components,metadata,updated_at")
    .eq("whatsapp_account_id",accountId).eq("category","MARKETING");
  if(rows.error)throw rows.error;
  const items=rows.data||[];
  const ids=items.map((row:any)=>row.id).filter(Boolean);
  if(!ids.length)return items;
  const lifecycle=await db.from("marketing_template_lifecycle_v1").select("template_id,protected,lifecycle_status,last_used_at").in("template_id",ids);
  if(lifecycle.error)throw lifecycle.error;
  const byId=new Map((lifecycle.data||[]).map((row:any)=>[String(row.template_id),row]));
  return items.map((row:any)=>({...row,lifecycle:byId.get(String(row.id))||null}));
}
async function syncTemplateCache(account:any){
  const existing=await db.from("whatsapp_templates_v1").select("name,language,metadata").eq("whatsapp_account_id",account.id);
  if(existing.error)throw existing.error;
  const existingByKey=new Map((existing.data||[]).map((row:any)=>[`${row.name}\u0000${row.language}`,row]));
  const remote=await listTemplatesViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,timeoutMs:12000,maxPages:20});
  if(remote.truncated)throw new Error("meta_templates_pagination_truncated");
  const syncedAt=new Date().toISOString();
  const rows=buildTemplateCacheRows({items:remote.items,account,existingByKey,syncedAt});
  if(rows.length){const saved=await db.from("whatsapp_templates_v1").upsert(rows,{onConflict:"waba_id,name,language"});if(saved.error)throw saved.error}
  return {ok:true,synced:rows.length,last_synced_at:syncedAt};
}
async function localTemplateByName(accountId:string,name:string){
  const result=await db.from("whatsapp_templates_v1")
    .select("id,whatsapp_account_id,meta_template_id,name,language,category,status,components,metadata,updated_at")
    .eq("whatsapp_account_id",accountId).eq("name",name).eq("language","pt_BR").maybeSingle();
  if(result.error)throw result.error;
  return result.data||null;
}
async function tagNewStrategyTemplate(template:any,profile:any,strategyId:string){
  if(!template?.id)return;
  const metadata={...(objectLike(template.metadata)?template.metadata:{}),strategy_profile:profile,strategy_engine:{source:"marketing_strategy_v1",created_for_strategy_id:strategyId}};
  const updated=await db.from("whatsapp_templates_v1").update({metadata,updated_at:new Date().toISOString()}).eq("id",template.id);
  if(updated.error)throw updated.error;
  const lifecycle=await db.from("marketing_template_lifecycle_v1").select("template_id,protected").eq("template_id",template.id).maybeSingle();
  if(lifecycle.error)throw lifecycle.error;
  if(!lifecycle.data){
    const inserted=await db.from("marketing_template_lifecycle_v1").insert({template_id:template.id,protected:false,lifecycle_status:"active",metadata:{source:"marketing_strategy_v1"}});
    if(inserted.error)throw inserted.error;
  }
}
async function updateStrategyTemplateContext(strategy:any,templateId:string|null,submission:Record<string,unknown>){
  const metadata={...(objectLike(strategy?.metadata)?strategy.metadata:{}),template_submission:submission};
  const update:any={metadata,updated_at:new Date().toISOString()};
  if(templateId)update.template_id=templateId;
  const result=await db.from("marketing_strategy_runs_v1").update(update)
    .eq("id",strategy.id).eq("revision",strategy.revision).eq("status",strategy.status).select("id,revision,status,template_id,metadata").maybeSingle();
  if(result.error)throw result.error;
  return result.data||null;
}
function safeMediaUrl(value:unknown){
  let url:URL;try{url=new URL(String(value||""))}catch{return null}
  if(url.protocol!=="https:"||url.username||url.password||!MEDIA_HOSTS.has(url.hostname.toLowerCase()))return null;
  return url;
}
async function fetchStrategyImage(value:unknown){
  const url=safeMediaUrl(value);if(!url)throw new Error("strategy_template_media_not_allowed");
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url.toString(),{method:"GET",redirect:"error",signal:controller.signal,headers:{Accept:"image/jpeg,image/png"}});
    if(!response.ok)throw new Error("strategy_template_media_fetch_failed");
    const mime=String(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
    if(mime!=="image/jpeg"&&mime!=="image/png")throw new Error("strategy_template_media_type_invalid");
    const length=Number(response.headers.get("content-length")||0);if(length>MAX_MEDIA_BYTES)throw new Error("strategy_template_media_size_invalid");
    const bytes=new Uint8Array(await response.arrayBuffer());if(!bytes.byteLength||bytes.byteLength>MAX_MEDIA_BYTES)throw new Error("strategy_template_media_size_invalid");
    const name=`strategy-${crypto.randomUUID()}.${mime==="image/png"?"png":"jpg"}`;
    return {bytes,mime,name};
  }finally{clearTimeout(timer)}
}
async function uploadCarouselSamples(offers:any[]){
  if(!META_APP_ID)throw new Error("meta_app_id_not_configured");
  const handles=[];
  for(const offer of offers){
    const file=await fetchStrategyImage(offer?.image_url);
    const uploaded=await uploadTemplateMediaSampleViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,appId:META_APP_ID,graphVersion:META_WHATSAPP_GRAPH_VERSION,fileName:file.name,mimeType:file.mime,bytes:file.bytes});
    handles.push(uploaded.handle);
  }
  return handles;
}
async function submitTemplate(body:Record<string,unknown>,adminUserId:string){
  if(!onlyKeys(body,TEMPLATE_GATE_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const id=validUuid(body.strategy_id),expectedRevision=Number(body.expected_revision);
  if(!id||!Number.isInteger(expectedRevision)||expectedRevision<1)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const strategy=await strategyForTemplate(id);if(!strategy)return {status:404,data:{ok:false,error:"strategy_not_found"}};
  if(Number(strategy.revision)!==expectedRevision)return {status:409,data:{ok:false,error:"revision_conflict",revision:strategy.revision,status_current:strategy.status}};
  if(String(strategy.status)!=="approved_internal")return {status:409,data:{ok:false,error:"strategy_not_approved_internal",status_current:strategy.status}};
  const offers=await strategyOffers(id);if(!offers.length)return {status:409,data:{ok:false,error:"strategy_offers_missing"}};
  const candidates=await strategyTemplateCandidates(strategy.whatsapp_account_id);
  const strategyContext={...strategy,offers};
  const reusable=findReusableTemplate(strategyContext,candidates);
  if(reusable){
    const linked=await updateStrategyTemplateContext(strategy,reusable.id,{mode:"reused",template_name:reusable.name,template_status:"APPROVED",linked_at:new Date().toISOString()});
    if(!linked)return {status:409,data:{ok:false,error:"revision_conflict"}};
    const moved=await transition({strategy_id:id,expected_revision:expectedRevision,reason:"approved_template_reused"},adminUserId,"meta_approved");
    if(moved.data?.ok===true)await appendEvent(id,"template_reused",adminUserId,{template_id:reusable.id,template_name:reusable.name,protected:reusable?.lifecycle?.protected===true});
    return {status:moved.status,data:{...moved.data,reused:true,template_id:reusable.id,template_name:reusable.name}};
  }
  if(!metaReady())return {status:503,data:{ok:false,error:"meta_transport_not_configured"}};
  const account=await accountById(strategy.whatsapp_account_id);if(!account)return {status:404,data:{ok:false,error:"account_not_available"}};
  const profile=buildStrategyTemplateProfile(strategyContext,offers);
  const name=strategyTemplateName(strategyContext,offers);
  let created:any;
  try{
    if(String(strategy.offer_format)==="carousel"){
      const mediaHandles=await uploadCarouselSamples(offers);
      const draft=buildStrategyTemplateDraft(strategyContext,offers,{name,mediaHandles});
      created=await createCarouselTemplateViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,draft});
    }else{
      const draft=buildStrategyTemplateDraft(strategyContext,offers,{name});
      created=await createTemplateViaMeta({accessToken:META_WHATSAPP_ACCESS_TOKEN,wabaId:account.waba_id,graphVersion:META_WHATSAPP_GRAPH_VERSION,template:draft,timeoutMs:15000});
    }
  }catch(error){
    const code=error instanceof MetaTemplatesError||error instanceof MetaCarouselError?error.code:clean(error instanceof Error?error.message:String(error),180)||"template_submission_failed";
    await appendEvent(id,"template_submission_failed",adminUserId,{error:code}).catch(()=>null);
    const retryable=error instanceof MetaTemplatesError||error instanceof MetaCarouselError?error.retryable===true:false;
    return {status:502,data:{ok:false,error:code,retryable}};
  }
  const remoteId=clean(created?.payload?.id,80)||null;
  const remoteStatus=clean(created?.payload?.status,40).toUpperCase()||"PENDING";
  let sync:any=null;try{sync=await syncTemplateCache(account)}catch{sync=null}
  const localTemplate=sync?.ok===true?await localTemplateByName(account.id,name):null;
  if(localTemplate)await tagNewStrategyTemplate(localTemplate,profile,id);
  const linked=await updateStrategyTemplateContext(strategy,localTemplate?.id||null,{mode:"created",template_name:name,meta_template_id:remoteId,template_status:remoteStatus,sync_pending:!localTemplate,submitted_at:new Date().toISOString(),profile});
  if(!linked)return {status:409,data:{ok:false,error:"revision_conflict",remote_created:true,meta_template_id:remoteId}};
  await appendEvent(id,"template_submitted_meta",adminUserId,{template_id:localTemplate?.id||null,template_name:name,meta_template_id:remoteId,status:remoteStatus,sync_pending:!localTemplate});
  if(remoteStatus==="APPROVED"&&localTemplate){
    const moved=await transition({strategy_id:id,expected_revision:expectedRevision,reason:"meta_approved_on_submission"},adminUserId,"meta_approved");
    return {status:moved.status,data:{...moved.data,reused:false,template_id:localTemplate.id,template_name:name,meta_status:remoteStatus}};
  }
  const pending=await transition({strategy_id:id,expected_revision:expectedRevision,reason:"template_submitted_meta"},adminUserId,"awaiting_meta");
  if(pending.data?.ok!==true)return pending;
  if(remoteStatus==="REJECTED"){
    const rejected=await transition({strategy_id:id,expected_revision:Number(pending.data.revision),reason:"meta_rejected_on_submission"},adminUserId,"meta_rejected");
    if(rejected.data?.ok===true)await appendEvent(id,"template_meta_rejected",adminUserId,{template_id:localTemplate?.id||null,template_name:name});
    return {status:rejected.status,data:{...rejected.data,reused:false,template_id:localTemplate?.id||null,template_name:name,meta_status:remoteStatus}};
  }
  return {status:200,data:{...pending.data,reused:false,template_id:localTemplate?.id||null,template_name:name,meta_status:remoteStatus,sync_pending:!localTemplate}};
}
async function refreshTemplateStatus(body:Record<string,unknown>,adminUserId:string){
  if(!onlyKeys(body,TEMPLATE_GATE_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const id=validUuid(body.strategy_id),expectedRevision=Number(body.expected_revision);
  if(!id||!Number.isInteger(expectedRevision)||expectedRevision<1)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const strategy=await strategyForTemplate(id);if(!strategy)return {status:404,data:{ok:false,error:"strategy_not_found"}};
  if(Number(strategy.revision)!==expectedRevision)return {status:409,data:{ok:false,error:"revision_conflict",revision:strategy.revision,status_current:strategy.status}};
  if(String(strategy.status)!=="awaiting_meta")return {status:409,data:{ok:false,error:"strategy_not_awaiting_meta",status_current:strategy.status}};
  let template:any=null;
  if(strategy.template_id){
    const q=await db.from("whatsapp_templates_v1").select("id,name,status,metadata").eq("id",strategy.template_id).maybeSingle();if(q.error)throw q.error;template=q.data;
  }else{
    const name=clean((strategy.metadata as any)?.template_submission?.template_name,512);
    if(name)template=await localTemplateByName(strategy.whatsapp_account_id,name);
  }
  if(!template)return {status:409,data:{ok:false,error:"template_cache_pending"}};
  const status=clean(template.status,40).toUpperCase();
  if(status==="APPROVED"){
    if(!strategy.template_id){const linked=await updateStrategyTemplateContext(strategy,template.id,{...(objectLike((strategy.metadata as any)?.template_submission)?(strategy.metadata as any).template_submission:{}),template_status:status,sync_pending:false});if(!linked)return {status:409,data:{ok:false,error:"revision_conflict"}}}
    const moved=await transition({strategy_id:id,expected_revision:expectedRevision,reason:"meta_template_approved"},adminUserId,"meta_approved");
    if(moved.data?.ok===true)await appendEvent(id,"template_meta_approved",adminUserId,{template_id:template.id,template_name:template.name});
    return moved;
  }
  if(status==="REJECTED"){
    const moved=await transition({strategy_id:id,expected_revision:expectedRevision,reason:"meta_template_rejected"},adminUserId,"meta_rejected");
    if(moved.data?.ok===true)await appendEvent(id,"template_meta_rejected",adminUserId,{template_id:template.id,template_name:template.name,rejected_reason:template?.metadata?.rejected_reason||null});
    return moved;
  }
  return {status:200,data:{ok:true,strategy_id:id,revision:expectedRevision,status:"awaiting_meta",template_status:status||"PENDING"}};
}

function validateWeights(value:unknown){
  if(!objectLike(value))return null;
  const keys=Object.keys(value);if(keys.length!==WEIGHT_KEYS.length||WEIGHT_KEYS.some(key=>!keys.includes(key)))return null;
  const normalized:Record<string,number>={};let total=0;
  for(const key of WEIGHT_KEYS){const n=Number((value as any)[key]);if(!Number.isFinite(n)||n<0||n>100)return null;normalized[key]=n;total+=n}
  return Math.abs(total-100)<0.0001?normalized:null;
}
async function saveWeights(body:Record<string,unknown>,adminUserId:string){
  if(!onlyKeys(body,WEIGHT_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const weights=validateWeights(body.weights);if(!weights)return {status:400,data:{ok:false,error:"invalid_weights"}};
  const latest=await db.from("marketing_strategy_weight_sets_v1").select("version,created_at").order("created_at",{ascending:false}).limit(1).maybeSingle();if(latest.error)throw latest.error;
  const version=`v-${new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14)}`;
  const disabled=await db.from("marketing_strategy_weight_sets_v1").update({is_active:false}).eq("is_active",true);if(disabled.error)throw disabled.error;
  const inserted=await db.from("marketing_strategy_weight_sets_v1").insert({version,weights,is_active:true,created_by:adminUserId,metadata:{version_note:clean(body.version_note,500)||null,previous_version:(latest.data as any)?.version||null}}).select("*").single();
  if(inserted.error)throw inserted.error;
  return {status:201,data:{ok:true,weights:inserted.data}};
}
async function saveSeasonality(body:Record<string,unknown>,adminUserId:string){
  if(!onlyKeys(body,SEASONALITY_FIELDS)||hasForbiddenField(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const ruleKey=clean(body.rule_key,100),name=clean(body.name,160);if(!ruleKey||!name)return {status:400,data:{ok:false,error:"invalid_rule"}};
  const previous=await db.from("marketing_seasonality_rules_v1").select("version").eq("rule_key",ruleKey).order("version",{ascending:false}).limit(1).maybeSingle();if(previous.error)throw previous.error;
  const version=Number((previous.data as any)?.version||0)+1;
  const startsOn=body.starts_on===undefined||body.starts_on===null?null:isoDate(body.starts_on,"");
  const endsOn=body.ends_on===undefined||body.ends_on===null?null:isoDate(body.ends_on,"");
  if((body.starts_on!=null&&!startsOn)||(body.ends_on!=null&&!endsOn)||(startsOn&&endsOn&&endsOn<startsOn))return {status:400,data:{ok:false,error:"invalid_date_range"}};
  const months=Array.isArray(body.month_numbers)?[...new Set(body.month_numbers.map(Number))]:[];
  if(months.some(n=>!Number.isInteger(n)||n<1||n>12))return {status:400,data:{ok:false,error:"invalid_month_numbers"}};
  const dayStart=body.day_of_month_start==null?null:Number(body.day_of_month_start),dayEnd=body.day_of_month_end==null?null:Number(body.day_of_month_end);
  if((dayStart!==null&&(!Number.isInteger(dayStart)||dayStart<1||dayStart>31))||(dayEnd!==null&&(!Number.isInteger(dayEnd)||dayEnd<1||dayEnd>31)))return {status:400,data:{ok:false,error:"invalid_day_range"}};
  const priority=Number(body.priority??0),scoreEffect=Number(body.score_effect??0);if(!Number.isInteger(priority)||!Number.isFinite(scoreEffect)||scoreEffect< -100||scoreEffect>100)return {status:400,data:{ok:false,error:"invalid_score_rule"}};
  const deactivated=await db.from("marketing_seasonality_rules_v1").update({is_active:false,updated_at:new Date().toISOString()}).eq("rule_key",ruleKey).eq("is_active",true);if(deactivated.error)throw deactivated.error;
  const inserted=await db.from("marketing_seasonality_rules_v1").insert({rule_key:ruleKey,version,name,starts_on:startsOn,ends_on:endsOn,month_numbers:months,day_of_month_start:dayStart,day_of_month_end:dayEnd,priority,score_effect:scoreEffect,operational_closed:body.operational_closed===true,is_active:true,created_by:adminUserId,metadata:objectLike(body.metadata)?body.metadata:{}}).select("*").single();
  if(inserted.error)throw inserted.error;
  return {status:201,data:{ok:true,seasonality:inserted.data}};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET"&&req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
  try{
    const url=new URL(req.url),action=clean(url.searchParams.get("action"),60).toLowerCase();
    if(req.method==="GET"){
      if(!GET_ACTIONS.has(action))return json(req,{ok:false,error:"action_not_allowed"},404);
      if(action==="overview")return json(req,await overview());
      if(action==="detail"){const id=validUuid(url.searchParams.get("strategy_id"));if(!id)return json(req,{ok:false,error:"invalid_strategy_id"},400);const result=await strategyDetail(id);return json(req,result.data,result.status)}
      if(action==="calendar"){const result=await calendar(url);return json(req,result.data,result.status)}
      if(action==="opportunities"){const result=await opportunities();return json(req,result.data,result.status)}
      if(action==="learnings")return json(req,await learnings());
      if(action==="settings")return json(req,await settings());
    }
    if(!POST_ACTIONS.has(action))return json(req,{ok:false,error:"action_not_allowed"},404);
    const parsed=await readJsonBody(req);if(!parsed.ok)return json(req,{ok:false,error:parsed.error},parsed.error==="payload_too_large"?413:400);
    let result:{status:number,data:any};
    if(action==="generate")result=await generateStrategy(parsed.body,auth.user_id);
    else if(action==="regenerate")result=await regenerateStrategy(parsed.body,auth.user_id);
    else if(action==="edit_draft")result=await editDraft(parsed.body,auth.user_id);
    else if(action==="request_internal_approval")result=await requestInternalApproval(parsed.body,auth.user_id);
    else if(action==="approve_internal")result=await approveInternal(parsed.body,auth.user_id);
    else if(action==="discard")result=await discardStrategy(parsed.body,auth.user_id);
    else if(action==="submit_template")result=await submitTemplate(parsed.body,auth.user_id);
    else if(action==="refresh_template_status")result=await refreshTemplateStatus(parsed.body,auth.user_id);
    else if(action==="save_weights")result=await saveWeights(parsed.body,auth.user_id);
    else result=await saveSeasonality(parsed.body,auth.user_id);
    return json(req,result.data,result.status);
  }catch(error){
    console.error("admin_marketing_strategy_error",error instanceof Error?error.message:String(error));
    return json(req,{ok:false,error:"internal_error"},500);
  }
});