import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const OFFICIAL_CATEGORIES=["Cestas Completas","Cestas Só Alimento","Kits Limpeza e Higiene","Kits Limpeza","Kits Higiene"];
const cors=(r:Request)=>{const o=r.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(o)?o:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}};
const json=(r:Request,b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,n=160)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uuid=(v:unknown)=>{const s=clean(v,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null};
function validMoney(v:unknown){const n=Number(v);if(!Number.isFinite(n)||n<=0)return null;return Math.round(n*100)/100}
function moneyCents(v:unknown){const n=validMoney(v);return n===null?null:Math.round(n*100)}

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required"};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid"};
  const row=await db.from("admin_users").select("user_id,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed"};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized"};
  return {ok:true as const,status:200,user_id:user.data.user.id};
}
async function readBody(req:Request){try{const raw=await req.text();if(raw.length>100000)return {ok:false as const,error:"payload_too_large"};const body=raw.trim()?JSON.parse(raw):{};if(!body||typeof body!=="object"||Array.isArray(body))return {ok:false as const,error:"invalid_body"};return {ok:true as const,body:body as Record<string,any>}}catch{return {ok:false as const,error:"invalid_json"}}}
async function rpc(name:string,args:Record<string,unknown>){const q=await db.rpc(name,args);if(q.error)throw q.error;return q.data}

async function stockMap(ids:string[]){
  const out=new Map<string,number>();const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return out;
  for(let i=0;i<unique.length;i+=80){
    const q=await db.from("ops2_loose_sellable_stock_v1").select("product_id,loose_sellable_stock").in("product_id",unique.slice(i,i+80));
    if(q.error)throw q.error;for(const x of q.data||[])out.set(String(x.product_id),Math.max(0,Number(x.loose_sellable_stock||0)));
  }
  return out;
}
function mapProduct(p:any,stock:Map<string,number>){return {id:p.id,name:p.name||"",sku:p.sku||"",gtin:p.gtin||"",image_url:p.image_url||"",packaging:p.packaging||p.unit||"",cost:validMoney(p.cost),price:validMoney(p.price),loose_stock:Number(stock.get(String(p.id))||0)}}

