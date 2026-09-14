import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(v:unknown)=>{const x=clean(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x)?x:""};

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({ok:false,error:"origin_not_allowed"},403,null);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405,origin);

  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!service)return json({ok:false,error:"server_config"},500,origin);
  const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=req.headers.get("authorization")||"",token=auth.replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({ok:false,error:"admin_session_required"},401,origin);
  const {data:userData,error:userError}=await sb.auth.getUser(token),user=userData?.user;
  if(userError||!user)return json({ok:false,error:"admin_session_invalid"},401,origin);
  const {data:admin,error:adminError}=await sb.from("admin_users").select("role,is_active").eq("user_id",user.id).eq("is_active",true).maybeSingle();
  if(adminError||!admin||!["owner","admin"].includes(String(admin.role||"")))return json({ok:false,error:"admin_forbidden"},403,origin);

  let body:any={};
  try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400,origin)}
  const action=clean(body?.action,60).toLowerCase();

  if(action==="list_bad_image_ids"){
    const {data,error}=await sb.rpc("list_product_image_bad_grid18_v1");
    if(error)return json({ok:false,error:"bad_image_list_failed",detail:clean(error.message,300)},500,origin);
    const payload=data&&typeof data==="object"?data:{};
    return json({ok:true,count:Number((payload as any).count||0),product_ids:Array.isArray((payload as any).product_ids)?(payload as any).product_ids:[]},200,origin);
  }

  if(action==="bulk_regenerate_grid18"){
    const allBad=body?.all_bad===true;
    const rawIds=Array.isArray(body?.product_ids)?body.product_ids:[];
    const productIds=[...new Set(rawIds.map(uuid).filter(Boolean))].slice(0,2000);
    if(!allBad&&!productIds.length)return json({ok:false,error:"invalid_product_ids"},400,origin);

    const {data:queued,error:queueError}=await sb.rpc("queue_product_image_bad_grid18_v1",{
      p_product_ids:productIds.length?productIds:null,
      p_all_bad:allBad
    });
    if(queueError)return json({ok:false,error:"bulk_grid18_queue_failed",detail:clean(queueError.message,300)},500,origin);
    const q=queued&&typeof queued==="object"?queued:{};
    const queuedCount=Number((q as any).queued||0);
    let restart:any=null,dispatch:any=null;
    if(queuedCount>0){
      const r=await sb.rpc("restart_product_image_grid18_drain_v1");
      if(r.error)return json({ok:false,error:"bulk_grid18_restart_failed",detail:clean(r.error.message,300),queue:q},500,origin);
      restart=r.data||null;
      const d=await sb.rpc("dispatch_product_image_grid18_worker_v2");
      if(d.error)return json({ok:false,error:"bulk_grid18_dispatch_failed",detail:clean(d.error.message,300),queue:q,restart},500,origin);
      dispatch=d.data||null;
    }
    return json({
      ok:true,
      queued:queuedCount,
      skipped:Number((q as any).skipped||0),
      requested:Number((q as any).requested||queuedCount),
      batches_expected:Number((q as any).batches_expected||Math.ceil(queuedCount/18)),
      mode:"grid_3x6_18",
      quality:"medium",
      stricter_prompt:true,
      restart,
      dispatch
    },200,origin);
  }

  return json({ok:false,error:"unknown_action"},400,origin);
});
