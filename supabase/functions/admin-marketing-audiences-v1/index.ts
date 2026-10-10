import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const FORBIDDEN_FIELDS=new Set(["waba_id","phone_number_id","to_phone_e164","template_id","template_name","outbox_id","send","dispatch","service_role","service_key"]);
const PREVIEW_FIELDS=new Set(["filters","limit","offset"]);
const CONSENT_FIELDS=new Set(["customer_id","decision","source_ref","source_event_key","consent_text_version","consent_text_snapshot","metadata"]);

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const validUuid=(v:unknown)=>{const s=String(v??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const clean=(v:unknown,max=300)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const objectLike=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);

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

function onlyKeys(body:Record<string,unknown>,allowed:Set<string>){
  return Object.keys(body).every(key=>allowed.has(key));
}

async function readJsonBody(req:Request){
  const raw=await req.text();
  if(raw.length>24000)return {ok:false as const,error:"payload_too_large"};
  if(!raw.trim())return {ok:true as const,body:{}};
  try{
    const parsed=JSON.parse(raw);
    if(!objectLike(parsed))return {ok:false as const,error:"invalid_json_body"};
    return {ok:true as const,body:parsed as Record<string,unknown>};
  }catch{return {ok:false as const,error:"invalid_json_body"}}
}

function sanitizePreview(data:any){
  const items=Array.isArray(data?.items)?data.items.map((row:any)=>({
    customer_id:row?.customer_id??null,
    name:row?.name??null,
    masked_phone:row?.masked_phone??null,
    consent_state:row?.consent_state??"never_consented",
    eligible:row?.eligible===true,
    exclusion_reasons:Array.isArray(row?.exclusion_reasons)?row.exclusion_reasons:[],
    city:row?.city??null,
    neighborhood:row?.neighborhood??null,
    last_purchase_at:row?.last_purchase_at??null,
    order_count:Number(row?.order_count||0),
    lifetime_value:row?.lifetime_value??0,
  })):[];
  return {
    ok:data?.ok===true,
    error:data?.error??undefined,
    filter:data?.filter??undefined,
    found_count:Number(data?.found_count||0),
    eligible_count:Number(data?.eligible_count||0),
    excluded_count:Number(data?.excluded_count||0),
    exclusion_reasons:objectLike(data?.exclusion_reasons)?data.exclusion_reasons:{},
    limit:Number(data?.limit||items.length||0),
    offset:Number(data?.offset||0),
    items,
  };
}

async function overview(){
  const states=await db.from("marketing_customer_consent_current_v1").select("consent_state");
  if(states.error)throw states.error;
  const counts={total:0,opt_in:0,opt_out:0,never_consented:0} as Record<string,number>;
  for(const row of states.data||[]){
    const state=String((row as any)?.consent_state||"never_consented");
    counts.total+=1;
    if(state==="opt_in"||state==="opt_out"||state==="never_consented")counts[state]=(counts[state]||0)+1;
  }
  const latest=await db.from("marketing_consent_events_v1").select("occurred_at").order("occurred_at",{ascending:false}).limit(1).maybeSingle();
  if(latest.error)throw latest.error;
  return {ok:true,counts,last_event_at:(latest.data as any)?.occurred_at||null};
}

async function preview(body:Record<string,unknown>){
  if(!onlyKeys(body,PREVIEW_FIELDS))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  if(hasForbiddenField(body))return {status:400,data:{ok:false,error:"transport_fields_not_allowed"}};
  const filters=body.filters??{};
  if(!objectLike(filters))return {status:400,data:{ok:false,error:"invalid_filters"}};
  if(JSON.stringify(filters).length>16000)return {status:413,data:{ok:false,error:"filters_too_large"}};
  const limit=body.limit===undefined?50:Number(body.limit);
  const offset=body.offset===undefined?0:Number(body.offset);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0){
    return {status:400,data:{ok:false,error:"invalid_pagination"}};
  }
  const result=await db.rpc("marketing_preview_audience_v1",{p_filters:filters,p_limit:limit,p_offset:offset});
  if(result.error)throw result.error;
  const data=sanitizePreview(result.data||{});
  const status=data.ok?200:(data.error==="unsupported_filter"||data.error==="invalid_filter_value"||data.error==="invalid_filters"?400:422);
  return {status,data};
}

