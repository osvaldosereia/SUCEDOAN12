import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{const o=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":allowed.has(o)?o:"https://donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"content-type"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store, max-age=0","X-Robots-Tag":"noindex, nofollow, noarchive"}});
const validUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return json(req,{ok:false,error:"server_config"},500);
  const orderId=(new URL(req.url).searchParams.get("o")||"").trim();
  if(!validUuid(orderId))return json(req,{ok:false,error:"not_found"},404);

  let {data:row,error}=await db.from("order_public_snapshots_v1").select("snapshot,open_count").eq("order_id",orderId).maybeSingle();
  if(error)return json(req,{ok:false,error:"snapshot_unavailable"},503);
  if(!row){
    const refreshed=await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:orderId});
    if(refreshed.error||!refreshed.data)return json(req,{ok:false,error:"not_found"},404);
    const reread=await db.from("order_public_snapshots_v1").select("snapshot,open_count").eq("order_id",orderId).maybeSingle();
    if(reread.error||!reread.data)return json(req,{ok:false,error:"snapshot_unavailable"},503);
    row=reread.data;
  }
  const current=await db.from("orders").select("status,updated_at").eq("id",orderId).maybeSingle();
  void db.from("order_public_snapshots_v1").update({open_count:Number(row.open_count||0)+1,last_opened_at:new Date().toISOString()}).eq("order_id",orderId).then(()=>{});
  return json(req,{ok:true,snapshot:row.snapshot,current_status:current.data?.status||null,current_status_updated_at:current.data?.updated_at||null});
});
