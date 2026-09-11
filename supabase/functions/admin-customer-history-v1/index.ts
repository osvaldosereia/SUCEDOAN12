import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=100)=>String(v??"").trim().slice(0,max);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({ok:false,error:"server_config"},500);
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const customerId=clean(body?.customer_id,80);
  if(!uuid.test(customerId))return json({ok:false,error:"invalid_customer_id"},400);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});

  const [{data:summaryRows,error:summaryError},{data:orders,error:ordersError}]=await Promise.all([
    sb.from("bling_sales_history").select("total,order_date").eq("customer_id",customerId),
    sb.from("bling_sales_history")
      .select("id,bling_order_id,order_number,order_date,status_name,total,discount,other_expenses,bling_sales_history_items(id,item_index,name,sku,quantity,unit_price,line_total)")
      .eq("customer_id",customerId)
      .order("order_date",{ascending:false,nullsFirst:false})
      .order("updated_at",{ascending:false})
      .limit(30)
  ]);
  if(summaryError||ordersError)return json({ok:false,error:"history_failed",detail:summaryError?.message||ordersError?.message},400);
  const rows=summaryRows||[];
  const total=rows.reduce((sum,row)=>sum+Number(row.total||0),0);
  const lastOrder=rows.map(row=>row.order_date).filter(Boolean).sort().at(-1)||null;
  return json({
    ok:true,
    summary:{orders:rows.length,total:Number(total.toFixed(2)),last_order_date:lastOrder},
    orders:(orders||[]).map((order:any)=>({...order,bling_sales_history_items:(order.bling_sales_history_items||[]).sort((a:any,b:any)=>Number(a.item_index||0)-Number(b.item_index||0))}))
  });
});
