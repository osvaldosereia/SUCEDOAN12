import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const FIREBASE_PRODUCTS="https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos";
const PRODUCT_FIELDS="id,firebase_key,sku,name,gtin,ncm,price,cost,stock,image_url,brand,category,subcategory,subsubcategory,packaging,supplier,unit,validity_date,gondola,shelf,is_active,is_whatsapp_active,physically_verified,last_counted_at,source_system,updated_at";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const text=(v:unknown,max=300)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown,max=32)=>String(v??"").replace(/\D/g,"").slice(0,max);
const finite=(v:unknown)=>{if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n:null};
const isoDate=(v:unknown)=>{const s=text(v,40);return s.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0]||null};
const pick=(o:any,names:string[])=>{for(const n of names){const v=o?.[n];if(v!==undefined&&v!==null&&String(v).trim()!=="")return v}return null};
function variants(value:unknown){const base=digits(value)||text(value,120).toUpperCase();if(!base)return[];const out=[base];if(/^\d+$/.test(base)){if(base.length===12)out.push(`0${base}`);if(base.length===13&&base.startsWith("0"))out.push(base.slice(1));const noZero=base.replace(/^0+(?=\d)/,"");if(noZero)out.push(noZero)}return[...new Set(out)]}
async function firebaseGet(url:string){try{const r=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(7000)});if(!r.ok)return null;return await r.json()}catch{return null}}
async function findLegacy(code:string){const candidates=variants(code);for(const candidate of candidates){const data=await firebaseGet(`${FIREBASE_PRODUCTS}/${encodeURIComponent(candidate)}.json`);if(data&&typeof data==="object")return{key:candidate,product:data}}for(const field of ["gtin","ean","codigo","sku"]){for(const candidate of candidates){const orderBy=encodeURIComponent(JSON.stringify(field)),equalTo=encodeURIComponent(JSON.stringify(candidate));const data=await firebaseGet(`${FIREBASE_PRODUCTS}.json?orderBy=${orderBy}&equalTo=${equalTo}&limitToFirst=1`);if(!data||typeof data!=="object")continue;const entry=Object.entries(data)[0];if(entry&&entry[1]&&typeof entry[1]==="object")return{key:String(entry[0]),product:entry[1]}}}return null}
function legacyPayload(key:string,src:any,scanned:string){const gtin=digits(pick(src,["gtin","ean","codigo_barras","codigoBarras"])||scanned),rawActive=pick(src,["ativo","is_active"]),status=text(pick(src,["situacao","status"]),30).toUpperCase(),active=typeof rawActive==="boolean"?rawActive:!["I","INATIVO","INACTIVE"].includes(status);return{firebase_key:text(key,160)||null,sku:text(pick(src,["sku","codigo"]),120)||null,name:text(pick(src,["nome","name","titulo","codigo"]),300)||`EAN ${gtin||scanned}`,gtin:gtin||digits(scanned),ncm:digits(pick(src,["ncm"]),16)||null,price:finite(pick(src,["preco","price"])),cost:finite(pick(src,["preco_custo","custo","cost"])),stock:null,image_url:text(pick(src,["url_imagem","imagem_url","imagem"]),1200)||null,brand:text(pick(src,["marca","brand"]),160)||null,category:text(pick(src,["categoria","category"]),160)||null,subcategory:text(pick(src,["subcategoria","subcategory"]),160)||null,subsubcategory:text(pick(src,["subsubcategoria","subsubcategory"]),160)||null,packaging:text(pick(src,["embalagem","packaging"]),120)||null,supplier:text(pick(src,["fornecedor","supplier"]),200)||null,unit:text(pick(src,["unidade","unit"]),40)||null,validity_date:isoDate(pick(src,["validade","data_validade","validity_date"])),gondola:text(pick(src,["gondola","gôndola"]),80)||null,shelf:text(pick(src,["prateleira","shelf"]),80)||null,source_system:"inventory_fast_firebase",sync_status:"local",firebase_snapshot:src,is_active:active,is_whatsapp_active:false,physically_verified:false,metadata:{migrated_by:"inventory_fast_balance_v3",migrated_from:"firebase",migrated_at:new Date().toISOString()}}}
async function findSupabaseProduct(sb:any,code:string){for(const candidate of variants(code)){if(!/^\d+$/.test(candidate))continue;const {data}=await sb.from("products").select(PRODUCT_FIELDS).eq("gtin",candidate).limit(1).maybeSingle();if(data)return data}return null}
async function importLegacy(sb:any,legacy:any,code:string){const payload=legacyPayload(legacy.key,legacy.product,code);const current=await findSupabaseProduct(sb,payload.gtin);if(current)return current;let {data,error}=await sb.from("products").insert(payload).select(PRODUCT_FIELDS).single();if(!error&&data)return data;const raced=await findSupabaseProduct(sb,payload.gtin);if(raced)return raced;if(payload.sku){const retry={...payload,sku:null};const second=await sb.from("products").insert(retry).select(PRODUCT_FIELDS).single();data=second.data;error=second.error;if(!error&&data)return data;const racedAgain=await findSupabaseProduct(sb,payload.gtin);if(racedAgain)return racedAgain}throw error||new Error("firebase_import_failed")}
async function recentStates(sb:any){const cutoff=new Date(Date.now()-30*60*1000).toISOString();const {data}=await sb.from("inventory_fast_balance_state_v2").select("product_id,ean,quantity,window_started_at,last_scanned_at,expires_at,last_device_label,product:products(id,name,gtin,brand,packaging,image_url,stock,is_active,is_whatsapp_active,physically_verified,source_system)").gte("last_scanned_at",cutoff).order("last_scanned_at",{ascending:false}).limit(120);return data||[]}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({ok:false,error:"server_config"},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=text(body?.action||"health",40).toLowerCase(),deviceLabel=text(body?.device_label,120)||"Leitor-Rapido";
  if(action==="health")return json({ok:true,mode:"balance_only",access:"no_login",window_minutes:30,capture_queue:true,max_batch:100});
  if(action==="bootstrap"){
    const [{count:pendingAi},states]=await Promise.all([sb.from("unresolved_product_eans").select("id",{count:"exact",head:true}).in("status",["pending","researching","error"]),recentStates(sb)]);
    return json({ok:true,mode:"balance_only",access:"no_login",window_minutes:30,adopted:{adopted_products:0,closed_checkpoints:0},recent:states,pending_ai:pendingAi||0});
  }
  if(action==="recent")return json({ok:true,recent:await recentStates(sb)});
  if(action!=="scan_batch")return json({ok:false,error:"unknown_action"},400);

  const rawEvents=Array.isArray(body?.events)?body.events.slice(0,100):[];
  if(!rawEvents.length)return json({ok:true,applied:0,unknown:0,duplicates:0,stale:0,results:[],products:[]});
  const cleanEvents=rawEvents.map((e:any)=>({event_id:text(e?.event_id,80),ean:digits(e?.ean),scanned_at:text(e?.scanned_at,50)})).filter((e:any)=>/^[0-9a-f-]{36}$/i.test(e.event_id)&&e.ean.length>=5&&e.ean.length<=32);
  if(!cleanEvents.length)return json({ok:false,error:"no_valid_events"},400);

  const unique=[...new Set(cleanEvents.map((e:any)=>e.ean))];
  const resolved=new Map<string,{product:any|null,source:string}>();
  for(const ean of unique){
    let product=await findSupabaseProduct(sb,ean),source="supabase";
    if(!product){
      const legacy=await findLegacy(ean);
      if(legacy?.product){try{product=await importLegacy(sb,legacy,ean);source="firebase_imported"}catch{product=null}}
    }
    resolved.set(ean,{product:product||null,source:product?source:"none"});
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
