import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});

const ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br","http://localhost:3000","http://127.0.0.1:3000"]);
const MUTATIONS=new Set(["model_save","recipe_kits_save","lot_reserve","lot_update","lot_mount","lot_cancel","lot_reopen"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br","Vary":"Origin","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(value:unknown,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(value:unknown)=>{const s=clean(value,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const integer=(value:unknown,min=1,max=500)=>{const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:null};
const money=(value:unknown)=>{if(value===null||value===undefined||value==="")return null;const n=Number(value);return Number.isFinite(n)&&n>=0&&n<=9999999?Math.round(n*100)/100:null};
const list=(value:unknown,max=120)=>Array.isArray(value)?value.slice(0,max):null;
const num=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)?n:0};

async function adminAuth(req:Request){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return {ok:false as const,status:401,error:"admin_auth_required",role:""};
  const user=await db.auth.getUser(token);
  if(user.error||!user.data?.user?.id)return {ok:false as const,status:401,error:"admin_session_invalid",role:""};
  const row=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",user.data.user.id).eq("is_active",true).maybeSingle();
  if(row.error)return {ok:false as const,status:500,error:"admin_auth_lookup_failed",role:""};
  if(!row.data?.user_id)return {ok:false as const,status:403,error:"admin_not_authorized",role:""};
  return {ok:true as const,status:200,user_id:user.data.user.id,role:String(row.data.role||"viewer")};
}

const DOMAIN_ERRORS=[
  "basket_not_found","basket_kit_template_not_found","lot_not_found","guided_reserved_lot_required",
  "basket_positions_invalid","basket_name_invalid","basket_category_required","basket_price_invalid","basket_image_invalid","position_product_invalid","position_product_unavailable","position_family_invalid","position_product_not_in_family",
  "position_label_invalid","position_quantity_invalid","position_quantity_out_of_bounds","duplicate_product_confirmation_required",
  "basket_recipe_kits_invalid","basket_recipe_kit_invalid","basket_recipe_kit_unavailable","basket_recipe_kit_duplicate","basket_recipe_kit_quantity_invalid","basket_recipe_kit_required_invalid",
  "invalid_lot_quantity","empty_lot_composition","invalid_lot_product","invalid_kit_template_item","invalid_lot_component_quantity",
  "fixed_position_quantity_changed","required_position_missing","insufficient_loose_stock","invalid_sale_price","invalid_public_name",
  "invalid_linked_lot","linked_price_exceeds_total","kit_short_code_in_use","invalid_kit_short_code","reserved_lot_not_editable",
  "reserved_lot_not_mountable","lot_sale_must_be_disabled","lot_has_order_history","lot_is_dependency","lot_already_changed",
  "lot_not_editable","kit_lot_required","lot_not_cancellable","lot_reservation_mismatch","linked_lot_unavailable"
];
const PT:Record<string,string>={
  insufficient_loose_stock:"Estoque avulso insuficiente para reservar este lote.",
  lot_has_order_history:"Este lote já possui histórico de pedido e não pode ser alterado desta forma.",
  lot_is_dependency:"Este lote está vinculado a outro lote e não pode ser alterado agora.",
  lot_sale_must_be_disabled:"Desative a venda deste lote antes de alterar a montagem.",
  linked_lot_unavailable:"O lote vinculado não está disponível para esta operação.",
  basket_not_found:"Cesta ou kit não encontrado.",
  basket_kit_template_not_found:"Composição operacional não encontrada.",
  basket_recipe_kits_invalid:"Revise os kits internos vinculados à cesta.",
  basket_recipe_kit_unavailable:"Um dos kits internos está inativo ou indisponível.",
  basket_recipe_kit_duplicate:"O mesmo kit interno não pode ser vinculado duas vezes à mesma cesta.",
  basket_recipe_kit_quantity_invalid:"Revise a quantidade do kit interno na cesta.",
  lot_not_found:"Lote não encontrado.",
  duplicate_product_confirmation_required:"Confirme o uso do mesmo produto em mais de uma posição.",
  position_product_not_in_family:"O produto não pertence à família configurada desta posição.",
  required_position_missing:"Existe um item obrigatório sem seleção.",
  lot_reservation_mismatch:"A reserva não corresponde à composição atual do lote."
};
function rpcError(error:any){
  const detail=clean(error?.message||error,1000);
  const code=DOMAIN_ERRORS.find(x=>detail.includes(x))||"guided_basket_operation_failed";
  if(code.endsWith("_not_found")||code==="lot_not_found"||code==="basket_not_found")return {error:code,status:404,message:PT[code]||"Registro não encontrado."};
  if(["insufficient_loose_stock","duplicate_product_confirmation_required","basket_recipe_kit_unavailable","basket_recipe_kit_duplicate","lot_sale_must_be_disabled","lot_has_order_history","lot_is_dependency","lot_already_changed","lot_not_editable","reserved_lot_not_editable","reserved_lot_not_mountable","lot_not_cancellable","lot_reservation_mismatch","linked_lot_unavailable","guided_reserved_lot_required","kit_short_code_in_use","position_product_not_in_family","required_position_missing","position_quantity_out_of_bounds","linked_price_exceeds_total"].includes(code))return {error:code,status:409,message:PT[code]||"A operação conflita com o estado atual do lote."};
  if(code==="guided_basket_operation_failed")return {error:code,status:500,message:"Não foi possível concluir a operação de Cestas/Kits."};
  return {error:code,status:400,message:PT[code]||"Revise os dados informados."};
}
const operator=(body:any)=>clean(body?.operator,80)||"Operação";

async function stockMap(ids:string[]){
  const out=new Map<string,any>(),unique=[...new Set(ids.filter(Boolean))];
  for(let pos=0;pos<unique.length;pos+=80){
    const q=await db.from("ops2_loose_sellable_stock_v1").select("product_id,effective_sellable_stock,basket_locked_quantity,loose_sellable_stock").in("product_id",unique.slice(pos,pos+80));
    if(q.error)throw q.error;
    for(const row of q.data||[])out.set(String(row.product_id),row);
  }
  return out;
}
function productCard(p:any,stock:any){
  const loose=num(stock?.loose_sellable_stock);
  return {
    id:p.id,name:p.name||"",sku:p.sku||null,gtin:p.gtin||null,packaging:p.packaging||"",image_url:p.image_url||"",
    cost_price:num(p.cost),sale_price:num(p.price),effective_sellable_stock:num(stock?.effective_sellable_stock),
    basket_locked_quantity:num(stock?.basket_locked_quantity),loose_stock:loose,is_active:p.is_active!==false,
    selectable:p.is_active!==false&&loose>0
  };
}
async function positionProducts(input:any){
  const itemId=uuid(input?.kit_template_item_id);
  let family=clean(input?.family_key,60).toLowerCase(),searchQuery=clean(input?.q,120);
  const limit=integer(input?.limit,1,30)||12,offset=Math.max(0,Math.floor(num(input?.offset)));
  let position:any=null;
  if(itemId){
    const q=await db.from("basket_kit_template_items").select("id,kit_template_id,product_id,position_label,family_key,search_query").eq("id",itemId).maybeSingle();
    if(q.error)throw q.error;if(!q.data)return {error:"position_not_found",status:404};
    position=q.data;if(!family)family=clean(q.data.family_key,60).toLowerCase();if(!searchQuery)searchQuery=clean(q.data.search_query||q.data.position_label,120);
  }

  if(family){
    const rule=await db.from("basket_lot_substitution_rules").select("family_key,label,enabled").eq("family_key",family).maybeSingle();if(rule.error)throw rule.error;
    const memberIds:string[]=[];
    for(let pos=0;pos<10000;pos+=1000){
      const m=await db.from("basket_lot_substitution_products").select("product_id").eq("family_key",family).order("product_id").range(pos,pos+999);if(m.error)throw m.error;
      memberIds.push(...(m.data||[]).map((x:any)=>String(x.product_id||"")).filter(Boolean));if((m.data||[]).length<1000)break;
    }
    const all:any[]=[];
    for(let pos=0;pos<memberIds.length;pos+=80){
      const p=await db.from("products").select("id,name,sku,gtin,packaging,image_url,cost,price,is_active,brand").in("id",memberIds.slice(pos,pos+80));if(p.error)throw p.error;all.push(...(p.data||[]));
    }
    all.sort((a:any,b:any)=>((a.is_active===false?1:0)-(b.is_active===false?1:0))||String(a.name||"").localeCompare(String(b.name||""),"pt-BR")||String(a.id).localeCompare(String(b.id)));
    const page=all.slice(offset,offset+limit),stocks=await stockMap(page.map((x:any)=>String(x.id)));
    return {source:"family",position,family_key:family,family_label:rule.data?.label||family,family_enabled:rule.data?.enabled===true,products:page.map((p:any)=>productCard(p,stocks.get(String(p.id)))),total:all.length,next_offset:offset+limit<all.length?offset+limit:null};
  }

  const qv=clean(searchQuery,120).replace(/[,()%]/g," ");
  if(qv.length<2)return {source:"search",position,family_key:null,products:[],total:0,next_offset:null};
  let q=db.from("products").select("id,name,sku,gtin,packaging,image_url,cost,price,is_active,brand",{count:"exact"}).order("name").order("id");
  for(const term of qv.split(/\s+/).filter(Boolean).slice(0,4))q=q.or("name.ilike.%"+term+"%,gtin.ilike.%"+term+"%,sku.ilike.%"+term+"%,brand.ilike.%"+term+"%");
  q=q.range(offset,offset+limit-1);
  const found=await q;if(found.error)throw found.error;const page=found.data||[],stocks=await stockMap(page.map((x:any)=>String(x.id))),total=Number(found.count||0);
  return {source:"search",position,family_key:null,products:page.map((p:any)=>productCard(p,stocks.get(String(p.id)))),total,next_offset:offset+page.length<total?offset+page.length:null};
}

async function linkableLots(input:any){
  const basketId=uuid(input?.basket_id);
  let q=db.from("basket_stock_lots")
    .select("id,basket_id,kit_template_id,lot_kind,short_code,lot_code,status,assembly_status,sale_enabled,quantity_built,quantity_available,built_at,public_name,business_type,linked_lot_id,sale_price_override,own_sale_price_override,component_sum_snapshot,cost_sum_snapshot")
    .not("kit_template_id","is",null).in("status",["draft","ready"]).is("linked_lot_id",null)
    .order("built_at",{ascending:false}).limit(250);
  if(basketId)q=q.neq("basket_id",basketId);
  const found=await q;if(found.error)throw found.error;
  const lots:any[]=found.data||[],lotIds=lots.map((x:any)=>String(x.id)).filter(Boolean);
  const items:any[]=[];
  for(let pos=0;pos<lotIds.length;pos+=80){
    const r=await db.from("basket_stock_lot_items").select("lot_id,product_id,quantity_per_basket,position_order").in("lot_id",lotIds.slice(pos,pos+80)).order("position_order");
    if(r.error)throw r.error;items.push(...(r.data||[]));
  }
  const productIds=[...new Set(items.map((x:any)=>String(x.product_id||"")).filter(Boolean))];
  const products=new Map<string,any>();
  for(let pos=0;pos<productIds.length;pos+=80){
    const r=await db.from("products").select("id,name,sku,gtin,packaging,image_url,cost,price,is_active").in("id",productIds.slice(pos,pos+80));
    if(r.error)throw r.error;for(const row of r.data||[])products.set(String(row.id),row);
  }
  const stocks=await stockMap(productIds),byLot=new Map<string,any[]>();
  for(const item of items){
    const product=products.get(String(item.product_id))||{},stock=stocks.get(String(item.product_id));
    const row={...item,loose_stock:num(stock?.loose_sellable_stock),product:{...product,loose_stock:num(stock?.loose_sellable_stock)}};
    const arr=byLot.get(String(item.lot_id))||[];arr.push(row);byLot.set(String(item.lot_id),arr);
  }
  return {lots:lots.map((lot:any)=>({...lot,items:byLot.get(String(lot.id))||[]}))};
}

async function modelEditor(input:any){
  const basketId=uuid(input?.basket_id);if(!basketId)return {error:"invalid_basket",status:400};
  const [q,categories,subcategories,recipeKits,basketRow]=await Promise.all([
    db.rpc("basket_commercial_model_editor_v1",{p_basket_id:basketId}),
    db.from("basket_categories").select("id,name,slug,sort_order,is_active").eq("is_active",true).order("sort_order").order("name"),
    db.from("basket_subcategories").select("id,category_id,name,sort_order,is_active").eq("is_active",true).order("sort_order").order("name"),
    db.rpc("basket_recipe_kits_v1",{p_basket_id:basketId}),
    db.from("basket_templates").select("category_id,subcategory_id").eq("id",basketId).maybeSingle()
  ]);
  if(q.error)return rpcError(q.error);if(categories.error)throw categories.error;if(subcategories.error)throw subcategories.error;if(recipeKits.error)return rpcError(recipeKits.error);if(basketRow.error)throw basketRow.error;
  return {model:{...(q.data||{}),basket:{...(q.data?.basket||{}),category_id:basketRow.data?.category_id||q.data?.basket?.category_id||null,subcategory_id:basketRow.data?.subcategory_id||null},recipe_kits:Array.isArray(recipeKits.data?.kits)?recipeKits.data.kits:[]},categories:categories.data||[],subcategories:subcategories.data||[]};
}
async function modelSave(input:any){
  const basketId=uuid(input?.basket_id),positions=list(input?.positions),commercial=input?.commercial||{};
  const name=clean(commercial?.name,180),categoryId=uuid(commercial?.category_id),subcategoryId=uuid(commercial?.subcategory_id),basePrice=money(commercial?.base_price),imageUrl=clean(commercial?.image_url,1000);
  if(!basketId)return {error:"invalid_basket",status:400};
  if(!positions||!positions.length)return {error:"basket_positions_invalid",status:400};
  if(!name)return {error:"basket_name_invalid",status:400};
  if(!categoryId)return {error:"basket_category_required",status:400};
  if(!subcategoryId)return {error:"basket_subcategory_required",status:400};
  const sub=await db.from("basket_subcategories").select("id").eq("id",subcategoryId).eq("category_id",categoryId).eq("is_active",true).maybeSingle();if(sub.error)throw sub.error;if(!sub.data)return {error:"basket_subcategory_required",status:400};
  if(basePrice===null)return {error:"basket_price_invalid",status:400};
  const q=await db.rpc("save_basket_commercial_model_v2",{
    p_basket_id:basketId,p_name:name,p_category_id:categoryId,p_base_price:basePrice,p_image_url:imageUrl||null,
    p_positions:positions,p_operator:operator(input)
  });
  if(q.error)return rpcError(q.error);const now=new Date().toISOString();const [update,kitUpdate]=await Promise.all([db.from("basket_templates").update({category_id:categoryId,subcategory_id:subcategoryId,updated_at:now}).eq("id",basketId),db.from("basket_kit_templates").update({category_id:categoryId,subcategory_id:subcategoryId,updated_at:now}).eq("basket_id",basketId).eq("is_active",true)]);if(update.error)throw update.error;if(kitUpdate.error)throw kitUpdate.error;return {model:{...(q.data||{}),category_id:categoryId,subcategory_id:subcategoryId}};
}
async function recipeKitsSave(input:any){
  const basketId=uuid(input?.basket_id),recipeKits=list(input?.recipe_kits,20);
  if(!basketId)return {error:"invalid_basket",status:400};
  if(!recipeKits)return {error:"basket_recipe_kits_invalid",status:400};
  const q=await db.rpc("save_basket_recipe_kits_v1",{p_basket_id:basketId,p_kits:recipeKits,p_operator:operator(input)});
  if(q.error)return rpcError(q.error);
  return {recipe_kits:Array.isArray(q.data?.kits)?q.data.kits:[],recipe_kits_result:q.data};
}
async function lotPreview(input:any){const basketId=uuid(input?.basket_id),quantity=integer(input?.quantity),items=list(input?.items);if(!basketId)return {error:"invalid_basket",status:400};if(!quantity)return {error:"invalid_lot_quantity",status:400};if(!items||!items.length)return {error:"empty_lot_composition",status:400};const q=await db.rpc("preview_basket_commercial_lot_v1",{p_basket_id:basketId,p_quantity:quantity,p_items:items});if(q.error)return rpcError(q.error);return {preview:q.data};}
async function lotReserve(input:any){const basketId=uuid(input?.basket_id),quantity=integer(input?.quantity),items=list(input?.items),linked=input?.linked_lot_id?uuid(input.linked_lot_id):null,price=money(input?.sale_price);if(!basketId)return {error:"invalid_basket",status:400};if(!quantity)return {error:"invalid_lot_quantity",status:400};if(!items||!items.length)return {error:"empty_lot_composition",status:400};if(input?.linked_lot_id&&!linked)return {error:"invalid_linked_lot",status:400};if(input?.sale_price!==null&&input?.sale_price!==undefined&&price===null)return {error:"invalid_sale_price",status:400};const q=await db.rpc("create_basket_commercial_lot_reserved_v1",{p_basket_id:basketId,p_quantity:quantity,p_items:items,p_public_name:clean(input?.public_name,120)||null,p_sale_price:price,p_operator:operator(input),p_notes:clean(input?.notes,800)||null,p_short_code:clean(input?.short_code,3).toUpperCase()||null,p_linked_lot_id:linked});if(q.error)return rpcError(q.error);return {lot:q.data};}
async function lotUpdate(input:any){const lotId=uuid(input?.lot_id),quantity=integer(input?.quantity),items=list(input?.items),linked=input?.linked_lot_id?uuid(input.linked_lot_id):null,price=money(input?.sale_price);if(!lotId)return {error:"invalid_lot",status:400};if(!quantity)return {error:"invalid_lot_quantity",status:400};if(!items||!items.length)return {error:"empty_lot_composition",status:400};if(input?.linked_lot_id&&!linked)return {error:"invalid_linked_lot",status:400};if(input?.sale_price!==null&&input?.sale_price!==undefined&&price===null)return {error:"invalid_sale_price",status:400};const q=await db.rpc("update_basket_reserved_lot_v1",{p_lot_id:lotId,p_quantity:quantity,p_items:items,p_public_name:clean(input?.public_name,120)||null,p_sale_price:price,p_operator:operator(input),p_notes:clean(input?.notes,800)||null,p_linked_lot_id:linked});if(q.error)return rpcError(q.error);return {lot:q.data};}
async function lotMount(input:any){const lotId=uuid(input?.lot_id);if(!lotId)return {error:"invalid_lot",status:400};const q=await db.rpc("mark_basket_reserved_lot_mounted_v1",{p_lot_id:lotId,p_operator:operator(input)});if(q.error)return rpcError(q.error);return {lot:q.data};}
async function lotCancel(input:any){const lotId=uuid(input?.lot_id);if(!lotId)return {error:"invalid_lot",status:400};const q=await db.rpc("cancel_basket_reserved_lot_v1",{p_lot_id:lotId,p_operator:operator(input),p_reason:clean(input?.reason,300)||null});if(q.error)return rpcError(q.error);return {lot:q.data};}
async function lotReopen(input:any){const lotId=uuid(input?.lot_id);if(!lotId)return {error:"invalid_lot",status:400};const q=await db.rpc("reopen_basket_kit_lot_for_edit_v1",{p_lot_id:lotId,p_operator:operator(input)});if(q.error)return rpcError(q.error);return {lot:q.data};}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(!["GET","POST"].includes(req.method))return json(req,{ok:false,error:"method_not_allowed"},405);
  if(!U||!K)return json(req,{ok:false,error:"server_config"},500);
  try{
    const auth:any=await adminAuth(req);if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);
    const url=new URL(req.url);let body:any={};if(req.method==="POST"){try{body=await req.json()}catch{return json(req,{ok:false,error:"invalid_json"},400)}}
    const input:any={...Object.fromEntries(url.searchParams.entries()),...body};const action=clean(input?.action,80);
    if(MUTATIONS.has(action)&&auth.role==="viewer")return json(req,{ok:false,error:"forbidden",message:"Perfil de consulta não pode alterar Cestas/Kits."},403);
    let result:any;
    if(action==="model_editor")result=await modelEditor(input);
    else if(action==="position_products")result=await positionProducts(input);
    else if(action==="linkable_lots")result=await linkableLots(input);
    else if(action==="model_save")result=await modelSave(input);
    else if(action==="recipe_kits_save")result=await recipeKitsSave(input);
    else if(action==="lot_preview")result=await lotPreview(input);
    else if(action==="lot_reserve")result=await lotReserve(input);
    else if(action==="lot_update")result=await lotUpdate(input);
    else if(action==="lot_mount")result=await lotMount(input);
    else if(action==="lot_cancel")result=await lotCancel(input);
    else if(action==="lot_reopen")result=await lotReopen(input);
    else return json(req,{ok:false,error:"unknown_action"},404);
    if(result?.error)return json(req,{ok:false,...result},result.status||400);
    return json(req,{ok:true,...result});
  }catch(error){console.error("admin-basket-guided-v1",error);return json(req,{ok:false,error:"internal_error"},500)}
});