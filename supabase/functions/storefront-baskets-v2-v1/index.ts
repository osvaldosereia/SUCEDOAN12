import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const OFFICIAL=["Cestas Completas","Cestas Só Alimento","Kits Limpeza e Higiene","Kits Limpeza","Kits Higiene"];
const cors=(r:Request)=>{const o=r.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,apikey","Access-Control-Allow-Methods":"GET,OPTIONS"}};
const json=(r:Request,b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,n=120)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uuid=(v:unknown)=>{const s=clean(v,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
const cents=(v:unknown)=>Math.max(0,Math.round(Number(v||0)*100));

async function categories(){
  const q=await db.from("basket_categories").select("id,name,slug,sort_order").eq("is_active",true).in("name",OFFICIAL).order("sort_order");
  if(q.error)throw q.error;return q.data||[];
}
async function availabilityMap(){
  const q=await db.from("basket_v2_item_availability_v1").select("item_id,availability");if(q.error)throw q.error;
  return new Map((q.data||[]).map((x:any)=>[String(x.item_id),Math.max(0,Number(x.availability||0))]));
}
async function catalog(){
  const q=await db.from("basket_v2_items").select("id,public_name,image_url,description_short,sale_price,composition_mode,category:basket_categories(id,name,slug,sort_order)").eq("is_active",true).eq("paused",false).order("sort_order").order("public_name");
  if(q.error)throw q.error;const am=await availabilityMap();
  return (q.data||[]).map((x:any)=>({...x,availability:am.get(String(x.id))||0,price_cents:cents(x.sale_price)})).filter((x:any)=>x.availability > 0).map((x:any)=>({id:x.id,name:x.public_name,image_url:x.image_url||"",description:x.description_short||"",price_cents:x.price_cents,availability:x.availability,composition_mode:x.composition_mode,category:x.category}));
}
function safeProductLine(x:any){const p=x?.product||{};return {product_id:x?.product_id||p.id||null,name:p.name||"Produto",image_url:p.image_url||"",packaging:p.packaging||"",quantity:Number(x?.quantity_per_kit??x?.quantity??1)}}
function nextMountedProducts(detail:any){
  const lots=(Array.isArray(detail?.lots)?detail.lots:[]).filter((l:any)=>l?.status==='mounted'&&Number(l?.quantity_available||0)>0).sort((a:any,b:any)=>String(a?.mounted_at||'').localeCompare(String(b?.mounted_at||''))||String(a?.id||'').localeCompare(String(b?.id||'')));
  const current=lots[0];if(Array.isArray(current?.items)&&current.items.length)return current.items.map(safeProductLine);
  return (Array.isArray(detail?.product_components)?detail.product_components:[]).map(safeProductLine);
}
async function rawDetail(id:string){const q=await db.rpc("basket_v2_item_detail_admin_v1",{p_item_id:id});if(q.error)throw q.error;return q.data}
async function detail(id:string){
  const d=await rawDetail(id);if(!d?.item||d.item.is_active!==true||d.item.paused===true)return null;
  const aq=await db.from("basket_v2_item_availability_v1").select("availability").eq("item_id",id).maybeSingle();if(aq.error)throw aq.error;const availability=Math.max(0,Number(aq.data?.availability||0));if(availability<=0)return null;
  const categoryQ=await db.from("basket_categories").select("id,name,slug").eq("id",d.item.category_id).maybeSingle();if(categoryQ.error)throw categoryQ.error;
  const base={id:d.item.id,name:d.item.public_name,image_url:d.item.image_url||"",description:d.item.description_short||"",price_cents:cents(d.item.sale_price),availability,composition_mode:d.item.composition_mode,category:categoryQ.data||null};
  if(d.item.composition_mode==='products')return {...base,products:nextMountedProducts(d),components:[]};
  const components=[] as any[];
  for(const c of (Array.isArray(d.kit_components)?d.kit_components:[])){
    const childId=String(c.component_item_id||'');if(!uuid(childId))continue;const cd=await rawDetail(childId);if(!cd?.item)continue;
    components.push({item_id:childId,name:c.name||cd.item.public_name||"Cesta/Kit",quantity:Math.max(1,Number(c.quantity||1)),availability:Math.max(0,Number(c.availability||0)),sale_price_cents:cents(c.sale_price),products:nextMountedProducts(cd)});
  }
  return {...base,products:[],components};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='GET')return json(req,{ok:false,error:'method_not_allowed'},405);
  const u=new URL(req.url),action=clean(u.searchParams.get('action'),40)||'health';
  try{
    if(action==='health')return json(req,{ok:true,service:'storefront-baskets-v2-v1'});
    if(action==='categories')return json(req,{ok:true,categories:await categories()});
    if(action==='catalog')return json(req,{ok:true,categories:await categories(),items:await catalog()});
    if(action==='detail'){const id=uuid(u.searchParams.get('id'));if(!id)return json(req,{ok:false,error:'invalid_id'},400);const item=await detail(id);return item?json(req,{ok:true,item}):json(req,{ok:false,error:'not_available'},404);}
    return json(req,{ok:false,error:'unknown_action'},404);
  }catch(e){console.error('storefront-baskets-v2-v1',e);return json(req,{ok:false,error:'internal_error'},500)}
});