async function consentHistory(customerId:string){
  const customer=await db.from("customers").select("id,name,is_active").eq("id",customerId).maybeSingle();
  if(customer.error)throw customer.error;
  if(!customer.data)return {status:404,data:{ok:false,error:"customer_not_found"}};

  const current=await db.from("marketing_customer_consent_current_v1")
    .select("customer_id,phone_e164,consent_state,marketing_opt_in,marketing_consent_updated_at,latest_event_id,latest_source,latest_event_at")
    .eq("customer_id",customerId).maybeSingle();
  if(current.error)throw current.error;

  const history=await db.from("marketing_consent_events_v1")
    .select("id,customer_id,phone_e164,decision,source,source_ref,source_event_key,consent_text_version,consent_text_snapshot,occurred_at,recorded_by,metadata,created_at")
    .eq("customer_id",customerId).order("occurred_at",{ascending:false}).order("created_at",{ascending:false}).limit(100);
  if(history.error)throw history.error;

  return {status:200,data:{
    ok:true,
    customer:{...customer.data,phone_e164:(current.data as any)?.phone_e164||null,consent_state:(current.data as any)?.consent_state||"never_consented",marketing_opt_in:(current.data as any)?.marketing_opt_in===true,marketing_consent_updated_at:(current.data as any)?.marketing_consent_updated_at||null},
    items:history.data||[],
  }};
}

async function recordConsent(body:Record<string,unknown>,adminUserId:string){
  if(!onlyKeys(body,CONSENT_FIELDS))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  if(hasForbiddenField(body))return {status:400,data:{ok:false,error:"transport_fields_not_allowed"}};
  const customerId=validUuid(body.customer_id);if(!customerId)return {status:400,data:{ok:false,error:"invalid_customer_id"}};
  const decision=clean(body.decision,20).toLowerCase();
  if(decision!=="opt_in"&&decision!=="opt_out")return {status:400,data:{ok:false,error:"invalid_decision"}};

  const consentTextVersion=clean(body.consent_text_version,120)||null;
  const consentTextSnapshot=String(body.consent_text_snapshot??"").trim().slice(0,4000)||null;
  const sourceRef=clean(body.source_ref,200)||null;
  const sourceEventKey=clean(body.source_event_key,180)||null;
  const metadata=objectLike(body.metadata)?{...body.metadata}:{};
  if(JSON.stringify(metadata).length>6000)return {status:413,data:{ok:false,error:"payload_too_large"}};

  if(decision==="opt_in"&&(!consentTextVersion||!consentTextSnapshot)){
    return {status:400,data:{ok:false,error:"opt_in_evidence_required",required:["consent_text_version","consent_text_snapshot"]}};
  }
  if(decision==="opt_out"){
    const reason=clean((metadata as any).reason_code??(metadata as any).reason,180);
    if(!reason)return {status:400,data:{ok:false,error:"opt_out_reason_required",required:["metadata.reason_code"]}};
    (metadata as any).reason_code=reason;
  }

  const result=await db.rpc("marketing_record_consent_v1",{
    p_customer_id:customerId,
    p_decision:decision,
    p_source:"admin_marketing",
    p_source_ref:sourceRef,
    p_source_event_key:sourceEventKey,
    p_consent_text_version:consentTextVersion,
    p_consent_text_snapshot:consentTextSnapshot,
    p_occurred_at:new Date().toISOString(),
    p_recorded_by:`admin:${adminUserId}`,
    p_metadata:metadata,
  });
  if(result.error)throw result.error;
  const data=result.data||{ok:false,error:"record_consent_failed"};
  return {status:data?.ok===true?200:400,data};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET"&&req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);

  const auth=await adminAuth(req);
  if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);

  try{
    const url=new URL(req.url);
    const action=clean(url.searchParams.get("action"),60).toLowerCase();

    if(req.method==="GET"){
      if(action==="overview")return json(req,await overview());
      if(action==="consent_history"){
        const customerId=validUuid(url.searchParams.get("customer_id"));
        if(!customerId)return json(req,{ok:false,error:"invalid_customer_id"},400);
        const result=await consentHistory(customerId);
        return json(req,result.data,result.status);
      }
      return json(req,{ok:false,error:"action_not_allowed"},404);
    }

    const parsed=await readJsonBody(req);
    if(!parsed.ok)return json(req,{ok:false,error:parsed.error},parsed.error==="payload_too_large"?413:400);
    if(action==="preview"){
      const result=await preview(parsed.body);
      return json(req,result.data,result.status);
    }
    if(action==="record_consent"){
      const result=await recordConsent(parsed.body,auth.user_id);
      return json(req,result.data,result.status);
    }
    return json(req,{ok:false,error:"action_not_allowed"},404);
  }catch(error){
    console.error("admin_marketing_audiences_error",error instanceof Error?error.message:String(error));
    return json(req,{ok:false,error:"internal_error"},500);
  }
});
