import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}
});
const clean=(v:unknown,max=300)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  const url=Deno.env.get("SUPABASE_URL");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!service)return json({ok:false,error:"server_config"},500);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const inputUrl=new URL(req.url);
  let body:any={};
  if(req.method==="POST"){try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}}
  const action=clean(body?.action||inputUrl.searchParams.get("action")||"health",80);

  try{
    if(action==="health"||action==="readiness"){
      const [readiness,productBindings,customerBindings,orderBindings,clientId,clientSecret,refreshToken]=await Promise.all([
        db.rpc("bling_hub_readiness_v2"),
        db.from("products").select("id",{count:"exact",head:true}).not("bling_product_id","is",null),
        db.from("customers").select("id",{count:"exact",head:true}).not("bling_contact_id","is",null),
        db.from("orders").select("id",{count:"exact",head:true}).not("bling_order_id","is",null),
        db.rpc("get_bling_vault_secret_v2",{p_name:"bling_api_client_id_v1"}),
        db.rpc("get_bling_vault_secret_v2",{p_name:"bling_api_client_secret_v1"}),
        db.rpc("get_bling_vault_secret_v2",{p_name:"bling_api_refresh_token_v1"})
      ]);
      if(readiness.error)throw readiness.error;
      const credentialStatus={
        client_id:Boolean(clientId.data),
        client_secret:Boolean(clientSecret.data),
        refresh_token:Boolean(refreshToken.data),
        all_configured:Boolean(clientId.data)&&Boolean(clientSecret.data)&&Boolean(refreshToken.data)
      };
      return json({
        ok:true,
        mode:"foundation_read_only",
        external_bling_calls:false,
        credentials:credentialStatus,
        bindings:{
          products:Number(productBindings.count||0),
          customers:Number(customerBindings.count||0),
          orders:Number(orderBindings.count||0)
        },
        readiness:readiness.data,
        make_runtime:"not_used_by_bling_hub_v2"
      });
    }

    if(action==="legacy_snapshot"){
      const {data,error}=await db.from("bling_legacy_queue_snapshot_v2").select("*").eq("id",1).maybeSingle();
      if(error)throw error;
      return json({ok:true,legacy:data});
    }

    if(action==="queue_summary"){
      const {data,error}=await db.from("bling_integration_jobs_v2").select("status,entity_type");
      if(error)throw error;
      const byStatus:any={},byEntity:any={};
      for(const row of data??[]){
        byStatus[row.status]=(byStatus[row.status]??0)+1;
        byEntity[row.entity_type]=(byEntity[row.entity_type]??0)+1;
      }
      return json({ok:true,by_status:byStatus,by_entity:byEntity,total:(data??[]).length});
    }

    return json({ok:false,error:"action_not_supported"},400);
  }catch(e){
    return json({ok:false,error:"bling_hub_error",detail:clean((e as Error)?.message,300)},500);
  }
});
