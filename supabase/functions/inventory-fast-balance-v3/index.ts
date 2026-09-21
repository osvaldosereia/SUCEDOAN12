import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const PRODUCT_FIELDS="id,firebase_key,sku,name,gtin,ncm,price,cost,stock,image_url,brand,category,subcategory,subsubcategory,packaging,supplier,unit,validity_date,gondola,shelf,is_active,is_whatsapp_active,physically_verified,last_counted_at,source_system,updated_at";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const text=(v:unknown,max=300)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown,max=32)=>String(v??"").replace(/\D/g,"").slice(0,max);
function variants(value:unknown){const base=digits(value)||text(value,120).toUpperCase();if(!base)return[];const out=[base];if(/^\d+$/.test(base)){if(base.length===12)out.push(`0${base}`);if(base.length===13&&base.startsWith("0"))out.push(base.slice(1));const noZero=base.replace(/^0+(?=\d)/,"");if(noZero)out.push(noZero)}return[...new Set(out)]}
async function recentStates(sb:any){const cutoff=new Date(Date.now()-30*60*1000).toISOString();const {data}=await sb.from("inventory_fast_balance_state_v2").select("product_id,ean,quantity,window_started_at,last_scanned_at,expires_at,last_device_label,product:products(id,name,gtin,brand,packaging,image_url,stock,is_active,is_whatsapp_active,physically_verified,source_system)").gte("last_scanned_at",cutoff).order("last_scanned_at",{ascending:false}).limit(120);return data||[]}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({ok:false,error:"server_config"},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=text(body?.action||"health",40).toLowerCase(),deviceLabel=text(body?.device_label,120)||"Leitor-Rapido";
  if(action==="health")return json({ok:true,mode:"balance_only",access:"no_login",source:"supabase_only",window_minutes:30,capture_queue:true,max_batch:100,quantity_mode:true});
  if(action==="bootstrap"){
    const [{count:pendingAi},states]=await Promise.all([sb.from("unresolved_product_eans").select("id",{count:"exact",head:true}).in("status",["pending","researching","error"]),recentStates(sb)]);
    return json({ok:true,mode:"balance_only",access:"no_login",window_minutes:30,adopted:{adopted_products:0,closed_checkpoints:0},recent:states,pending_ai:pendingAi||0});
  }
  if(action==="recent")return json({ok:true,recent:await recentStates(sb)});
  if(action!=="scan_batch")return json({ok:false,error:"unknown_action"},400);

  const rawEvents=Array.isArray(body?.events)?body.events.slice(0,100):[];
  if(!rawEvents.length)return json({ok:true,applied:0,unknown:0,duplicates:0,stale:0,results:[],products:[]});
  const cleanEvents=rawEvents.map((e:any)=>({
    event_id:text(e?.event_id,80),
    ean:digits(e?.ean),
    scanned_at:text(e?.scanned_at,50),
    quantity:Number.isFinite(Number(e?.quantity))?Math.max(0,Math.min(1000000,Math.trunc(Number(e.quantity)))):null
  })).filter((e:any)=>/^[0-9a-f-]{36}$/i.test(e.event_id)&&e.ean.length>=5&&e.ean.length<=32);
  if(!cleanEvents.length)return json({ok:false,error:"no_valid_events"},400);

  const unique=[...new Set(cleanEvents.map((e:any)=>e.ean))];
  const resolved=new Map<string,{product:any|null,source:string}>();
  for(const ean of unique){
    const product=await findSupabaseProduct(sb,ean);
    resolved.set(ean,{product:product||null,source:product?"supabase":"none"});
  }

  const rpcEvents=cleanEvents.map((e:any)=>{const hit=resolved.get(e.ean);return{...e,product_id:hit?.product?.id||null,source:hit?.source||"none"}});
  const {data:applied,error:applyError}=await sb.rpc("apply_inventory_fast_scan_events_v3",{p_user_id:null,p_device_label:deviceLabel,p_events:rpcEvents});
  if(applyError)return json({ok:false,error:"batch_apply_failed",detail:applyError.message},500);

  const ids=[...new Set([...resolved.values()].map(v=>v.product?.id).filter(Boolean))];
  let products:any[]=[];
  if(ids.length){const {data}=await sb.from("products").select(PRODUCT_FIELDS).in("id",ids);products=data||[]}
  const sourceByProduct:Object=Object.fromEntries([...resolved.entries()].filter(([,v])=>v.product?.id).map(([ean,v])=>[v.product.id,{ean,source:v.source}]));
  return json({ok:true,...(applied||{}),products,source_by_product:sourceByProduct});
});
