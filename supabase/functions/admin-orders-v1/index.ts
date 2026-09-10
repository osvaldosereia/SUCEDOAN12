import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const text=(v:unknown,max=300)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const int=(v:unknown,min=1,max=100)=>Math.max(min,Math.min(max,Number.parseInt(String(v??min),10)||min));
const FINAL_STATUS=new Set(["ready_for_human","confirmed","finalized","ready"]);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);

  const base=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!base||!service)return json({ok:false,error:"server_config"},500);
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({ok:false,error:"missing_token"},401);

  const sb=createClient(base,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:ud,error:ue}=await sb.auth.getUser(token);
  if(ue||!ud?.user?.id)return json({ok:false,error:"invalid_user"},401);
  const {data:admin,error:ae}=await sb.from("admin_users").select("role,is_active").eq("user_id",ud.user.id).maybeSingle();
  if(ae)return json({ok:false,error:"admin_lookup_failed"},500);
  if(!admin?.is_active)return json({ok:false,error:"admin_not_authorized"},403);

  let body:any={};try{body=await req.json()}catch{/* empty */}
  const action=text(body?.action||"list",40).toLowerCase();

  if(action==="list"){
    const limit=int(body?.limit,10,100),page=int(body?.page,1,100000),from=(page-1)*limit,to=from+limit-1;
    const q=text(body?.q,100);
    let query=sb.from("whatsapp_basket_order_requests")
      .select("id,status,payment_method,basket_name_snapshot,total,customer_snapshot,address_snapshot,delivery_date,created_at,updated_at",{count:"exact"})
      .not("payment_method","is",null)
      .range(from,to)
      .order("created_at",{ascending:false});
    if(q){
      const safe=q.replace(/[,%()]/g," ").trim();
      if(safe)query=query.or(`basket_name_snapshot.ilike.%${safe}%,customer_snapshot->>name.ilike.%${safe}%,customer_snapshot->>phone.ilike.%${safe}%`);
    }
    const {data,error,count}=await query;
    if(error)return json({ok:false,error:"orders_failed",detail:error.message},400);
    const orders=(data||[]).filter((r:any)=>FINAL_STATUS.has(String(r.status||""))||Boolean(r.payment_method));
    return json({ok:true,orders,total:count||orders.length,page,limit});
  }

  if(action==="detail"){
    const id=text(body?.id,80);if(!/^[0-9a-f-]{36}$/i.test(id))return json({ok:false,error:"invalid_id"},400);
    const {data:order,error}=await sb.from("whatsapp_basket_order_requests")
      .select("id,conversation_id,customer_id,basket_session_id,extras_session_id,basket_id,cart_id,status,basket_name_snapshot,basket_base_price,extras_total,total,basket_selection,extras,customer_snapshot,address_snapshot,delivery_date,delivery_rule,payment_method,created_at,updated_at")
      .eq("id",id).not("payment_method","is",null).maybeSingle();
    if(error)return json({ok:false,error:"order_failed",detail:error.message},400);
    if(!order)return json({ok:false,error:"order_not_found"},404);
    return json({ok:true,order});
  }

  return json({ok:false,error:"unsupported_action"},400);
});
