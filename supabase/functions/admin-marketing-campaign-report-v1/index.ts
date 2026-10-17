import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const PAGE_SIZE=1000;
const IN_CHUNK=100;

const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const validUuid=(value:unknown)=>{const s=String(value??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const maskPhone=(value:unknown)=>{const digits=String(value??"").replace(/\D/g,"");if(digits.length<4)return "—";return `${"*".repeat(Math.max(4,digits.length-4))}${digits.slice(-4)}`};
const statusRank:Record<string,number>={accepted:1,sent:2,delivered:3,read:4,failed:5};

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};return {ok:true as const,status:200,user_id:user.data.user.id};
}
function chunks<T>(items:T[],size=IN_CHUNK){const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out}
async function allDispatches(campaignId:string){
  const rows:any[]=[];for(let from=0;;from+=PAGE_SIZE){const result=await db.from("marketing_campaign_dispatches_v1").select("id,customer_id,phone_e164,status,provider_message_id,last_error,skip_reason,updated_at").eq("campaign_id",campaignId).order("created_at",{ascending:true}).range(from,from+PAGE_SIZE-1);if(result.error)throw result.error;rows.push(...(result.data||[]));if((result.data||[]).length<PAGE_SIZE)break}return rows;
}
async function customerMap(ids:string[]){const map=new Map<string,any>();for(const part of chunks([...new Set(ids.filter(Boolean))])){const result=await db.from("customers").select("id,name,primary_whatsapp_e164").in("id",part);if(result.error)throw result.error;for(const row of result.data||[])map.set(String(row.id),row)}return map}
async function messageMap(ids:string[]){const map=new Map<string,any>();for(const part of chunks([...new Set(ids.filter(Boolean))])){const result=await db.from("whatsapp_messages_v1").select("provider_message_id,status_current,created_at,sent_at").eq("provider","meta").in("provider_message_id",part);if(result.error)throw result.error;for(const row of result.data||[])map.set(String(row.provider_message_id),row)}return map}
async function eventMap(ids:string[]){const map=new Map<string,any[]>();for(const part of chunks([...new Set(ids.filter(Boolean))])){const result=await db.from("whatsapp_message_status_events_v1").select("provider_message_id,status,occurred_at,received_at").eq("provider","meta").in("provider_message_id",part).order("occurred_at",{ascending:true});if(result.error)throw result.error;for(const row of result.data||[]){const key=String(row.provider_message_id);const list=map.get(key)||[];list.push(row);map.set(key,list)}}return map}
function finalStatus(dispatch:any,message:any,events:any[]){
  const candidates=[String(dispatch?.status||"").toLowerCase(),String(message?.status_current||"").toLowerCase(),...events.map(event=>String(event?.status||"").toLowerCase())].filter(Boolean);
  if(candidates.includes("read"))return "read";if(candidates.includes("delivered"))return "delivered";if(candidates.includes("sent"))return "sent";if(candidates.includes("failed")||String(dispatch?.status||"").toLowerCase()==="failed")return "failed";if(candidates.includes("accepted"))return "accepted";
  const known=candidates.sort((a,b)=>(statusRank[b]||0)-(statusRank[a]||0))[0];return known||String(dispatch?.status||"pending");
}
function latestAt(dispatch:any,message:any,events:any[]){const values=[dispatch?.updated_at,message?.sent_at,message?.created_at,...events.flatMap(event=>[event?.occurred_at,event?.received_at])].filter(Boolean).map(value=>new Date(value).getTime()).filter(Number.isFinite);return values.length?new Date(Math.max(...values)).toISOString():null}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});if(req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
  try{
    const campaignId=validUuid(new URL(req.url).searchParams.get("campaign_id"));if(!campaignId)return json(req,{ok:false,error:"invalid_campaign_id"},400);
    const campaign=await db.from("marketing_campaigns_v1").select("id,name,status,template_name_snapshot,scheduled_for,started_at,completed_at,created_at").eq("id",campaignId).maybeSingle();if(campaign.error)throw campaign.error;if(!campaign.data)return json(req,{ok:false,error:"campaign_not_found"},404);
    const dispatches=await allDispatches(campaignId),customerIds=dispatches.map(row=>String(row.customer_id||"")).filter(Boolean),providerIds=dispatches.map(row=>String(row.provider_message_id||"")).filter(Boolean);
    const [customers,messages,events]=await Promise.all([customerMap(customerIds),messageMap(providerIds),eventMap(providerIds)]);
    const items=dispatches.map(dispatch=>{const customer=customers.get(String(dispatch.customer_id||""));const key=String(dispatch.provider_message_id||"");const message=messages.get(key);const eventRows=events.get(key)||[];return {name:String(customer?.name||"Cliente"),masked_phone:maskPhone(customer?.primary_whatsapp_e164||dispatch.phone_e164),status:finalStatus(dispatch,message,eventRows),updated_at:latestAt(dispatch,message,eventRows),error:dispatch.last_error||dispatch.skip_reason||null}});
    const total=items.length,read=items.filter(item=>item.status==="read").length,delivered=items.filter(item=>item.status==="read"||item.status==="delivered").length,sent=items.filter(item=>["sent","delivered","read"].includes(item.status)).length,failed=items.filter(item=>item.status==="failed").length;
    const delivery_rate=sent?Number(((delivered/sent)*100).toFixed(1)):0,read_rate=delivered?Number(((read/delivered)*100).toFixed(1)):0;
    return json(req,{ok:true,campaign:{name:campaign.data.name,status:campaign.data.status,template_name:campaign.data.template_name_snapshot,scheduled_for:campaign.data.scheduled_for,started_at:campaign.data.started_at,completed_at:campaign.data.completed_at,created_at:campaign.data.created_at},summary:{total,sent,delivered,read,failed,delivery_rate,read_rate},items},200);
  }catch(error){console.error("admin_marketing_campaign_report_error",error instanceof Error?error.message:String(error));return json(req,{ok:false,error:"internal_error"},500)}
});
