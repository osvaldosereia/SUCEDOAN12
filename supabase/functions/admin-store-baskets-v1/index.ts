import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br","http://localhost:3000","http://127.0.0.1:3000"]);
const MUTATIONS=new Set(["save","component_edit","reserve","mount","cancel"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(value:unknown,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(value:unknown)=>{const s=clean(value,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const money=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=9999999?Math.round(n*100)/100:null};
const integer=(value:unknown,min=1,max=500)=>{const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:null};
const quantity=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>0&&n<=999?Math.round(n*1000)/1000:null};
const num=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)?n:0};

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required",role:""};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid",role:""};
  const row=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed",role:""};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized",role:""};
  return {ok:true as const,status:200,user_id:String(user.data.user.id),role:String(row.data.role||"viewer")};
}

function rpcError(error:any){
  const detail=clean(error?.message||error,1000);
  const codes=["store_basket_required","store_basket_not_found","store_basket_name_invalid","store_basket_price_invalid","store_basket_image_invalid","store_basket_kits_invalid","store_basket_kit_unavailable","store_basket_kit_duplicate","store_basket_kit_quantity_invalid","store_basket_category_missing","store_basket_quantity_invalid","store_basket_recipe_empty","store_basket_product_unavailable","store_basket_kit_required","store_basket_component_required","store_basket_component_action_invalid","store_basket_kit_not_linked","store_basket_component_not_found","store_basket_component_quantity_invalid","store_basket_replacement_required","store_basket_replacement_unavailable","store_basket_component_last_item","insufficient_loose_stock","store_basket_build_not_found","store_basket_reservation_required","store_basket_reservation_not_mountable","store_basket_reservation_not_cancellable","store_basket_reservation_already_sellable","store_basket_not_available","lot_reservation_mismatch","lot_has_order_history"];
  const code=codes.find(x=>detail.includes(x))||"store_basket_operation_failed";
  if(["store_basket_not_found","store_basket_build_not_found"].includes(code))return {error:code,status:404,message:"Cesta ou montagem não encontrada."};
  if(code==="insufficient_loose_stock")return {error:code,status:409,message:"Estoque avulso insuficiente para reservar esta quantidade."};
  if(code==="store_basket_product_unavailable")return {error:code,status:409,message:"A receita possui produto ou kit inativo. Revise a composição antes de reservar."};
  if(code==="store_basket_component_last_item")return {error:code,status:409,message:"Este é o último produto do kit. Remova o kit inteiro da cesta em vez de deixá-lo vazio."};
  if(code==="store_basket_replacement_unavailable")return {error:code,status:409,message:"O produto escolhido para substituição está inativo ou indisponível."};
  if(["store_basket_reservation_not_mountable","store_basket_reservation_not_cancellable","store_basket_reservation_already_sellable","store_basket_not_available","lot_reservation_mismatch","lot_has_order_history"].includes(code))return {error:code,status:409,message:"O estado atual desta montagem não permite a operação solicitada."};
  if(code==="store_basket_operation_failed")return {error:code,status:500,message:"Não foi possível concluir a operação de Cestas do Site."};
  if(["store_basket_kit_unavailable","store_basket_kit_duplicate","store_basket_recipe_empty","store_basket_kit_not_linked"].includes(code))return {error:code,status:409,message:"Revise os kits internos usados nesta cesta."};
  return {error:code,status:400,message:"Revise os dados da Cesta do Site."};
}

