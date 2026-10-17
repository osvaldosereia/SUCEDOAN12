import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":allowed.has(origin)?origin:"https://donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"content-type"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store, max-age=0","X-Robots-Tag":"noindex, nofollow, noarchive"}});
const validUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const validToken=(v:string)=>/^[a-f0-9]{16}$/i.test(v);

async function channelOrigin(orderId:string,whatsappAccountId:unknown){
  const recent=await db.from("ops2_whatsapp_outbox_v1")
    .select("channel_origin")
    .eq("order_id",orderId)
    .eq("recipient_kind","customer")
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  const stored=String(recent.data?.channel_origin||"");
  if(stored==="0975"||stored==="1018")return stored;

  const accountId=String(whatsappAccountId||"").trim();
  if(accountId){
    const account=await db.from("whatsapp_accounts").select("phone_e164").eq("id",accountId).maybeSingle();
    const digits=String(account.data?.phone_e164||"").replace(/\D/g,"");
    if(digits==="5565984491018")return "1018";
    if(digits==="5565998150975")return "0975";
  }
  return "0975";
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return json(req,{ok:false,error:"server_config"},500);

  const url=new URL(req.url);
  const token=(url.searchParams.get("k")||"").trim();
  const legacyOrderId=(url.searchParams.get("o")||"").trim();
  let row:any=null,error:any=null;

  if(validToken(token)){
    const query=await db.from("order_public_snapshots_v1")
      .select("order_id,snapshot,open_count,public_code,public_token")
      .eq("public_token",token)
      .maybeSingle();
    row=query.data;error=query.error;
  }else if(validUuid(legacyOrderId)){
    let query=await db.from("order_public_snapshots_v1")
      .select("order_id,snapshot,open_count,public_code,public_token")
      .eq("order_id",legacyOrderId)
      .maybeSingle();
    row=query.data;error=query.error;
    if(!row&&!error){
      const refreshed=await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:legacyOrderId});
      if(refreshed.error||!refreshed.data)return json(req,{ok:false,error:"not_found"},404);
      query=await db.from("order_public_snapshots_v1")
        .select("order_id,snapshot,open_count,public_code,public_token")
        .eq("order_id",legacyOrderId)
        .maybeSingle();
      row=query.data;error=query.error;
    }
  }else return json(req,{ok:false,error:"not_found"},404);

  if(error)return json(req,{ok:false,error:"snapshot_unavailable"},503);
  if(!row)return json(req,{ok:false,error:"not_found"},404);

  const orderId=String(row.order_id||"");
  const current=await db.from("orders").select("status,updated_at,whatsapp_account_id,phone_e164").eq("id",orderId).maybeSingle();
  if(current.error)return json(req,{ok:false,error:"order_unavailable"},503);
  const channel=await channelOrigin(orderId,current.data?.whatsapp_account_id);

  void db.from("order_public_snapshots_v1")
    .update({open_count:Number(row.open_count||0)+1,last_opened_at:new Date().toISOString()})
    .eq("order_id",orderId)
    .then(()=>{});

  const snapshot={...(row.snapshot||{})};
  delete snapshot.order_id;
  delete snapshot.order_number;
  snapshot.order_code=row.public_code;
  snapshot.customer_phone=String(current.data?.phone_e164||"").trim();

  return json(req,{
    ok:true,
    public_code:row.public_code,
    snapshot,
    channel_origin:channel,
    current_status:current.data?.status||null,
    current_status_updated_at:current.data?.updated_at||null
  });
});
