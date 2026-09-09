import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const encoder=new TextEncoder();
const text=(value:unknown,max=200)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const plain=(body:string,status=200)=>new Response(body,{status,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const isObject=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);

function hexToBytes(value:string):Uint8Array|null{
  if(!/^[0-9a-f]{64}$/i.test(value))return null;
  const out=new Uint8Array(32);
  for(let i=0;i<32;i++)out[i]=Number.parseInt(value.slice(i*2,i*2+2),16);
  return out;
}

async function verifyMetaSignature(raw:string,secret:string,signatureHeader:string):Promise<boolean>{
  const match=/^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if(!match)return false;
  const expected=hexToBytes(match[1]);
  if(!expected)return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,expected,encoder.encode(raw));
}

async function sha256Hex(value:string):Promise<string>{
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
  return [...digest].map(v=>v.toString(16).padStart(2,'0')).join('');
}

Deno.serve(async(req:Request)=>{
  const url=Deno.env.get('SUPABASE_URL');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!serviceKey)return plain('server_config',500);
  const sb=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  if(req.method==='GET'){
    const requestUrl=new URL(req.url);
    const mode=requestUrl.searchParams.get('hub.mode')||'';
    const supplied=requestUrl.searchParams.get('hub.verify_token')||'';
    const challenge=requestUrl.searchParams.get('hub.challenge')||'';
    const {data:verifyToken,error}=await sb.rpc('get_whatsapp_flow_health_verify_token_v1');
    if(error||!verifyToken)return plain('verify_token_unavailable',503);
    if(mode==='subscribe'&&supplied===verifyToken&&challenge)return plain(challenge,200);
    return plain('forbidden',403);
  }

  if(req.method!=='POST')return plain('method_not_allowed',405);

  const raw=await req.text();
  if(!raw||raw.length>1_000_000)return plain('invalid_payload',400);

  const {data:appSecret,error:secretError}=await sb.rpc('get_dona_antonia_meta_app_secret_v1');
  if(secretError)return plain('app_secret_lookup_failed',500);
  if(!appSecret)return plain('webhook_signature_unconfigured',503);

  const signature=req.headers.get('x-hub-signature-256')||'';
  if(!await verifyMetaSignature(raw,appSecret,signature))return plain('invalid_signature',401);

  let body:unknown;
  try{body=JSON.parse(raw)}catch{return plain('invalid_json',400)}
  if(!isObject(body))return plain('invalid_body',400);

  const objectName=text(body.object,80);
  if(objectName!=='whatsapp_business_account')return json({ok:true,ignored:true,reason:'unsupported_object'});

  const rows:Array<Record<string,unknown>>=[];
  const entries=Array.isArray(body.entry)?body.entry:[];
  for(let entryIndex=0;entryIndex<entries.length;entryIndex++){
    const entry=isObject(entries[entryIndex])?entries[entryIndex]:{};
    const entryId=text(entry.id,120);
    const entryTime=Number(entry.time||0)||null;
    const changes=Array.isArray(entry.changes)?entry.changes:[];
    for(let changeIndex=0;changeIndex<changes.length;changeIndex++){
      const change=isObject(changes[changeIndex])?changes[changeIndex]:{};
      if(text(change.field,80)!=='flows')continue;
      const value=isObject(change.value)?change.value:{};
      const eventName=text(value.event,120)||'UNKNOWN';
      const flowId=text(value.flow_id,120)||null;
      const availability=Number(value.availability);
      const threshold=Number(value.threshold);
      const alertState=text(value.alert_state,80)||null;
      const normalized={entry_id:entryId||null,entry_time:entryTime,event:eventName,flow_id:flowId,availability:Number.isFinite(availability)?availability:null,threshold:Number.isFinite(threshold)?threshold:null,alert_state:alertState};
      const eventFingerprint=await sha256Hex(JSON.stringify({normalized,entryIndex,changeIndex}));
      rows.push({
        event_fingerprint:eventFingerprint,
        event_name:eventName,
        flow_id:flowId,
        availability:Number.isFinite(availability)?availability:null,
        threshold:Number.isFinite(threshold)?threshold:null,
        alert_state:alertState,
        signature_verified:true,
        payload:normalized,
      });
    }
  }

  if(rows.length){
    const {error}=await sb.from('whatsapp_flow_health_events').upsert(rows,{onConflict:'event_fingerprint',ignoreDuplicates:true});
    if(error)return plain('event_persist_failed',500);
  }

  return json({ok:true,accepted:rows.length});
});