async function listItems(){
  const q=await db.from("basket_v2_items").select("id,public_name,category_id,image_url,sale_price,composition_mode,paused,is_active,sort_order,category:basket_categories(id,name,slug)").eq("is_active",true).order("sort_order").order("public_name");
  if(q.error)throw q.error;
  const av=await db.from("basket_v2_item_availability_v1").select("item_id,availability");if(av.error)throw av.error;const am=new Map((av.data||[]).map((x:any)=>[String(x.item_id),Number(x.availability||0)]));
  return {categories:OFFICIAL_CATEGORIES,items:(q.data||[]).map((x:any)=>{const availability=am.get(String(x.id))||0;return {id:x.id,public_name:x.public_name,category:x.category,price_cents:Math.round(Number(x.sale_price||0)*100),availability,composition_mode:x.composition_mode,state:x.paused?"paused":availability>0?"selling":"out_of_stock",image_url:x.image_url||""}})};
}
function enrichDetail(detail:any){
  if(!detail?.item)return detail;
  const components=(Array.isArray(detail.kit_components)?detail.kit_components:[]).map((c:any)=>({
    item_id:c.component_item_id,
    name:c.name||"",
    quantity:Math.max(1,Number(c.quantity||1)),
    availability:Math.max(0,Number(c.availability||0)),
    current_cost_cents:moneyCents(c.current_cost),
    retail_products_cents:moneyCents(c.retail_products_total),
    sale_price_cents:moneyCents(c.sale_price),
  }));
  if(detail.item.composition_mode!=="combined_kits")return {...detail,kit_components:components};
  const cost_total_cents=components.length&&components.every((c:any)=>c.current_cost_cents!==null)?components.reduce((s:number,c:any)=>s+c.current_cost_cents*c.quantity,0):null;
  const retail_products_total_cents=components.length&&components.every((c:any)=>c.retail_products_cents!==null)?components.reduce((s:number,c:any)=>s+c.retail_products_cents*c.quantity,0):null;
  const component_sales_total_cents=components.length&&components.every((c:any)=>c.sale_price_cents!==null)?components.reduce((s:number,c:any)=>s+c.sale_price_cents*c.quantity,0):null;
  const final_sale_price_cents=moneyCents(detail.item.sale_price);
  const commercial_adjustment_cents=final_sale_price_cents!==null&&component_sales_total_cents!==null?final_sale_price_cents-component_sales_total_cents:null;
  return {...detail,kit_components:components,summary:{cost_total_cents,retail_products_total_cents,component_sales_total_cents,final_sale_price_cents,commercial_adjustment_cents,availability:Math.max(0,Number(detail.availability||0))}};
}
async function detail(id:string){const q=await db.rpc("basket_v2_item_detail_admin_v1",{p_item_id:id});if(q.error)throw q.error;return enrichDetail(q.data)}
async function productSearch(u:URL){
  const term=clean(u.searchParams.get("q"),100).replace(/[,()%]/g," ");const limit=Math.max(1,Math.min(30,Number(u.searchParams.get("limit")||15)));if(term.length<2)return {products:[]};
  let q=db.from("products").select("id,name,sku,gtin,image_url,packaging,unit,cost,price").eq("is_active",true);
  for(const t of term.split(/\s+/).filter(Boolean).slice(0,4))q=q.or(`name.ilike.%${t}%,gtin.ilike.%${t}%,sku.ilike.%${t}%`);
  const r=await q.order("name").limit(limit);if(r.error)throw r.error;const sm=await stockMap((r.data||[]).map((x:any)=>String(x.id)));return {products:(r.data||[]).map((p:any)=>mapProduct(p,sm))};
}
async function productSuggestions(u:URL){
  const pid=uuid(u.searchParams.get("product_id"));if(!pid)return {error:"invalid_product",status:400};
  const membership=await db.from("basket_lot_substitution_products").select("family_key").eq("product_id",pid).maybeSingle();if(membership.error)throw membership.error;const family=membership.data?.family_key;if(!family)return {family_key:null,suggestions:[]};
  const rule=await db.from("basket_lot_substitution_rules").select("enabled,label").eq("family_key",family).maybeSingle();if(rule.error)throw rule.error;if(rule.data?.enabled!==true)return {family_key:family,family_label:rule.data?.label||family,suggestions:[]};
  const members=await db.from("basket_lot_substitution_products").select("product_id").eq("family_key",family);if(members.error)throw members.error;const ids=(members.data||[]).map((x:any)=>String(x.product_id));
  const r=await db.from("products").select("id,name,sku,gtin,image_url,packaging,unit,cost,price").eq("is_active",true).in("id",ids);if(r.error)throw r.error;const sm=await stockMap(ids);const rows=(r.data||[]).filter((p:any)=>String(p.id)!==pid).map((p:any)=>mapProduct(p,sm)).sort((a:any,b:any)=>(b.loose_stock>0?1:0)-(a.loose_stock>0?1:0)||b.loose_stock-a.loose_stock||a.name.localeCompare(b.name,"pt-BR"));
  return {family_key:family,family_label:rule.data?.label||family,suggestions:rows};
}
async function componentCandidates(u:URL){
  const term=clean(u.searchParams.get("q"),100);let q=db.from("basket_v2_items").select("id,public_name,image_url,sale_price,category:basket_categories(id,name,slug)").eq("is_active",true).eq("composition_mode","products");if(term)q=q.ilike("public_name",`%${term}%`);const r=await q.order("public_name").limit(50);if(r.error)throw r.error;
  const ids=(r.data||[]).map((x:any)=>String(x.id));const av=ids.length?await db.from("basket_v2_item_availability_v1").select("item_id,availability").in("item_id",ids):{data:[],error:null};if(av.error)throw av.error;const fm=ids.length?await db.from("basket_v2_item_financials_v1").select("item_id,current_cost,retail_products_total,sale_price").in("item_id",ids):{data:[],error:null};if(fm.error)throw fm.error;const am=new Map((av.data||[]).map((x:any)=>[String(x.item_id),Number(x.availability||0)])),mm=new Map((fm.data||[]).map((x:any)=>[String(x.item_id),x]));
  return {items:(r.data||[]).map((x:any)=>({id:x.id,public_name:x.public_name,image_url:x.image_url||"",category:x.category,availability:am.get(String(x.id))||0,current_cost:validMoney(mm.get(String(x.id))?.current_cost),retail_products_total:validMoney(mm.get(String(x.id))?.retail_products_total),sale_price:validMoney(x.sale_price)}))};
}

