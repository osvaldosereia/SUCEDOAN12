import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  return {"Vary":"Origin","Access-Control-Allow-Origin":origins.has(origin)?origin:"https://donaantonia.com.br",
  "Access-Control-Allow-Headers":"apikey,content-type,x-customer-action-token",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
};
const response=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"private, no-store, max-age=0","X-Robots-Tag":"noindex, nofollow, noarchive","Referrer-Policy":"no-referrer"}
});
const valid=(v:string)=>/^[a-f0-9]{64}$/i.test(v);
async function hash(raw:string){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function randomToken(){const buffer=crypto.getRandomValues(new Uint8Array(32));return [...buffer].map(x=>x.toString(16).padStart(2,"0")).join("")}
const clean=(v:unknown,n=100)=>String(v??"").trim().slice(0,n);
async function session(tokenHash:string){
  const r=await db.rpc("ops3_get_customer_order_action_v1",{p_token_hash:tokenHash});
  if(r.error)throw r.error;
  return r.data||{ok:false,error:"session_unavailable"};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const origin=req.headers.get("origin")||"";
  if(origin&&!origins.has(origin))return response(req,{ok:false,error:"origin_not_allowed"},403);
  if(!["GET","POST"].includes(req.method))return response(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return response(req,{ok:false,error:"server_config"},503);
  const token=clean(req.headers.get("x-customer-action-token"),128);
  if(!valid(token))return response(req,{ok:false,error:"invalid_token"},404);
  const tokenHash=await hash(token);
  const url=new URL(req.url);
  const action=clean(url.searchParams.get("action"),32)||"session";
  if(!["session","addon_session","confirm"].includes(action))return response(req,{ok:false,error:"invalid_action"},400);
  if(req.method==="GET"&&action!=="session")return response(req,{ok:false,error:"method_not_allowed"},405);
  if(req.method==="POST"&&action==="session")return response(req,{ok:false,error:"method_not_allowed"},405);
  try{
    const bucket=action==="confirm"?"order_customer_confirm_v1":"order_customer_read_v1";
    const gate=await db.rpc("consume_public_rate_limit",{
      p_rate_key:"order-customer:"+tokenHash.slice(0,32),p_bucket:bucket,p_limit:action==="confirm"?8:90,p_window_seconds:300
    });
    if(gate.error)return response(req,{ok:false,error:"rate_limit_unavailable"},503);
    if(gate.data!==true)return response(req,{ok:false,error:"rate_limited"},429);
    const current=await session(tokenHash);
    if(current?.ok!==true)return response(req,{ok:false,error:"not_found"},404);
    if(action==="session"){
      // The read-only public token remains separate from this 256-bit action capability.
      // Eligibility is evaluated on every session read, including the live feature gate,
      // order status, Bling sync, separation locks and the add-on expiry window.
      const eligibility=await db.rpc("ops3_order_addon_eligibility_v1",{p_order_id:current.order_id});
      return response(req,{
        ...current,
        can_add_offers:!eligibility.error&&eligibility.data?.ok===true&&eligibility.data?.eligible===true,
        add_offers_until:!eligibility.error&&eligibility.data?.eligible===true
          ?eligibility.data.expires_at:null
      },200);
    }
    if(action==="addon_session"){
      if(current.can_confirm!==true)return response(req,{ok:false,error:"order_not_editable"},409);
      const addonToken=randomToken(), addonHash=await hash(addonToken);
      const q=await db.rpc("ops3_create_order_addon_session_v1",{
        p_order_id:current.order_id,p_token_hash:addonHash,p_source:"customer_postorder",p_metadata:{"origin":"customer_action"}
      });
      if(q.error)throw q.error;
      if(q.data?.ok!==true)return response(req,{ok:false,error:clean(q.data?.error,100)||"addon_unavailable"},409);
      return response(req,{ok:true,addon_token:addonToken,expires_at:q.data.expires_at,order_number:q.data.order_number},200);
    }
    const body=await req.json().catch(()=>({}));
    const total=Number(body?.expected_total),updated=clean(body?.expected_updated_at,60);
    if(!Number.isFinite(total)||total<0||!Number.isFinite(Date.parse(updated))||
       Math.round(total*100)!==Number(body?.expected_total_cents))
      return response(req,{ok:false,error:"invalid_confirmation_snapshot"},400);
    const q=await db.rpc("ops3_confirm_customer_order_v1",{
      p_token_hash:tokenHash,p_expected_total:total,p_expected_updated_at:updated
    });
    if(q.error){
      const reason=String(q.error.message||"");
      return response(req,{ok:false,error:reason.includes("stock_unavailable")?"stock_unavailable":"confirmation_unavailable"},409);
    }
    const result=q.data||{ok:false,error:"confirmation_unavailable"};
    return response(req,result,result.ok===true?200:409);
  }catch(err){
    console.error("customer_order_action_error",clean((err as Error)?.message||err,120));
    return response(req,{ok:false,error:"service_unavailable"},503);
  }
});