async function basketComposition(basketId:string){
  const linksQ=await db.from("store_basket_recipe_kits").select("kit_id,quantity,sort_order").eq("basket_id",basketId).order("sort_order");
  if(linksQ.error)throw linksQ.error;
  const links=linksQ.data||[];
  if(!links.length)return [];

  const kitIds=[...new Set(links.map((x:any)=>String(x.kit_id)).filter(Boolean))];
  const [kitsQ,itemsQ]=await Promise.all([
    db.from("assembly_kits").select("id,name,type").in("id",kitIds),
    db.from("assembly_kit_items").select("kit_id,product_id,quantity,sort_order").in("kit_id",kitIds).order("sort_order")
  ]);
  if(kitsQ.error)throw kitsQ.error;if(itemsQ.error)throw itemsQ.error;
  const items=itemsQ.data||[],productIds=[...new Set(items.map((x:any)=>String(x.product_id)).filter(Boolean))];
  if(!productIds.length)return [];

  const [productsQ,stockQ]=await Promise.all([
    db.from("products").select("id,name,sku,gtin,packaging,image_url,cost,price,is_active").in("id",productIds),
    db.from("ops2_loose_sellable_stock_v1").select("product_id,effective_sellable_stock,basket_locked_quantity,loose_sellable_stock,sellable_physical").in("product_id",productIds)
  ]);
  if(productsQ.error)throw productsQ.error;if(stockQ.error)throw stockQ.error;

  const kits=new Map((kitsQ.data||[]).map((k:any)=>[String(k.id),k]));
  const products=new Map((productsQ.data||[]).map((p:any)=>[String(p.id),p]));
  const stocks=new Map((stockQ.data||[]).map((s:any)=>[String(s.product_id),s]));
  const linkByKit=new Map(links.map((l:any)=>[String(l.kit_id),l]));
  const grouped=new Map<string,any>();
  for(const item of items){
    const productId=String(item.product_id),kitId=String(item.kit_id),link:any=linkByKit.get(kitId)||{},kit:any=kits.get(kitId)||{};
    const contribution=num(item.quantity)*num(link.quantity||1);if(contribution<=0)continue;
    let row=grouped.get(productId);
    if(!row){const p:any=products.get(productId)||{id:productId,name:"Produto"},s:any=stocks.get(productId)||{};row={product_id:productId,name:p.name||"Produto",sku:p.sku||null,gtin:p.gtin||null,packaging:p.packaging||"",image_url:p.image_url||"",cost_price:num(p.cost),sale_price:num(p.price),is_active:p.is_active!==false,physical_stock:num(s.sellable_physical??s.effective_sellable_stock),basket_locked_quantity:num(s.basket_locked_quantity),loose_sellable_stock:num(s.loose_sellable_stock),quantity_per_basket:0,kit_sources:[],sort_order:Number(link.sort_order||0)*1000+Number(item.sort_order||0)};grouped.set(productId,row)}
    row.quantity_per_basket+=contribution;row.kit_sources.push({kit_id:kitId,name:kit.name||"Kit",type:kit.type||"other",quantity:contribution});
  }
  return [...grouped.values()].sort((a,b)=>a.sort_order-b.sort_order||String(a.name).localeCompare(String(b.name),"pt-BR"));
}

