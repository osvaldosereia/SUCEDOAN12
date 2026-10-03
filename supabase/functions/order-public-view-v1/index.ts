import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const allowed=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(req:Request)=>{const o=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":allowed.has(o)?o:"https://donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"content-type"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store, max-age=0","X-Robots-Tag":"noindex, nofollow, noarchive"}});
const validUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const validToken=(v:string)=>/^[a-f0-9]{16}$/i.test(v);
const meta=(v:any)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};

async function loadPublicRow(token:string,legacyOrderId:string){
  if(validToken(token)){
    const q=await db.from("order_public_snapshots_v1").select("order_id,snapshot,open_count,public_code,public_token").eq("public_token",token).maybeSingle();
    if(q.error)throw q.error;
    return q.data||null;
  }
  if(!validUuid(legacyOrderId))return null;
  let q=await db.from("order_public_snapshots_v1").select("order_id,snapshot,open_count,public_code,public_token").eq("order_id",legacyOrderId).maybeSingle();
  if(q.error)throw q.error;
  if(q.data)return q.data;
  const refreshed=await db.rpc("ops2_refresh_order_public_snapshot_v1",{p_order_id:legacyOrderId});
  if(refreshed.error||!refreshed.data)return null;
  q=await db.from("order_public_snapshots_v1").select("order_id,snapshot,open_count,public_code,public_token").eq("order_id",legacyOrderId).maybeSingle();
  if(q.error)throw q.error;
  return q.data||null;
}

async function resolveChannel(order:any,orderId:string){
  const channel=await db.from("ops2_whatsapp_outbox_v1").select("channel_origin").eq("order_id",orderId).eq("recipient_kind","customer").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(channel.error)throw channel.error;
  let origin=String(channel.data?.channel_origin||"");
  if(origin!=="0975"&&origin!=="1018"){
    const accountId=String(order?.whatsapp_account_id||"").trim();
    if(accountId){
      const account=await db.from("whatsapp_accounts").select("phone_e164").eq("id",accountId).maybeSingle();
      if(account.error)throw account.error;
      const digits=String(account.data?.phone_e164||"").replace(/\D/g,"");
      if(digits==="5565984491018")origin="1018";
      else if(digits==="5565998150975")origin="0975";
    }
  }
  return origin==="1018"?"1018":"0975";
}

async function currentItems(orderId:string,currentStatus:string){
  const iq=await db.from("order_items").select("id,product_id,name_snapshot,quantity,metadata,created_at").eq("order_id",orderId).gt("quantity",0).order("created_at");
  if(iq.error)throw iq.error;
  const rows=iq.data||[];
  const pids=[...new Set(rows.map((x:any)=>x.product_id).filter(Boolean))];
  const products=new Map<string,any>();
  if(pids.length){
    const pq=await db.from("products").select("id,image_url").in("id",pids);
    if(pq.error)throw pq.error;
    for(const p of pq.data||[])products.set(String(p.id),p);
  }
  const sq=await db.from("order_separation_items_v1").select("order_item_id,state,changed_at").eq("order_id",orderId);
  if(sq.error)throw sq.error;
  const states=new Map<string,any>((sq.data||[]).map((x:any)=>[String(x.order_item_id),x]));
  const legacySeparated=["ready","out_for_delivery","delivered"].includes(String(currentStatus||""));
  return rows.map((x:any)=>{
    const im=meta(x.metadata),state=states.get(String(x.id));
    return {
      order_item_id:x.id,
      name:x.name_snapshot||"Produto",
      quantity:Number(x.quantity||0),
      image_url:String(im.image_url||products.get(String(x.product_id))?.image_url||""),
      basket_name:String(im.parent_basket_name||im.basket_name||""),
      basket_id:String(im.basket_id||""),
      kind:String(im.history_kind||"product"),
      separation_state:String(state?.state|| (legacySeparated?"separated":"pending")),
      separation_changed_at:state?.changed_at||null
    };
  });
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return json(req,{ok:false,error:"server_config"},500);

  const url=new URL(req.url),token=(url.searchParams.get("k")||"").trim(),legacyOrderId=(url.searchParams.get("o")||"").trim();
  let row:any=null;
  try{row=await loadPublicRow(token,legacyOrderId)}catch{return json(req,{ok:false,error:"snapshot_unavailable"},503)}
  if(!row)return json(req,{ok:false,error:"not_found"},404);

  const orderId=String(row.order_id||"");
  const oq=await db.from("orders").select("status,updated_at,whatsapp_account_id,order_number,total,subtotal").eq("id",orderId).maybeSingle();
  if(oq.error)return json(req,{ok:false,error:"order_unavailable"},503);
  if(!oq.data)return json(req,{ok:false,error:"not_found"},404);

  const currentStatus=String(oq.data.status||"created");
  let items:any[]=[];
  try{items=await currentItems(orderId,currentStatus)}catch{return json(req,{ok:false,error:"items_unavailable"},503)}

  const cq=await db.from("order_separation_completions_v1").select("original_total,missing_subtotal,final_total,phase,completed_at").eq("order_id",orderId).maybeSingle();
  if(cq.error)return json(req,{ok:false,error:"completion_unavailable"},503);
  const completion=cq.data||null;
  const originalSnapshot=meta(row.snapshot),canonicalOrderNumber=String(oq.data.order_number||originalSnapshot.order_number||"");
  const currentTotal=Number(oq.data.total??originalSnapshot.total??0),currentSubtotal=Number(oq.data.subtotal??originalSnapshot.subtotal??0);
  const originalTotal=Number(completion?.original_total??originalSnapshot.total??currentTotal),missingAdjustment=Number(completion?.missing_subtotal??0);
  const snapshot={...originalSnapshot,order_number:canonicalOrderNumber,total:currentTotal,subtotal:currentSubtotal,items};
  delete snapshot.order_id;
  delete snapshot.order_code;

  let channelOrigin="0975";
  try{channelOrigin=await resolveChannel(oq.data,orderId)}catch{}
  void db.from("order_public_snapshots_v1").update({open_count:Number(row.open_count||0)+1,last_opened_at:new Date().toISOString()}).eq("order_id",orderId).then(()=>{});

  return json(req,{
    ok:true,
    public_code:row.public_code,
    order_number:canonicalOrderNumber,
    snapshot,
    channel_origin:channelOrigin,
    current_status:currentStatus,
    current_status_updated_at:oq.data.updated_at||null,
    original_total:originalTotal,
    missing_adjustment:missingAdjustment,
    total:currentTotal,
    separation_completed:Boolean(completion?.phase==="completed"||completion?.completed_at),
    separation_phase:completion?.phase||null
  });
});
