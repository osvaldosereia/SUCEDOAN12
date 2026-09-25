import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
const MAX_BODY_BYTES=256*1024;

const clean=(v:any,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const digits=(v:any,n=20)=>String(v??"").replace(/\D+/g,"").slice(0,n);
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});

async function sha256(value:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function ctEqual(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
const SECRET_KEYS=new Set([
  "token","access_token","refresh_token","authorization","apikey","api_key","secret",
  "client_secret","password","senha","key","webhook_key","signature","cookie","set-cookie"
]);
function redact(value:any,depth=0):any{
  if(depth>8)return "[depth_limit]";
  if(value===null||value===undefined)return value;
  if(Array.isArray(value))return value.slice(0,200).map(x=>redact(x,depth+1));
  if(typeof value==="object"){
    const out:any={};let count=0;
    for(const [k,v] of Object.entries(value)){
      if(count++>=200){out.__truncated__=true;break}
      const key=String(k).toLowerCase().replace(/[^a-z0-9_\-]/g,"");
      out[k]=SECRET_KEYS.has(key)||key.includes("password")||key.includes("secret")||key.includes("authorization")
        ? "[redacted]"
        : redact(v,depth+1);
    }
    return out;
  }
  if(typeof value==="string")return value.slice(0,8000);
  return value;
}
function findFirst(root:any,names:string[],depth=0):any{
  if(depth>6||root===null||root===undefined)return null;
  if(Array.isArray(root)){
    for(const x of root.slice(0,40)){const v=findFirst(x,names,depth+1);if(v!==null&&v!==undefined&&String(v)!=="")return v}
    return null;
  }
  if(typeof root!=="object")return null;
  const wanted=new Set(names.map(x=>x.toLowerCase()));
  for(const [k,v] of Object.entries(root)){
    if(wanted.has(String(k).toLowerCase())&&v!==null&&v!==undefined&&typeof v!=="object"&&String(v)!=="")return v;
  }
  for(const v of Object.values(root)){
    const found=findFirst(v,names,depth+1);
    if(found!==null&&found!==undefined&&String(found)!=="")return found;
  }
  return null;
}
function phoneCandidate(payload:any){
  const raw=findFirst(payload,["phone","telefone","whatsapp","phone_e164","from","sender_phone","contact_phone"]);
  const d=digits(raw,20);
  return d.length>=10?d:null;
}
async function authorized(req:Request,url:URL){
  const supplied=clean(url.searchParams.get("key"),500);
  if(!supplied)return false;
  const q=await db.from("papoai_webhook_runtime_v2").select("capture_enabled,key_sha256").eq("id",1).maybeSingle();
  if(q.error||q.data?.capture_enabled!==true)return false;
  const expected=clean(q.data?.key_sha256,128).toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(expected))return false;
  return ctEqual(await sha256(supplied),expected);
}
async function capture(req:Request,url:URL){
  const length=Number(req.headers.get("content-length")||0);
  if(Number.isFinite(length)&&length>MAX_BODY_BYTES)return json({ok:false,error:"payload_too_large"},413);

  const raw=await req.text();
  if(new TextEncoder().encode(raw).length>MAX_BODY_BYTES)return json({ok:false,error:"payload_too_large"},413);

  let parsed:any={};
  if(raw.trim()){
    try{parsed=JSON.parse(raw)}catch{return json({ok:false,error:"invalid_json"},400)}
  }

  const bodyHash=await sha256(raw||"{}");
  const mode=clean(url.searchParams.get("mode"),80)||null;
  const externalEventId=clean(findFirst(parsed,["event_id","eventId","webhook_id","webhookId"]),180)||null;
  const externalMessageId=clean(findFirst(parsed,["message_id","messageId","idMessage","id_mensagem"]),180)||null;
  const conversationRef=clean(findFirst(parsed,["conversation_id","conversationId","chat_id","chatId","thread_id","threadId"]),180)||null;
  const eventName=clean(findFirst(parsed,["event","event_name","eventName","type","event_type","eventType"]),120)||null;
  const phone=phoneCandidate(parsed);
  const primary=externalEventId||externalMessageId||null;
  const eventKey=await sha256([mode||"unknown",primary||bodyHash,bodyHash].join("|"));
  const payload=redact(parsed);
  const userAgent=clean(req.headers.get("user-agent"),180)||null;
  const row={
    event_key:eventKey,
    body_hash:bodyHash,
    mode,
    event_name:eventName,
    external_event_id:externalEventId,
    external_message_id:externalMessageId,
    conversation_ref:conversationRef,
    phone_candidate:phone,
    payload_bytes:new TextEncoder().encode(raw).length,
    user_agent:userAgent,
    payload,
    metadata:{capture_only:true,source:"papoai",adapter_version:2},
    status:"captured",
    adapter_version:2
  };

  const inserted=await db.from("papoai_webhook_inbox_v2").insert(row).select("id,event_key").single();
  let duplicate=false,id:string|null=null;
  if(inserted.error){
    if(String(inserted.error.code)==="23505"){
      duplicate=true;
      const q=await db.from("papoai_webhook_inbox_v2").select("id").eq("event_key",eventKey).maybeSingle();
      if(!q.error)id=q.data?.id||null;
    }else{
      await db.from("papoai_webhook_runtime_v2").update({last_error:clean(inserted.error.message,400),updated_at:new Date().toISOString()}).eq("id",1);
      return json({ok:false,error:"capture_failed"},500);
    }
  }else id=inserted.data?.id||null;

  let normalized:any=null,conversation:any=null;
  if(id){
    try{
      const n=await db.rpc("papoai_normalize_capture_v2",{p_capture_id:id});
      if(!n.error)normalized=n.data||null;
    }catch(e){
      console.error("papoai_normalize",clean((e as Error)?.message||e,240));
    }
    if(normalized?.status==="normalized"){
      try{
        const b=await db.rpc("papoai_ensure_conversation_v2",{p_capture_id:id});
        if(!b.error)conversation=b.data||null;
      }catch(e){
        console.error("papoai_conversation_bridge",clean((e as Error)?.message||e,240));
      }
    }
  }

  await db.from("papoai_webhook_runtime_v2").update({
    last_seen_at:new Date().toISOString(),last_event_key:eventKey,last_error:null,updated_at:new Date().toISOString()
  }).eq("id",1);

  return json({
    ok:true,accepted:true,capture_only:true,duplicate,
    event_ref:id?String(id).slice(0,8):null,
    normalized:normalized?.status==="normalized",
    conversation_linked:Boolean(conversation?.conversation_id),
    conversation_created:Boolean(conversation?.created),
    adapter_version:2
  },200);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  const url=new URL(req.url);
  if(req.method==="GET"){
    if(url.searchParams.get("health")==="1")return json({ok:true,service:"papo-external-agent-v1",mode:"capture_only",version:107});
    return json({ok:true,service:"papo-external-agent-v1",mode:"capture_only",version:107},200);
  }
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return json({ok:false,error:"server_config"},500);
  if(!(await authorized(req,url)))return json({ok:false,error:"unauthorized"},401);
  try{return await capture(req,url)}
  catch(e){
    console.error("papoai_capture",clean((e as Error)?.message||e,300));
    try{await db.from("papoai_webhook_runtime_v2").update({last_error:"capture_exception",updated_at:new Date().toISOString()}).eq("id",1)}catch{}
    return json({ok:false,error:"capture_exception"},500);
  }
});