async function handleWrite(action:string,body:Record<string,any>,auth:any){
  const operator=clean(body.operator||auth.user_id,80)||"Operação";
  if(action==="item_save")return rpc("basket_v2_item_save_v1",{p_item:body,p_operator:operator});
  if(action==="item_duplicate"){const itemId=uuid(body.item_id);if(!itemId)throw new Error("invalid_id");return rpc("basket_v2_item_duplicate_v1",{p_item_id:itemId,p_operator:operator});}
  if(action==="item_pause"){const itemId=uuid(body.item_id);if(!itemId)throw new Error("invalid_id");return rpc("basket_v2_item_pause_v1",{p_item_id:itemId,p_paused:body.paused===true,p_operator:operator});}
  if(action==="product_components_save"){const itemId=uuid(body.item_id);if(!itemId||!Array.isArray(body.components))throw new Error("invalid_components");return rpc("basket_v2_product_components_save_v1",{p_item_id:itemId,p_components:body.components,p_operator:operator});}
  if(action==="kit_components_save"){const itemId=uuid(body.item_id);if(!itemId||!Array.isArray(body.components))throw new Error("invalid_components");return rpc("basket_v2_kit_components_save_v1",{p_item_id:itemId,p_components:body.components,p_operator:operator});}
  if(action==="lot_draft_save"){
    const itemId=uuid(body.item_id),lotId=body.lot_id?uuid(body.lot_id):null,quantity=Number(body.quantity);
    if(!itemId||!Number.isInteger(quantity)||quantity<1||!Array.isArray(body.items))throw new Error("invalid_lot");
    const items=body.items.map((x:any,i:number)=>({product_id:uuid(x?.product_id),quantity_per_kit:Number(x?.quantity_per_kit??x?.quantity),position_order:Number.isFinite(Number(x?.position_order))?Number(x.position_order):i})).filter((x:any)=>x.product_id&&x.quantity_per_kit>0);
    if(!items.length)throw new Error("invalid_lot_items");
    return rpc("basket_v2_lot_draft_save_v1",{p_item_id:itemId,p_lot_id:lotId,p_quantity:quantity,p_items:items,p_operator:operator});
  }
  if(action==="lot_mount"){
    const lotId=uuid(body.lot_id);if(!lotId)throw new Error("invalid_lot_id");
    return rpc("basket_v2_lot_mount_v1",{p_lot_id:lotId,p_operator:operator});
  }
  if(action==="lot_delete_draft"){
    const lotId=uuid(body.lot_id);if(!lotId)throw new Error("invalid_lot_id");
    return rpc("basket_v2_lot_draft_delete_v1",{p_lot_id:lotId,p_operator:operator});
  }
  throw new Error("unknown_action");
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const u=new URL(req.url),action=clean(u.searchParams.get("action"),50)||"health";
  if(action==="health")return json(req,{ok:true,service:"admin-baskets-v2-v1",categories:OFFICIAL_CATEGORIES});
  const auth=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
  try{
    if(req.method==="GET"){
      if(action==="list")return json(req,{ok:true,...await listItems()});
      if(action==="detail"){const itemId=uuid(u.searchParams.get("id"));if(!itemId)return json(req,{ok:false,error:"invalid_id"},400);return json(req,{ok:true,detail:await detail(itemId)});}
      if(action==="product_search")return json(req,{ok:true,...await productSearch(u)});
      if(action==="product_suggestions"){const out:any=await productSuggestions(u);return out.error?json(req,{ok:false,error:out.error},out.status||400):json(req,{ok:true,...out});}
      if(action==="component_candidates")return json(req,{ok:true,...await componentCandidates(u)});
      return json(req,{ok:false,error:"unknown_action"},404);
    }
    if(req.method==="POST"){
      const parsed=await readBody(req);if(!parsed.ok)return json(req,{ok:false,error:parsed.error},400);
      const allowed=new Set(["item_save","item_duplicate","item_pause","product_components_save","kit_components_save","lot_draft_save","lot_mount","lot_delete_draft"]);if(!allowed.has(action))return json(req,{ok:false,error:"unknown_action"},404);
      const result=await handleWrite(action,parsed.body,auth);return json(req,{ok:true,result});
    }
    return json(req,{ok:false,error:"method_not_allowed"},405);
  }catch(e){const message=String((e as any)?.message||e||"internal_error");console.error("admin-baskets-v2-v1",message);const known=message.startsWith("basket_v2_")||message.startsWith("invalid_")||message==="unknown_action";return json(req,{ok:false,error:known?message:"internal_error"},known?409:500)}
});
