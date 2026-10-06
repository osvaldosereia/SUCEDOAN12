import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});

const ORIGINS=new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const READ_ACTIONS=new Set(["kits","kit","products","most_used","basket_products","chips"]);
const MUTATIONS=new Set(["kit_save","kit_archive","chip_save","chip_archive","chip_reorder"]);
const ACTIONS=new Set([...READ_ACTIONS,...MUTATIONS]);

const cors=(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  return {
    "Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://www.donaantonia.com.br",
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"content-type,authorization,apikey",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
  };
};
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...cors(req),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const clean=(value:unknown,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const uuid=(value:unknown)=>{const s=clean(value,64);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const positiveInt=(value:unknown,fallback:number,min=1,max=100)=>{const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback};
const offsetInt=(value:unknown)=>{const n=Number(value);return Number.isInteger(n)&&n>=0?Math.min(n,100000):0};
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

async function stockAuthority(){
  const r=await db.from("bling_hub_runtime_v2").select("metadata").eq("id",1).maybeSingle();
  if(r.error)throw r.error;
  return String((r.data?.metadata||{}).ops2_stock_authority||"legacy_shadow");
}

async function stockMap(ids:string[]){
  const out=new Map<string,any>();
  const unique=[...new Set(ids.map(String).filter(Boolean))];
  for(let pos=0;pos<unique.length;pos+=80){
    const q=await db.from("ops2_loose_sellable_stock_v1")
      .select("product_id,effective_sellable_stock,basket_locked_quantity,loose_sellable_stock,sellable_physical,bling_stock_ready")
      .in("product_id",unique.slice(pos,pos+80));
    if(q.error)throw q.error;
    for(const row of q.data||[])out.set(String(row.product_id),row);
  }
  return out;
}

function productCard(p:any,stock:any,authority:string){
  return {
    id:p.id,
    name:p.name||"",
    sku:p.sku||null,
    gtin:p.gtin||null,
    packaging:p.packaging||"",
    image_url:p.image_url||"",
    cost_price:num(p.cost),
    sale_price:num(p.price),
    effective_sellable_stock:num(stock?.effective_sellable_stock),
    basket_locked_quantity:num(stock?.basket_locked_quantity),
    loose_sellable_stock:num(stock?.loose_sellable_stock),
    physical_stock:num(stock?.sellable_physical??stock?.effective_sellable_stock),
    bling_stock_ready:stock?.bling_stock_ready===true,
    stock_authority:authority,
    is_active:p.is_active!==false
  };
}

async function productRows(ids:string[]){
  const rows:any[]=[];
  const unique=[...new Set(ids.map(String).filter(Boolean))];
  for(let pos=0;pos<unique.length;pos+=80){
    const q=await db.from("products")
      .select("id,name,sku,gtin,packaging,image_url,cost,price,is_active")
      .in("id",unique.slice(pos,pos+80));
    if(q.error)throw q.error;
    rows.push(...(q.data||[]));
  }
  return rows;
}

async function kitItemsFor(kitIds:string[]){
  const rows:any[]=[];
  const unique=[...new Set(kitIds.map(String).filter(Boolean))];
  for(let pos=0;pos<unique.length;pos+=80){
    const q=await db.from("assembly_kit_items")
      .select("id,kit_id,product_id,quantity,sort_order,created_at,updated_at")
      .in("kit_id",unique.slice(pos,pos+80))
      .order("sort_order")
      .order("id");
    if(q.error)throw q.error;
    rows.push(...(q.data||[]));
  }
  return rows;
}

async function kitSummaries(kitRows:any[]){
  const kitIds=kitRows.map((x:any)=>String(x.id));
  const items=await kitItemsFor(kitIds);
  const productIds=[...new Set(items.map((x:any)=>String(x.product_id)))];
  const products=await productRows(productIds);
  const productById=new Map(products.map((p:any)=>[String(p.id),p]));
  const byKit=new Map<string,any[]>();
  for(const item of items){
    const arr=byKit.get(String(item.kit_id))||[];
    arr.push(item);
    byKit.set(String(item.kit_id),arr);
  }
  return kitRows.map((kit:any)=>{
    const kitItems=byKit.get(String(kit.id))||[];
    let cost=0,sale=0;
    for(const item of kitItems){
      const p:any=productById.get(String(item.product_id))||{};
      cost+=num(item.quantity)*num(p.cost);
      sale+=num(item.quantity)*num(p.price);
    }
    return {
      ...kit,
      item_count:kitItems.length,
      cost_total:Math.round(cost*100)/100,
      sale_total:Math.round(sale*100)/100
    };
  });
}

async function kits(input:any){
  const includeArchived=String(input?.include_archived||"")==="1"||input?.include_archived===true;
  const type=clean(input?.type,40);
  const limit=positiveInt(input?.limit,60,1,200);
  const offset=offsetInt(input?.offset);
  let q=db.from("assembly_kits")
    .select("id,name,type,notes,source_kit_id,is_active,metadata,created_at,updated_at",{count:"exact"})
    .order("is_active",{ascending:false})
    .order("type")
    .order("name")
    .range(offset,offset+limit-1);
  if(!includeArchived)q=q.eq("is_active",true);
  if(type)q=q.eq("type",type);
  const found=await q;
  if(found.error)throw found.error;
  const rows=await kitSummaries(found.data||[]);
  const total=Number(found.count||0);
  return {kits:rows,total,next_offset:offset+rows.length<total?offset+rows.length:null};
}

async function kit(input:any){
  const kitId=uuid(input?.id||input?.kit_id);
  if(!kitId)return {error:"invalid_kit",status:400};
  const q=await db.from("assembly_kits")
    .select("id,name,type,notes,source_kit_id,is_active,metadata,created_at,updated_at")
    .eq("id",kitId).maybeSingle();
  if(q.error)throw q.error;
  if(!q.data)return {error:"assembly_kit_not_found",status:404};
  const items=await kitItemsFor([kitId]);
  const products=await productRows(items.map((x:any)=>String(x.product_id)));
  const stocks=await stockMap(products.map((x:any)=>String(x.id)));
  const authority=await stockAuthority();
  const productById=new Map(products.map((p:any)=>[String(p.id),productCard(p,stocks.get(String(p.id)),authority)]));
  const detailed=items.map((item:any)=>({...item,quantity:num(item.quantity),product:productById.get(String(item.product_id))||null}));
  const summary=(await kitSummaries([q.data]))[0];
  return {kit:{...summary,items:detailed}};
}

async function products(input:any){
  const qv=clean(input?.q,120).replace(/[%(),]/g," ");
  const limit=positiveInt(input?.limit,20,1,50);
  const offset=offsetInt(input?.offset);
  let q=db.from("products")
    .select("id,name,sku,gtin,packaging,image_url,cost,price,is_active",{count:"exact"})
    .eq("is_active",true)
    .order("name")
    .order("id")
    .range(offset,offset+limit-1);
  if(qv){
    const safe=qv.replace(/[.*+?^${}()|[\]\\]/g," ").trim();
    q=q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,gtin.ilike.%${safe}%`);
  }
  const found=await q;
  if(found.error)throw found.error;
  const rows=found.data||[];
  const stocks=await stockMap(rows.map((p:any)=>String(p.id)));
  const authority=await stockAuthority();
  const total=Number(found.count||0);
  return {
    products:rows.map((p:any)=>productCard(p,stocks.get(String(p.id)),authority)),
    total,
    offset,
    limit,
    next_offset:offset+rows.length<total?offset+rows.length:null,
    stock_authority:authority
  };
}

async function mostUsed(input:any){
  const limit=positiveInt(input?.limit,30,1,100);
  const kitsQ=await db.from("assembly_kits").select("id").eq("is_active",true);
  if(kitsQ.error)throw kitsQ.error;
  const activeIds=(kitsQ.data||[]).map((x:any)=>String(x.id));
  if(!activeIds.length)return {products:[]};
  const items=await kitItemsFor(activeIds);
  const usage=new Map<string,Set<string>>();
  for(const item of items){
    const pid=String(item.product_id),set=usage.get(pid)||new Set<string>();
    set.add(String(item.kit_id));usage.set(pid,set);
  }
  const ranked=[...usage.entries()]
    .map(([product_id,kits])=>({product_id,usage_count:kits.size}))
    .sort((a,b)=>b.usage_count-a.usage_count||a.product_id.localeCompare(b.product_id))
    .slice(0,limit);
  const productsRows=await productRows(ranked.map(x=>x.product_id));
  const byId=new Map(productsRows.map((p:any)=>[String(p.id),p]));
  const stocks=await stockMap(ranked.map(x=>x.product_id));
  const authority=await stockAuthority();
  return {products:ranked.map(x=>({...productCard(byId.get(x.product_id)||{id:x.product_id},stocks.get(x.product_id),authority),usage_count:x.usage_count}))};
}

async function basketProducts(input:any){
  const limit=positiveInt(input?.limit,200,1,300);
  const basketsQ=await db.from("basket_templates")
    .select("id,name,sort_order")
    .eq("is_active",true)
    .order("sort_order")
    .order("name");
  if(basketsQ.error)throw basketsQ.error;
  const baskets=basketsQ.data||[];
  if(!baskets.length)return {products:[],total:0,stock_authority:await stockAuthority()};

  const basketIds=baskets.map((b:any)=>String(b.id));
  const recipeRows:any[]=[];
  for(let pos=0;pos<basketIds.length;pos+=80){
    const q=await db.from("store_basket_recipe_kits")
      .select("basket_id,kit_id")
      .in("basket_id",basketIds.slice(pos,pos+80));
    if(q.error)throw q.error;
    recipeRows.push(...(q.data||[]));
  }
  if(!recipeRows.length)return {products:[],total:0,stock_authority:await stockAuthority()};

  const kitIds=[...new Set(recipeRows.map((r:any)=>String(r.kit_id)).filter(Boolean))];
  const items=await kitItemsFor(kitIds);
  const basketsByKit=new Map<string,Set<string>>();
  for(const row of recipeRows){
    const kitId=String(row.kit_id),basketId=String(row.basket_id);
    const set=basketsByKit.get(kitId)||new Set<string>();
    set.add(basketId);basketsByKit.set(kitId,set);
  }
  const usage=new Map<string,Set<string>>();
  for(const item of items){
    const pid=String(item.product_id),basketSet=usage.get(pid)||new Set<string>();
    for(const basketId of basketsByKit.get(String(item.kit_id))||[])basketSet.add(basketId);
    usage.set(pid,basketSet);
  }

  const basketNameById=new Map(baskets.map((b:any)=>[String(b.id),String(b.name||"")]));
  const productsRows=await productRows([...usage.keys()]);
  const byId=new Map(productsRows.map((p:any)=>[String(p.id),p]));
  const stocks=await stockMap([...usage.keys()]);
  const authority=await stockAuthority();
  const rows=[...usage.entries()].map(([product_id,basketIdsSet])=>{
    const basket_names=[...basketIdsSet].map(id=>basketNameById.get(id)||"").filter(Boolean).sort((a,b)=>a.localeCompare(b,"pt-BR"));
    return {
      ...productCard(byId.get(product_id)||{id:product_id},stocks.get(product_id),authority),
      basket_usage_count:basketIdsSet.size,
      basket_names
    };
  }).sort((a:any,b:any)=>b.basket_usage_count-a.basket_usage_count||String(a.name).localeCompare(String(b.name),"pt-BR"));
  const visible=rows.slice(0,limit);
  return {products:visible,total:rows.length,stock_authority:authority};
}

async function chips(input:any){
  const includeArchived=String(input?.include_archived||"")==="1"||input?.include_archived===true;
  let q=db.from("assembly_search_chips")
    .select("id,label,query,sort_order,is_active,created_at,updated_at")
    .order("sort_order")
    .order("label");
  if(!includeArchived)q=q.eq("is_active",true);
  const found=await q;if(found.error)throw found.error;
  return {chips:found.data||[]};
}

async function kitSave(body:any){
  const items=Array.isArray(body?.items)?body.items.slice(0,200):[];
  const q=await db.rpc("save_assembly_kit_v1",{
    p_kit_id:uuid(body?.kit_id)||null,
    p_name:clean(body?.name,180),
    p_type:clean(body?.type,40),
    p_notes:clean(body?.notes,2000)||null,
    p_source_kit_id:uuid(body?.source_kit_id)||null,
    p_items:items,
    p_operator:clean(body?.operator,80)||"Operação"
  });
  if(q.error)return rpcError(q.error);
  return {result:q.data};
}

async function kitArchive(body:any){
  const kitId=uuid(body?.kit_id);
  if(!kitId)return {error:"invalid_kit",status:400};
  const q=await db.rpc("archive_assembly_kit_v1",{p_kit_id:kitId,p_operator:clean(body?.operator,80)||"Operação"});
  if(q.error)return rpcError(q.error);
  return {result:q.data};
}

async function chipSave(body:any){
  const chipId=uuid(body?.chip_id),label=clean(body?.label,80),query=clean(body?.query,120);
  const sortOrder=Math.max(0,Math.min(10000,Number(body?.sort_order)||0));
  if(!label||!query)return {error:"chip_invalid",status:400};
  if(chipId){
    const r=await db.from("assembly_search_chips").update({label,query,sort_order:sortOrder,is_active:true,updated_at:new Date().toISOString()}).eq("id",chipId).select("id,label,query,sort_order,is_active").maybeSingle();
    if(r.error)throw r.error;if(!r.data)return {error:"chip_not_found",status:404};return {chip:r.data};
  }
  const r=await db.from("assembly_search_chips").insert({label,query,sort_order:sortOrder,is_active:true}).select("id,label,query,sort_order,is_active").single();
  if(r.error)throw r.error;return {chip:r.data};
}

async function chipArchive(body:any){
  const chipId=uuid(body?.chip_id);if(!chipId)return {error:"invalid_chip",status:400};
  const r=await db.from("assembly_search_chips").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",chipId).select("id,is_active").maybeSingle();
  if(r.error)throw r.error;if(!r.data)return {error:"chip_not_found",status:404};return {chip:r.data};
}

async function chipReorder(body:any){
  const ids=Array.isArray(body?.chip_ids)?body.chip_ids.map(uuid).filter(Boolean).slice(0,100):[];
  if(!ids.length)return {error:"chip_order_invalid",status:400};
  if(new Set(ids).size!==ids.length)return {error:"chip_order_invalid",status:400};
  for(let i=0;i<ids.length;i++){
    const r=await db.from("assembly_search_chips").update({sort_order:i,updated_at:new Date().toISOString()}).eq("id",ids[i]);
    if(r.error)throw r.error;
  }
  return chips({});
}

const DOMAIN_ERRORS=[
  "assembly_kit_name_invalid","assembly_kit_type_invalid","assembly_kit_items_invalid","assembly_kit_source_self",
  "assembly_kit_source_not_found","assembly_kit_item_invalid","assembly_kit_item_quantity_invalid","assembly_kit_product_unavailable",
  "assembly_kit_not_found","assembly_kit_required","assembly_kit_in_use"
];
function rpcError(error:any){
  const detail=clean(error?.message||error,1200);
  const code=DOMAIN_ERRORS.find(x=>detail.includes(x))||"kit_builder_operation_failed";
  const conflicts=new Set(["assembly_kit_in_use","assembly_kit_source_self"]);
  const missing=new Set(["assembly_kit_not_found","assembly_kit_source_not_found"]);
  const status=missing.has(code)?404:conflicts.has(code)?409:code==="kit_builder_operation_failed"?500:400;
  const messages:Record<string,string>={
    assembly_kit_in_use:"Este kit está sendo usado por uma cesta ativa. Remova ou substitua o kit antes de arquivar.",
    assembly_kit_not_found:"Kit não encontrado.",
    assembly_kit_source_not_found:"Kit usado como base não foi encontrado.",
    assembly_kit_items_invalid:"Adicione pelo menos um produto ao kit.",
    assembly_kit_product_unavailable:"Um dos produtos do kit está inativo ou indisponível."
  };
  return {error:code,status,message:messages[code]||"Revise os dados do kit."};
}

async function readInput(req:Request){
  const url=new URL(req.url);
  const query=Object.fromEntries(url.searchParams.entries());
  if(req.method!=="POST")return query;
  let body:any={};
  try{body=await req.json()}catch{body={}}
  return {...query,...body};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const auth=await adminAuth(req);
  if(!auth.ok)return json(req,{ok:false,error:auth.error},auth.status);

  try{
    const url=new URL(req.url),action=clean(url.searchParams.get("action"),40);
    if(!ACTIONS.has(action))return json(req,{ok:false,error:"unknown_action"},404);
    if(MUTATIONS.has(action)&&req.method!=="POST")return json(req,{ok:false,error:"method_not_allowed"},405);
    if(READ_ACTIONS.has(action)&&req.method!=="GET")return json(req,{ok:false,error:"method_not_allowed"},405);
    if(auth.role==="viewer"&&MUTATIONS.has(action))return json(req,{ok:false,error:"forbidden"},403);

    const input=await readInput(req);
    let out:any;
    if(action==="kits")out=await kits(input);
    else if(action==="kit")out=await kit(input);
    else if(action==="products")out=await products(input);
    else if(action==="most_used")out=await mostUsed(input);
    else if(action==="basket_products")out=await basketProducts(input);
    else if(action==="chips")out=await chips(input);
    else if(action==="kit_save")out=await kitSave(input);
    else if(action==="kit_archive")out=await kitArchive(input);
    else if(action==="chip_save")out=await chipSave(input);
    else if(action==="chip_archive")out=await chipArchive(input);
    else if(action==="chip_reorder")out=await chipReorder(input);
    else return json(req,{ok:false,error:"unknown_action"},404);

    if(out?.error)return json(req,{ok:false,...out},out.status||400);
    return json(req,{ok:true,...out});
  }catch(error){
    console.error("admin_kit_builder_error",String((error as any)?.message||error));
    return json(req,{ok:false,error:"service_error",message:"Não foi possível concluir a operação do Criador de Kits."},500);
  }
});