async function list(){const q=await db.rpc("store_basket_recipe_catalog_v1");if(q.error)return rpcError(q.error);return {baskets:Array.isArray(q.data?.baskets)?q.data.baskets:[]}}
async function editor(input:any){const basketId=uuid(input?.basket_id||input?.id);if(!basketId)return {error:"store_basket_required",status:400};const q=await db.rpc("store_basket_recipe_editor_v1",{p_basket_id:basketId});if(q.error)return rpcError(q.error);const products=await basketComposition(basketId);return {editor:{...(q.data||{}),products}}}
async function save(input:any){const basketId=input?.basket_id?uuid(input.basket_id):null;if(input?.basket_id&&!basketId)return {error:"store_basket_required",status:400};const price=money(input?.sale_price);if(price===null)return {error:"store_basket_price_invalid",status:400};const kits=Array.isArray(input?.kits)?input.kits.slice(0,20):null;if(!kits||!kits.length)return {error:"store_basket_kits_invalid",status:400};const q=await db.rpc("save_store_basket_recipe_v1",{p_basket_id:basketId,p_name:clean(input?.name,180),p_sale_price:price,p_image_url:clean(input?.image_url,1000)||null,p_kits:kits,p_operator:clean(input?.operator,80)||"Operação"});if(q.error)return rpcError(q.error);return {result:q.data}}
async function componentEdit(input:any){
  const basketId=uuid(input?.basket_id),kitId=uuid(input?.kit_id),productId=uuid(input?.product_id),action=clean(input?.edit_action||input?.component_action,40);
  if(!basketId)return {error:"store_basket_required",status:400};if(!kitId)return {error:"store_basket_kit_required",status:400};if(!productId)return {error:"store_basket_component_required",status:400};
  if(!["set_quantity","replace","remove"].includes(action))return {error:"store_basket_component_action_invalid",status:400};
  const newProductId=action==="replace"?uuid(input?.new_product_id):null;if(action==="replace"&&!newProductId)return {error:"store_basket_replacement_required",status:400};
  const componentQty=action==="set_quantity"?quantity(input?.quantity):null;if(action==="set_quantity"&&componentQty===null)return {error:"store_basket_component_quantity_invalid",status:400};
  const q=await db.rpc("edit_store_basket_component_v1",{p_basket_id:basketId,p_kit_id:kitId,p_product_id:productId,p_action:action,p_new_product_id:newProductId,p_quantity:componentQty,p_operator:clean(input?.operator,80)||"Operação"});
  if(q.error)return rpcError(q.error);return {result:q.data};
}
async function preview(input:any){const basketId=uuid(input?.basket_id||input?.id),qv=integer(input?.quantity);if(!basketId)return {error:"store_basket_required",status:400};if(!qv)return {error:"store_basket_quantity_invalid",status:400};const q=await db.rpc("preview_store_basket_recipe_v1",{p_basket_id:basketId,p_quantity:qv});if(q.error)return rpcError(q.error);return {preview:q.data}}
async function builds(input:any){const basketId=uuid(input?.basket_id||input?.id);if(!basketId)return {error:"store_basket_required",status:400};const q=await db.rpc("store_basket_builds_v1",{p_basket_id:basketId});if(q.error)return rpcError(q.error);return {builds:Array.isArray(q.data?.builds)?q.data.builds:[]}}
async function buildDetail(input:any){const lotId=uuid(input?.lot_id||input?.id);if(!lotId)return {error:"store_basket_build_not_found",status:400};const q=await db.rpc("store_basket_build_detail_v1",{p_lot_id:lotId});if(q.error)return rpcError(q.error);if(!q.data)return {error:"store_basket_build_not_found",status:404};return {build:q.data}}
async function reserve(input:any){const basketId=uuid(input?.basket_id||input?.id),qv=integer(input?.quantity);if(!basketId)return {error:"store_basket_required",status:400};if(!qv)return {error:"store_basket_quantity_invalid",status:400};const q=await db.rpc("reserve_store_basket_recipe_v1",{p_basket_id:basketId,p_quantity:qv,p_operator:clean(input?.operator,80)||"Operação",p_notes:clean(input?.notes,500)||null});if(q.error)return rpcError(q.error);return {reservation:q.data}}
async function mount(input:any){const lotId=uuid(input?.lot_id||input?.id);if(!lotId)return {error:"store_basket_build_not_found",status:400};const q=await db.rpc("mount_store_basket_reservation_v1",{p_lot_id:lotId,p_operator:clean(input?.operator,80)||"Operação"});if(q.error)return rpcError(q.error);return {build:q.data}}
async function cancel(input:any){const lotId=uuid(input?.lot_id||input?.id);if(!lotId)return {error:"store_basket_build_not_found",status:400};const q=await db.rpc("cancel_store_basket_reservation_v1",{p_lot_id:lotId,p_operator:clean(input?.operator,80)||"Operação",p_reason:clean(input?.reason,500)||null});if(q.error)return rpcError(q.error);return {build:q.data}}

Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});if(!["GET","POST"].includes(req.method))return json(req,{ok:false,error:"method_not_allowed"},405);if(!U||!K)return json(req,{ok:false,error:"server_config"},500);try{const auth:any=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);const url=new URL(req.url);let body:any={};if(req.method==="POST"){try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}}const input:any={...Object.fromEntries(url.searchParams.entries()),...body};const action=clean(input?.action,40);if(MUTATIONS.has(action)&&auth.role==="viewer")return json(req,{ok:false,error:"forbidden",message:"Perfil de consulta não pode alterar Cestas do Site."},403);let result:any;if(action==="list")result=await list();else if(action==="editor")result=await editor(input);else if(action==="save")result=await save(input);else if(action==="component_edit")result=await componentEdit(input);else if(action==="preview")result=await preview(input);else if(action==="builds")result=await builds(input);else if(action==="build_detail")result=await buildDetail(input);else if(action==="reserve")result=await reserve(input);else if(action==="mount")result=await mount(input);else if(action==="cancel")result=await cancel(input);else return json(req,{ok:false,error:"unknown_action"},404);if(result?.error)return json(req,{ok:false,...result},result.status||400);return json(req,{ok:true,...result})}catch(error){console.error("admin-store-baskets-v1",error);return json(req,{ok:false,error:"internal_error"},500)}});
