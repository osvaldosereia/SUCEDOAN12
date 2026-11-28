import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const clean=(v:any,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uid=(v:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80))?clean(v,80):null;
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function eq(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function auth(url:URL){const k=clean(url.searchParams.get("key"),500);if(!k)return false;const q=await db.from("papoai_webhook_runtime_v2").select("capture_enabled,key_sha256").eq("id",1).maybeSingle();if(q.error||q.data?.capture_enabled!==true)return false;const e=clean(q.data?.key_sha256,128).toLowerCase();return /^[0-9a-f]{64}$/.test(e)&&eq(await sha(k),e)}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 const url=new URL(req.url);
 if(req.method==="GET")return out({ok:true,service:"papo-comprar-webhook-v1",mode:"preview_or_draft_only",supports:["basket","products"],order_commit_supported:false,version:10});
 if(req.method!=="POST")return out({ok:false,error:"method_not_allowed"},405);
 if(!(await auth(url)))return out({ok:false,error:"unauthorized"},401);
 const raw=await req.text();if(new TextEncoder().encode(raw).length>65536)return out({ok:false,error:"payload_too_large"},413);
 let b:any={};try{b=raw.trim()?JSON.parse(raw):{}}catch{return out({ok:false,error:"invalid_json"},400)}
 const mode=clean(b?.mode,20)||"preview",kind=clean(b?.kind,20)||"auto",message=clean(b?.message,2000);if(!message)return out({ok:false,error:"message_required"},400);
 if(!["auto","basket","products"].includes(kind))return out({ok:false,error:"invalid_kind"},400);
 if(mode==="preview"){
   if(kind==="products"){const r=await db.rpc("papoai_resolve_product_intent_v1",{p_query:message,p_limit:5});return r.error?out({ok:false,error:"preview_failed"},500):out({ok:true,mode,kind,result:r.data,external_order_created:false});}
   const r=await db.rpc("papoai_resolve_basket_intent_v1",{p_message:message});
   if(r.error)return out({ok:false,error:"preview_failed"},500);
   if(kind==="basket"||r.data?.reason!=="basket_not_identified")return out({ok:true,mode,kind:"basket",result:r.data,external_order_created:false});
   const p=await db.rpc("papoai_resolve_product_intent_v1",{p_query:message,p_limit:5});
   return p.error?out({ok:false,error:"preview_failed"},500):out({ok:true,mode,kind:"products",result:p.data,external_order_created:false});
 }
 if(mode!=="draft")return out({ok:false,error:"invalid_mode"},400);
 const conversationRef=clean(b?.conversation_ref,180),phone=clean(b?.phone,40);if(!conversationRef||!phone)return out({ok:false,error:!conversationRef?"conversation_required":"phone_required"},400);
 const args={p_conversation_ref:conversationRef,p_phone:phone,p_message:message,p_customer_id:uid(b?.customer_id),p_source_event_key:clean(b?.source_event_key,220)||null};
 if(kind==="basket"){const r=await db.rpc("papoai_prepare_basket_draft_v1",args);return r.error?out({ok:false,error:"draft_failed",external_order_created:false},500):out({ok:true,mode,kind,result:r.data,external_order_created:false,order_commit_supported:false});}
 if(kind==="products"){const r=await db.rpc("papoai_prepare_product_draft_v1",args);return r.error?out({ok:false,error:"draft_failed",external_order_created:false},500):out({ok:true,mode,kind,result:r.data,external_order_created:false,order_commit_supported:false});}
 const basket=await db.rpc("papoai_resolve_basket_intent_v1",{p_message:message});
 if(!basket.error&&basket.data?.reason!=="basket_not_identified"){
   const r=await db.rpc("papoai_prepare_basket_draft_v1",args);return r.error?out({ok:false,error:"draft_failed",external_order_created:false},500):out({ok:true,mode,kind:"basket",result:r.data,external_order_created:false,order_commit_supported:false});
 }
 const r=await db.rpc("papoai_prepare_product_draft_v1",args);return r.error?out({ok:false,error:"draft_failed",external_order_created:false},500):out({ok:true,mode,kind:"products",result:r.data,external_order_created:false,order_commit_supported:false});
});
