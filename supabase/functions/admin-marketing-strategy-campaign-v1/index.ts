import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const MAX_BODY_BYTES=8000;
const ACTIONS=new Set(["materialize_campaign","approve_send","schedule_send","start_send"]);
const BASIC_FIELDS=new Set(["strategy_id","expected_revision"]);
const SCHEDULE_FIELDS=new Set(["strategy_id","expected_revision","scheduled_for"]);
const FORBIDDEN_FIELDS=new Set(["waba_id","phone_number_id","to_phone_e164","destination_phone","access_token","service_role","service_key","outbox_id","campaigns_enabled","ana_enabled","runtime_mode","worker_url"]);

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const validUuid=(value:unknown)=>{const s=String(value??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const objectLike=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const onlyKeys=(body:Record<string,unknown>,allowed:Set<string>)=>Object.keys(body).every(key=>allowed.has(key));
const hasForbidden=(body:Record<string,unknown>)=>Object.keys(body).some(key=>FORBIDDEN_FIELDS.has(String(key).toLowerCase()));

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
async function readBody(req:Request){
  const raw=await req.text();
  if(raw.length>MAX_BODY_BYTES)return {ok:false as const,error:"payload_too_large"};
  if(!raw.trim())return {ok:true as const,body:{}};
  try{const parsed=JSON.parse(raw);if(!objectLike(parsed))return {ok:false as const,error:"invalid_json_body"};return {ok:true as const,body:parsed as Record<string,unknown>}}
  catch{return {ok:false as const,error:"invalid_json_body"}}
}
function statusFor(data:any){
  if(data?.ok===true)return 200;
  const error=String(data?.error||"");
  if(error==="strategy_not_found"||error==="strategy_campaign_not_found")return 404;
  if(["revision_conflict","strategy_invalid_transition","strategy_material_change","strategy_template_required","strategy_campaign_required","template_not_sendable","campaign_invalid_transition","snapshot_stale","campaigns_disabled"].includes(error))return 409;
  if(error==="account_not_available")return 422;
  return 400;
}
function normalizedDateTime(value:unknown){
  const raw=String(value??"").trim();if(!raw)return null;
  const ms=Date.parse(raw);return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
function baseInput(body:Record<string,unknown>){
  const strategyId=validUuid(body.strategy_id),revision=Number(body.expected_revision);
  if(!strategyId||!Number.isInteger(revision)||revision<1)return null;
  return {strategyId,revision};
}
async function materialize(body:Record<string,unknown>,actor:string){
  if(!onlyKeys(body,BASIC_FIELDS)||hasForbidden(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const input=baseInput(body);if(!input)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const result=await db.rpc("marketing_strategy_materialize_campaign_v1",{p_strategy_id:input.strategyId,p_expected_revision:input.revision,p_actor_user_id:actor});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"materialize_failed"};return {status:statusFor(data),data};
}
async function approveSend(body:Record<string,unknown>,actor:string){
  if(!onlyKeys(body,BASIC_FIELDS)||hasForbidden(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const input=baseInput(body);if(!input)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const result=await db.rpc("marketing_strategy_approve_send_v1",{p_strategy_id:input.strategyId,p_expected_revision:input.revision,p_actor_user_id:actor});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"approve_send_failed"};return {status:statusFor(data),data};
}
async function scheduleSend(body:Record<string,unknown>,actor:string,startNow=false){
  if(!onlyKeys(body,startNow?BASIC_FIELDS:SCHEDULE_FIELDS)||hasForbidden(body))return {status:400,data:{ok:false,error:"fields_not_allowed"}};
  const input=baseInput(body);if(!input)return {status:400,data:{ok:false,error:"invalid_payload"}};
  const scheduledFor=startNow?new Date().toISOString():normalizedDateTime(body.scheduled_for);
  if(!scheduledFor)return {status:400,data:{ok:false,error:"invalid_scheduled_for"}};
  const result=await db.rpc("marketing_strategy_schedule_send_v1",{p_strategy_id:input.strategyId,p_expected_revision:input.revision,p_scheduled_for:scheduledFor,p_actor_user_id:actor});
  if(result.error)throw result.error;const data=result.data||{ok:false,error:"schedule_send_failed"};return {status:statusFor(data),data};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
  const action=String(new URL(req.url).searchParams.get("action")||"").trim().toLowerCase();
  if(!ACTIONS.has(action))return json(req,{ok:false,error:"action_not_allowed"},404);
  const parsed=await readBody(req);if(!parsed.ok)return json(req,{ok:false,error:parsed.error},parsed.error==="payload_too_large"?413:400);
  try{
    let result:{status:number,data:any};
    if(action==="materialize_campaign")result=await materialize(parsed.body,auth.user_id);
    else if(action==="approve_send")result=await approveSend(parsed.body,auth.user_id);
    else if(action==="schedule_send")result=await scheduleSend(parsed.body,auth.user_id,false);
    else result=await scheduleSend(parsed.body,auth.user_id,true);
    return json(req,result.data,result.status);
  }catch(error){
    console.error("admin_marketing_strategy_campaign_error",error instanceof Error?error.message:String(error));
    return json(req,{ok:false,error:"internal_error"},500);
  }
});
