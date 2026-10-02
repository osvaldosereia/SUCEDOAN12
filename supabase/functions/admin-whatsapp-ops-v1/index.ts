import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {validUuid,attendanceFilter,serviceWindowState,normalizeProductQuery} from "../_shared/admin-attendance-domain-v1.mjs";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const READ_ACTIONS=new Set(["accounts","queue","conversation","context","products"]);
const SAFE_POST_ACTIONS=new Set(["mark_read","follow_up","issue_catalog","marketing_opt_out"]);

const clean=(v:unknown,max=200)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const num=(v:unknown,fallback:number,min:number,max:number)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.trunc(n))):fallback};
const isoOrNull=(v:unknown)=>{const s=clean(v,50);if(!s)return null;const t=Date.parse(s);return Number.isFinite(t)?new Date(t).toISOString():null};
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {
  "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
  "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,authorization,apikey",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  return {ok:true as const,status:200,user_id:user.data.user.id,role:row.data.role||"viewer"};
}

async function productSearch(q:string,limit:number){
  const fields="id,name,gtin,image_url,image_ai_url,price,is_offer,offer_price,is_active";
  const nameResult=await db.from("products").select(fields).eq("is_active",true).ilike("name",`%${q}%`).order("name").limit(limit);
  if(nameResult.error)throw nameResult.error;
  let rows=[...(nameResult.data||[])];
  if(/^\d{2,14}$/.test(q)&&rows.length<limit){
    const eanResult=await db.from("products").select(fields).eq("is_active",true).eq("gtin",q).limit(limit);
    if(eanResult.error)throw eanResult.error;
    const seen=new Set(rows.map((x:any)=>String(x.id)));
    for(const item of eanResult.data||[])if(!seen.has(String(item.id))){rows.push(item);seen.add(String(item.id))}
  }
  rows=rows.slice(0,limit);
  const ids=rows.map((x:any)=>x.id).filter(Boolean);
  const stock=new Map<string,number>();
  if(ids.length){
    const sr=await db.from("ops2_loose_sellable_stock_v1").select("product_id,effective_sellable_stock").in("product_id",ids);
    if(sr.error)throw sr.error;
    for(const x of sr.data||[])stock.set(String(x.product_id),Math.max(0,Number(x.effective_sellable_stock||0)));
  }
  return rows.map((p:any)=>({
    id:p.id,name:p.name||"",gtin:p.gtin||null,image_url:p.image_ai_url||p.image_url||null,
    sale_price:Number(p.price||0),sellable_stock:stock.get(String(p.id))??0,
    offer:p.is_offer===true&&p.offer_price!=null?{active:true,price:Number(p.offer_price)}:null
  }));
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(!SUPABASE_URL||!SERVICE_KEY)return json(req,{ok:false,error:"server_config"},500);
  const url=new URL(req.url);
  const action=clean(url.searchParams.get("action"),40).toLowerCase();
  if(req.method==="GET"&&!READ_ACTIONS.has(action))return json(req,{ok:false,error:"action_not_allowed"},404);
  if(req.method==="POST"&&!SAFE_POST_ACTIONS.has(action))return json(req,{ok:false,error:"action_not_allowed"},404);
  if(req.method!=="GET"&&req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);

  const auth=await adminAuth(req);
  if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);

  try{
    if(req.method==="GET"&&action==="accounts"){
      const r=await db.from("whatsapp_accounts").select("id,slug,display_name,phone_e164,is_active").eq("is_active",true).order("phone_e164");
      if(r.error)throw r.error;
      return json(req,{ok:true,items:r.data||[]});
    }

    if(req.method==="GET"&&action==="queue"){
      const accountId=validUuid(url.searchParams.get("account_id"));
      if(!accountId)return json(req,{ok:false,error:"invalid_account_id"},400);
      const r=await db.rpc("ops2_admin_attendance_queue_v1",{
        p_whatsapp_account_id:accountId,p_limit:num(url.searchParams.get("limit"),50,1,50),
        p_search:clean(url.searchParams.get("search"),80)||null,p_filter:attendanceFilter(url.searchParams.get("filter"))
      });
      if(r.error)throw r.error;
      return json(req,r.data||{ok:false,error:"queue_unavailable"},r.data?.ok===false?400:200);
    }

    if(req.method==="GET"&&action==="conversation"){
      const conversationId=validUuid(url.searchParams.get("conversation_id"));
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      const beforeRaw=url.searchParams.get("before");const before=beforeRaw?isoOrNull(beforeRaw):null;
      if(beforeRaw&&!before)return json(req,{ok:false,error:"invalid_before"},400);
      const r=await db.rpc("ops2_admin_attendance_conversation_v1",{p_conversation_id:conversationId,p_before:before,p_limit:num(url.searchParams.get("limit"),30,1,50)});
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"conversation_unavailable"};
      if(data?.conversation)data.service_window=serviceWindowState(data.conversation.last_inbound_at,new Date().toISOString());
      return json(req,data,data?.ok===false?404:200);
    }

    if(req.method==="GET"&&action==="context"){
      const conversationId=validUuid(url.searchParams.get("conversation_id"));
      if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);
      const r=await db.rpc("ops2_admin_attendance_context_v1",{p_conversation_id:conversationId});
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"context_unavailable"};
      if(data?.conversation)data.service_window=serviceWindowState(data.conversation.last_inbound_at,new Date().toISOString());
      return json(req,data,data?.ok===false?404:200);
    }

    if(req.method==="GET"&&action==="products"){
      const q=normalizeProductQuery(url.searchParams.get("q"));const limit=num(url.searchParams.get("limit"),12,1,12);
      if(!q)return json(req,{ok:true,query:null,items:[]});
      return json(req,{ok:true,query:q,items:await productSearch(q,limit)});
    }

    const body=await req.json().catch(()=>({}));
    const conversationId=validUuid(body?.conversation_id);
    if(!conversationId)return json(req,{ok:false,error:"invalid_conversation_id"},400);

    if(action==="mark_read"){
      const messageId=validUuid(body?.message_id);if(!messageId)return json(req,{ok:false,error:"invalid_message_id"},400);
      const r=await db.rpc("ops2_admin_attendance_mark_read_v1",{p_conversation_id:conversationId,p_message_id:messageId});
      if(r.error)throw r.error;return json(req,r.data||{ok:false,error:"mark_read_failed"},r.data?.ok===false?400:200);
    }

    if(action==="follow_up"){
      const followRaw=body?.follow_up_at;const follow=followRaw==null||String(followRaw).trim()===''?null:isoOrNull(followRaw);
      if(followRaw!=null&&String(followRaw).trim()!==''&&!follow)return json(req,{ok:false,error:"invalid_follow_up_at"},400);
      const r=await db.rpc("ops2_admin_attendance_follow_up_v1",{p_conversation_id:conversationId,p_follow_up_at:follow});
      if(r.error)throw r.error;return json(req,r.data||{ok:false,error:"follow_up_failed"},r.data?.ok===false?400:200);
    }

    if(action==="marketing_opt_out"){
      const r=await db.rpc("ops2_admin_attendance_marketing_optout_v1",{p_conversation_id:conversationId});
      if(r.error)throw r.error;
      const data=r.data||{ok:false,error:"marketing_optout_failed"};
      if(data?.ok===true)return json(req,data,200);
      const error=String(data?.error||"marketing_optout_failed");
      return json(req,data,error==="customer_not_linked"?409:error==="conversation_not_found"?404:400);
    }

    if(action==="issue_catalog"){
      const ctx=await db.rpc("ops2_admin_attendance_context_v1",{p_conversation_id:conversationId});
      if(ctx.error)throw ctx.error;const phone=clean(ctx.data?.conversation?.phone_e164,30);
      if(ctx.data?.ok!==true||!phone)return json(req,{ok:false,error:"conversation_phone_unavailable"},409);
      const sourceKey=`attendance:${conversationId}:${Date.now()}`;
      const r=await db.rpc("ops2_issue_papoai_catalog_link_v1",{p_phone:phone,p_conversation_id:conversationId,p_source_event_key:sourceKey});
      if(r.error)throw r.error;return json(req,r.data||{ok:false,error:"catalog_link_failed"},r.data?.ok===false?400:200);
    }

    return json(req,{ok:false,error:"action_not_allowed"},404);
  }catch(error){
    console.error("admin-whatsapp-ops-v1",action,error);
    return json(req,{ok:false,error:"attendance_backend_error"},500);
  }
});