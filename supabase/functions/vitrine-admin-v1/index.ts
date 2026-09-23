import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { syncVitrineOrderHistory } from "../_shared/vitrine-history-sync-v1.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET_KEYS = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); }
  catch { return {}; }
})();
const SERVER_KEY = SECRET_KEYS.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORG_ID = "95b1b61d-f6ed-41cb-8917-b55f6793b10b";
const CANONICAL_ADMIN_API = "https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1";
const ALLOWED_ORIGINS = new Set([
  "https://donaantonia.com.br",
  "https://www.donaantonia.com.br"
]);

const db = createClient(SUPABASE_URL, SERVER_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.donaantonia.com.br";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin"
  };
}

function json(req: Request, data: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra
    }
  });
}

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function maybeText(value: unknown, max = 500) {
  const v = text(value, max);
  return v || null;
}
function num(value: unknown, min = 0, max = 999999999) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
function uuid(value: unknown) {
  const v = text(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : "";
}
function digits(value: unknown, max = 30) {
  return String(value ?? "").replace(/\D+/g, "").slice(0, max);
}
function normalizedSearch(parts: unknown[]) {
  return parts.filter(Boolean).map(v => String(v).trim()).filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
async function listProducts(url: URL) {
  const q = text(url.searchParams.get("q"), 80);
  const category = text(url.searchParams.get("category"), 48);
  const subcategory = text(url.searchParams.get("subcategory"), 100);
  const offset = Math.floor(num(url.searchParams.get("offset"), 0, 5000));
  const limit = Math.floor(num(url.searchParams.get("limit") ?? 60, 1, 100));

  let query = db.from("products")
    .select("id,sku,gtin,name,description,active,sale_price_cents,stock_quantity,image_url,metadata,updated_at")
    .eq("organization_id", ORG_ID)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);
  if (category) query=query.contains("metadata",{sales_category:category});
  if (subcategory) query=query.contains("metadata",{subsubcategory:subcategory});
  if (q) {
    const terms = q.replace(/[%_]/g," ").split(/\s+/).filter(Boolean).slice(0,4);
    for (const term of terms) query = query.ilike("search_text", `%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  return {
    products: rows.map((p:any)=>({
      ...p,
      packaging: p.metadata?.packaging ?? "",
      subcategory: p.metadata?.subcategory ?? "",
      detailed_subcategory: p.metadata?.subsubcategory ?? "",
      category: p.metadata?.sales_category ?? p.metadata?.storefront_category ?? ""
    })),
    next_offset: rows.length === limit ? offset + limit : null
  };
}

async function productFacets(categoryRaw:unknown="") {
  const category=text(categoryRaw,48);
  const categoryMap=new Map<string,number>();
  const subcategoryMap=new Map<string,number>();
  let from=0;
  const pageSize=1000;

  while(true){
    const {data,error}=await db.from("products")
      .select("metadata")
      .eq("organization_id",ORG_ID)
      .range(from,from+pageSize-1);
    if(error)throw error;
    const rows=data??[];
    for(const row of rows){
      const cat=text(row?.metadata?.sales_category??row?.metadata?.storefront_category,48);
      const sub=text(row?.metadata?.subsubcategory,100);
      if(cat)categoryMap.set(cat,(categoryMap.get(cat)??0)+1);
      if(sub&&(!category||cat===category))subcategoryMap.set(sub,(subcategoryMap.get(sub)??0)+1);
    }
    if(rows.length<pageSize)break;
    from+=pageSize;
    if(from>10000)break;
  }

  const labels:any={mercearia:"Mercearia",limpeza_lavanderia:"Limpeza e lavanderia",higiene_beleza:"Higiene e beleza",casa_pet:"Casa e pet"};
  return {
    categories:[...categoryMap.entries()]
      .map(([value,count])=>({value,label:labels[value]??value,count}))
      .sort((a,b)=>a.label.localeCompare(b.label,"pt-BR")),
    subcategories:[...subcategoryMap.entries()]
      .map(([value,count])=>({value,label:value,count}))
      .sort((a,b)=>a.label.localeCompare(b.label,"pt-BR"))
  };
}

async function saveProduct(payload: any) {
  const id = uuid(payload?.id);
  const name = text(payload?.name, 180);
  if (!name) return { error:"name_required", status:400 };
  const category = text(payload?.category, 48);
  const packaging = text(payload?.packaging, 120);
  const subcategory = text(payload?.subcategory, 120);
  const description = text(payload?.description, 1800);
  const now = new Date().toISOString();

  let previous:any = null;
  if (id) {
    const { data, error } = await db.from("products")
      .select("id,metadata")
      .eq("organization_id",ORG_ID)
      .eq("id",id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error:"product_not_found", status:404 };
    previous = data;
  }

  const metadata = {
    ...(previous?.metadata ?? {}),
    packaging,
    subcategory,
    sales_category: category,
    storefront_category: category
  };
  const row:any = {
    organization_id: ORG_ID,
    sku: maybeText(payload?.sku,80),
    gtin: maybeText(payload?.gtin,30),
    name,
    description: description || null,
    active: payload?.active !== false,
    sale_price_cents: Math.round(num(payload?.sale_price_cents,0,100000000)),
    stock_quantity: Math.round(num(payload?.stock_quantity,0,1000000)*1000)/1000,
    image_url: maybeText(payload?.image_url,1200),
    metadata,
    search_text: normalizedSearch([name,payload?.sku,payload?.gtin,description,packaging,subcategory,category]),
    updated_at: now
  };

  if (id) {
    const { data, error } = await db.from("products")
      .update(row)
      .eq("organization_id",ORG_ID)
      .eq("id",id)
      .select("id,sku,gtin,name,description,active,sale_price_cents,stock_quantity,image_url,metadata,updated_at")
      .single();
    if (error) throw error;
    let blingQueued=false;
    try{
      const queued=await blingHubControl("enqueue_job",{
        domain:"product",operation:"sync_product",source_id:data.id,
        idempotency_key:"vitrine_qx:product:"+data.id+":"+String(data.updated_at),
        payload:{product:data}
      });
      blingQueued=!(queued as any).error;
    }catch{}
    try{await queueBlingStockSnapshots([data.id],"product_save")}catch{}
    return { product_id:data.id,bling_queued:blingQueued };
  }
  const { data, error } = await db.from("products")
    .insert(row)
    .select("id,sku,gtin,name,description,active,sale_price_cents,stock_quantity,image_url,metadata,updated_at")
    .single();
  if (error) throw error;
  let blingQueued=false;
  try{
    const queued=await blingHubControl("enqueue_job",{
      domain:"product",operation:"sync_product",source_id:data.id,
      idempotency_key:"vitrine_qx:product:"+data.id+":"+String(data.updated_at),
      payload:{product:data}
    });
    blingQueued=!(queued as any).error;
  }catch{}
  try{await queueBlingStockSnapshots([data.id],"product_create")}catch{}
  return { product_id:data.id,bling_queued:blingQueued };
}


async function productLocationMap(productIds:string[]) {
  const ids=[...new Set(productIds.filter(Boolean))];
  const result=new Map<string,number>();
  if (!ids.length) return result;
  const {data:assignments,error}=await db.from("product_gondola_assignments")
    .select("product_id,gondola_id")
    .eq("organization_id",ORG_ID)
    .in("product_id",ids);
  if (error) throw error;
  const gondolaIds=[...new Set((assignments??[]).map((x:any)=>x.gondola_id).filter(Boolean))];
  if (!gondolaIds.length) return result;
  const {data:gondolas,error:gErr}=await db.from("warehouse_gondolas")
    .select("id,number")
    .eq("organization_id",ORG_ID)
    .in("id",gondolaIds);
  if (gErr) throw gErr;
  const gMap=new Map((gondolas??[]).map((g:any)=>[g.id,Number(g.number)]));
  for (const row of assignments??[]) {
    const number=gMap.get(row.gondola_id);
    if (Number.isFinite(number)) result.set(row.product_id,number);
  }
  return result;
}

async function findProductByEan(rawEan:unknown) {
  const ean=digits(rawEan,30);
  if (ean.length < 4) return {error:"invalid_ean",status:400};
  const {data,error}=await db.from("products")
    .select("id,sku,gtin,name,stock_quantity,active")
    .eq("organization_id",ORG_ID)
    .eq("gtin",ean)
    .limit(2);
  if (error) throw error;
  if (!data?.length) return {error:"product_not_found",status:404};
  if (data.length > 1) return {error:"duplicate_ean",status:409};
  const p=data[0];
  const locations=await productLocationMap([p.id]);
  return {product:{...p,gondola_number:locations.get(p.id)??null}};
}

async function balanceConfirm(payload:any) {
  const productId=uuid(payload?.product_id);
  const ean=digits(payload?.ean,30);
  const rawQty=Number(payload?.quantity);
  if (!Number.isFinite(rawQty) || rawQty < 0 || rawQty > 1000000) {
    return {error:"invalid_quantity",status:400};
  }
  const quantity=Math.round(rawQty*1000)/1000;
  let product:any=null;
  if (productId) {
    const {data,error}=await db.from("products")
      .select("id,gtin,name,stock_quantity")
      .eq("organization_id",ORG_ID)
      .eq("id",productId)
      .maybeSingle();
    if (error) throw error;
    product=data;
  } else if (ean) {
    const found=await findProductByEan(ean);
    if ((found as any).error) return found as any;
    product=(found as any).product;
  }
  if (!product) return {error:"product_not_found",status:404};

  const {data,error}=await db.rpc("apply_inventory_count",{
    p_organization_id:ORG_ID,
    p_product_id:product.id,
    p_counted_quantity:quantity,
    p_gtin:product.gtin??ean??null
  });
  if (error) throw error;
  const row=Array.isArray(data)?data[0]:data;
  const locations=await productLocationMap([product.id]);
  const currentStock=Number(row?.counted_quantity??quantity);
  let blingQueued=false;
  try{blingQueued=await queueBlingStockSnapshots([product.id],"inventory_balance")}catch{}
  return {
    product:{
      id:product.id,
      gtin:product.gtin??ean,
      name:row?.product_name??product.name,
      previous_quantity:Number(row?.previous_quantity??product.stock_quantity??0),
      stock_quantity:currentStock,
      gondola_number:locations.get(product.id)??null
    },
    bling_queued:blingQueued
  };
}

async function listGondolas() {
  const {data,error}=await db.from("warehouse_gondolas")
    .select("id,number,active,created_at,updated_at")
    .eq("organization_id",ORG_ID)
    .eq("active",true)
    .order("number",{ascending:true});
  if (error) throw error;
  const rows=data??[];
  const {data:assignments,error:aErr}=await db.from("product_gondola_assignments")
    .select("gondola_id")
    .eq("organization_id",ORG_ID);
  if (aErr) throw aErr;
  const counts=new Map<string,number>();
  for (const a of assignments??[]) counts.set(a.gondola_id,(counts.get(a.gondola_id)??0)+1);
  return rows.map((g:any)=>({...g,product_count:counts.get(g.id)??0}));
}

async function createGondola(payload:any) {
  const number=Math.floor(Number(payload?.number));
  if (!Number.isInteger(number) || number < 1 || number > 9999) return {error:"invalid_gondola",status:400};
  const {data:existing,error:eErr}=await db.from("warehouse_gondolas")
    .select("id,number,active")
    .eq("organization_id",ORG_ID)
    .eq("number",number)
    .maybeSingle();
  if (eErr) throw eErr;
  if (existing) {
    if (!existing.active) {
      const {data,error}=await db.from("warehouse_gondolas")
        .update({active:true,updated_at:new Date().toISOString()})
        .eq("id",existing.id)
        .select("id,number,active")
        .single();
      if (error) throw error;
      return {gondola:data,reused:true};
    }
    return {gondola:existing,reused:true};
  }
  const {data,error}=await db.from("warehouse_gondolas")
    .insert({organization_id:ORG_ID,number})
    .select("id,number,active")
    .single();
  if (error) throw error;
  return {gondola:data,reused:false};
}

async function getGondola(rawId:unknown) {
  const id=uuid(rawId);
  if (!id) return {error:"invalid_gondola",status:400};
  const {data:gondola,error:gErr}=await db.from("warehouse_gondolas")
    .select("id,number,active")
    .eq("organization_id",ORG_ID)
    .eq("id",id)
    .maybeSingle();
  if (gErr) throw gErr;
  if (!gondola) return {error:"gondola_not_found",status:404};

  const {data:assignments,error:aErr}=await db.from("product_gondola_assignments")
    .select("product_id,updated_at")
    .eq("organization_id",ORG_ID)
    .eq("gondola_id",id)
    .order("updated_at",{ascending:false});
  if (aErr) throw aErr;
  const ids=(assignments??[]).map((x:any)=>x.product_id);
  if (!ids.length) return {gondola,products:[]};
  const {data:products,error:pErr}=await db.from("products")
    .select("id,sku,gtin,name,stock_quantity,active")
    .eq("organization_id",ORG_ID)
    .in("id",ids);
  if (pErr) throw pErr;
  const byId=new Map((products??[]).map((p:any)=>[p.id,p]));
  return {
    gondola,
    products:(assignments??[])
      .map((a:any)=>({...byId.get(a.product_id),assigned_at:a.updated_at}))
      .filter((p:any)=>p.id)
  };
}

async function assignGondolaProduct(payload:any) {
  const gondolaId=uuid(payload?.gondola_id);
  if (!gondolaId) return {error:"invalid_gondola",status:400};
  const {data:gondola,error:gErr}=await db.from("warehouse_gondolas")
    .select("id,number,active")
    .eq("organization_id",ORG_ID)
    .eq("id",gondolaId)
    .eq("active",true)
    .maybeSingle();
  if (gErr) throw gErr;
  if (!gondola) return {error:"gondola_not_found",status:404};

  const found=await findProductByEan(payload?.ean);
  if ((found as any).error) return found as any;
  const product=(found as any).product;

  let previousNumber:number|null=null;
  const {data:previous,error:prevErr}=await db.from("product_gondola_assignments")
    .select("gondola_id")
    .eq("organization_id",ORG_ID)
    .eq("product_id",product.id)
    .maybeSingle();
  if (prevErr) throw prevErr;
  if (previous?.gondola_id && previous.gondola_id!==gondolaId) {
    const {data:prevG,error:pgErr}=await db.from("warehouse_gondolas")
      .select("number")
      .eq("organization_id",ORG_ID)
      .eq("id",previous.gondola_id)
      .maybeSingle();
    if (pgErr) throw pgErr;
    previousNumber=prevG?Number(prevG.number):null;
  }

  const {error}=await db.from("product_gondola_assignments")
    .upsert({
      organization_id:ORG_ID,
      product_id:product.id,
      gondola_id:gondolaId,
      updated_at:new Date().toISOString()
    },{onConflict:"product_id"});
  if (error) throw error;

  return {
    gondola,
    previous_gondola_number:previousNumber,
    product:{...product,gondola_number:Number(gondola.number)}
  };
}

async function removeGondolaProduct(payload:any) {
  const productId=uuid(payload?.product_id);
  const gondolaId=uuid(payload?.gondola_id);
  if (!productId || !gondolaId) return {error:"invalid_product",status:400};
  const {error}=await db.from("product_gondola_assignments")
    .delete()
    .eq("organization_id",ORG_ID)
    .eq("product_id",productId)
    .eq("gondola_id",gondolaId);
  if (error) throw error;
  return {product_id:productId};
}

async function customerBundle(ids: string[]) {
  if (!ids.length) return [];
  const [idRes, addrRes] = await Promise.all([
    db.from("customer_identities")
      .select("customer_id,kind,normalized_value,is_primary")
      .eq("organization_id",ORG_ID)
      .in("customer_id",ids),
    db.from("customer_addresses")
      .select("id,customer_id,label,recipient_name,postal_code,street,number,complement,district,city,state,country_code,is_default,active,raw_text")
      .eq("organization_id",ORG_ID)
      .eq("active",true)
      .in("customer_id",ids)
      .order("is_default",{ascending:false})
  ]);
  if (idRes.error) throw idRes.error;
  if (addrRes.error) throw addrRes.error;
  const identities = new Map<string,any[]>();
  for (const row of idRes.data ?? []) {
    if (!identities.has(row.customer_id)) identities.set(row.customer_id,[]);
    identities.get(row.customer_id)!.push(row);
  }
  const addresses = new Map<string,any[]>();
  for (const row of addrRes.data ?? []) {
    if (!addresses.has(row.customer_id)) addresses.set(row.customer_id,[]);
    addresses.get(row.customer_id)!.push(row);
  }
  return ids.map(id=>({id,identities:identities.get(id)??[],addresses:addresses.get(id)??[]}));
}

async function listCustomers(url: URL) {
  const q = text(url.searchParams.get("q"),80);
  const limit = Math.floor(num(url.searchParams.get("limit") ?? 80,1,120));
  let rows:any[] = [];

  if (!q) {
    const { data, error } = await db.from("customers")
      .select("id,display_name,first_name,last_name,status,birth_date,metadata,created_at,updated_at")
      .eq("organization_id",ORG_ID)
      .order("updated_at",{ascending:false})
      .limit(limit);
    if (error) throw error;
    rows = data ?? [];
  } else {
    const qSafe = q.replace(/[%_]/g," ");
    const qDigits = digits(q,30);
    const [nameRes, identityRes] = await Promise.all([
      db.from("customers")
        .select("id,display_name,first_name,last_name,status,birth_date,metadata,created_at,updated_at")
        .eq("organization_id",ORG_ID)
        .ilike("display_name",`%${qSafe}%`)
        .limit(limit),
      db.from("customer_identities")
        .select("customer_id")
        .eq("organization_id",ORG_ID)
        .ilike("normalized_value",`%${qDigits || qSafe.toLowerCase()}%`)
        .limit(limit)
    ]);
    if (nameRes.error) throw nameRes.error;
    if (identityRes.error) throw identityRes.error;
    const byId = new Map((nameRes.data ?? []).map((r:any)=>[r.id,r]));
    const extraIds = [...new Set((identityRes.data ?? []).map((r:any)=>r.customer_id).filter((id:string)=>!byId.has(id)))];
    if (extraIds.length) {
      const { data, error } = await db.from("customers")
        .select("id,display_name,first_name,last_name,status,birth_date,metadata,created_at,updated_at")
        .eq("organization_id",ORG_ID)
        .in("id",extraIds.slice(0,limit));
      if (error) throw error;
      for (const row of data ?? []) byId.set(row.id,row);
    }
    rows=[...byId.values()].slice(0,limit);
  }

  const bundles = await customerBundle(rows.map(r=>r.id));
  const bMap = new Map(bundles.map(b=>[b.id,b]));
  return rows.map(row=>{
    const b=bMap.get(row.id) ?? {identities:[],addresses:[]};
    const get=(kind:string)=>b.identities.find((x:any)=>x.kind===kind)?.normalized_value ?? "";
    return {
      ...row,
      phone:get("phone") || get("whatsapp"),
      cpf:get("cpf"),
      email:get("email"),
      address:b.addresses[0] ?? null
    };
  });
}

async function saveCustomer(payload:any) {
  const id = uuid(payload?.id);
  const displayName = text(payload?.display_name,160);
  if (!displayName) return { error:"name_required", status:400 };
  const status = ["lead","active","inactive","blocked"].includes(text(payload?.status,20)) ? text(payload?.status,20) : "active";
  const parts=displayName.split(/\s+/);
  const firstName=parts.shift() ?? displayName;
  const lastName=parts.join(" ") || null;
  const now=new Date().toISOString();

  const wanted = [
    {kind:"phone", value:digits(payload?.phone,20)},
    {kind:"cpf", value:digits(payload?.cpf,14)},
    {kind:"email", value:text(payload?.email,180).toLowerCase()}
  ].filter(x=>x.value);

  for (const item of wanted) {
    const { data, error } = await db.from("customer_identities")
      .select("customer_id")
      .eq("organization_id",ORG_ID)
      .eq("kind",item.kind)
      .eq("normalized_value",item.value)
      .maybeSingle();
    if (error) throw error;
    if (data && (!id || data.customer_id !== id)) {
      return { error:`${item.kind}_already_in_use`, status:409 };
    }
  }

  let previousMetadata:any={};
  if (id) {
    const {data,error}=await db.from("customers")
      .select("id,metadata")
      .eq("organization_id",ORG_ID)
      .eq("id",id)
      .maybeSingle();
    if(error) throw error;
    if(!data) return {error:"customer_not_found",status:404};
    previousMetadata=data.metadata??{};
  }

  let customerId=id;
  const customerRow:any = {
    display_name:displayName,
    first_name:firstName,
    last_name:lastName,
    status,
    birth_date: maybeText(payload?.birth_date,10),
    metadata:{...previousMetadata,notes:text(payload?.notes,1000)},
    updated_at:now
  };

  if (id) {
    const { error } = await db.from("customers")
      .update(customerRow)
      .eq("organization_id",ORG_ID)
      .eq("id",id);
    if (error) throw error;
  } else {
    const { data, error } = await db.from("customers")
      .insert({organization_id:ORG_ID,...customerRow})
      .select("id")
      .single();
    if (error) throw error;
    customerId=data.id;
  }

  const { error: deleteIdentityError } = await db.from("customer_identities")
    .delete()
    .eq("organization_id",ORG_ID)
    .eq("customer_id",customerId)
    .in("kind",["phone","cpf","email"]);
  if (deleteIdentityError) throw deleteIdentityError;
  if (wanted.length) {
    const { error } = await db.from("customer_identities").insert(
      wanted.map(item=>({
        organization_id:ORG_ID,
        customer_id:customerId,
        kind:item.kind,
        normalized_value:item.value,
        is_primary:true
      }))
    );
    if (error) throw error;
  }

  const address:any = payload?.address ?? {};
  const hasAddress=[address.street,address.number,address.district,address.city,address.postal_code,address.raw_text].some(Boolean);
  const { data: addressRows, error: addrFindError } = await db.from("customer_addresses")
    .select("id")
    .eq("organization_id",ORG_ID)
    .eq("customer_id",customerId)
    .eq("is_default",true)
    .order("updated_at",{ascending:false})
    .limit(1);
  if (addrFindError) throw addrFindError;
  const existingAddress=addressRows?.[0]??null;

  if (hasAddress) {
    const addressRow:any = {
      organization_id:ORG_ID,
      customer_id:customerId,
      label:"Entrega",
      recipient_name:displayName,
      postal_code:maybeText(address.postal_code,20),
      street:maybeText(address.street,180),
      number:maybeText(address.number,30),
      complement:maybeText(address.complement,120),
      district:maybeText(address.district,120),
      city:maybeText(address.city,120) ?? "Cuiabá",
      state:maybeText(address.state,2) ?? "MT",
      country_code:"BR",
      is_default:true,
      active:true,
      raw_text:maybeText(address.raw_text,400),
      updated_at:now
    };
    if (existingAddress?.id) {
      const { error } = await db.from("customer_addresses").update(addressRow).eq("id",existingAddress.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("customer_addresses").insert(addressRow);
      if (error) throw error;
    }
  } else if (existingAddress?.id) {
    const { error } = await db.from("customer_addresses").update({active:false,updated_at:now}).eq("id",existingAddress.id);
    if (error) throw error;
  }

  return { customer_id:customerId };
}

async function listOrders() {
  const { data, error } = await db.from("orders")
    .select("id,order_number,status,total_cents,payment_method_snapshot,delivery_address_snapshot,customer_id,created_at,confirmed_at,delivered_at")
    .eq("organization_id",ORG_ID)
    .order("created_at",{ascending:false})
    .limit(120);
  if (error) throw error;
  const rows=data ?? [];
  const ids=[...new Set(rows.map((r:any)=>r.customer_id).filter(Boolean))];
  let customers:any[]=[];
  if (ids.length) {
    const res=await db.from("customers").select("id,display_name").eq("organization_id",ORG_ID).in("id",ids);
    if (res.error) throw res.error;
    customers=res.data ?? [];
  }
  const cMap=new Map(customers.map((c:any)=>[c.id,c.display_name]));
  const orderIds=rows.map((r:any)=>r.id);
  const syncMap=new Map<string,any>();
  if(orderIds.length){
    const sync=await db.from("vitrine_history_sync_outbox")
      .select("order_id,state,attempt_count,last_attempt_at,last_synced_at,last_error,remote_order_id,remote_customer_id")
      .in("order_id",orderIds);
    if(sync.error)throw sync.error;
    for(const row of sync.data??[])syncMap.set(row.order_id,row);
  }
  return rows.map((r:any)=>({
    ...r,
    customer_name:r.customer_id
      ? cMap.get(r.customer_id)??""
      : r.delivery_address_snapshot?.customer_name ?? r.delivery_address_snapshot?.recipient_name ?? "",
    history_sync:syncMap.get(r.id)??{state:"pending",attempt_count:0,last_error:null}
  }));
}

async function orderDetail(id:string) {
  const { data:order, error:oErr } = await db.from("orders")
    .select("*")
    .eq("organization_id",ORG_ID)
    .eq("id",id)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!order) return { error:"order_not_found", status:404 };

  const { data:items, error:iErr } = await db.from("order_items")
    .select("*")
    .eq("organization_id",ORG_ID)
    .eq("order_id",id)
    .order("id",{ascending:true});
  if (iErr) throw iErr;
  const itemIds=(items??[]).map((x:any)=>x.id);
  let components:any[]=[];
  if (itemIds.length) {
    const res=await db.from("order_item_components")
      .select("*")
      .eq("organization_id",ORG_ID)
      .in("order_item_id",itemIds);
    if (res.error) throw res.error;
    components=res.data ?? [];
  }

  const productIds=[...new Set([
    ...(items??[]).map((x:any)=>x.product_id),
    ...components.map((x:any)=>x.product_id)
  ].filter(Boolean))];
  let products:any[]=[];
  if (productIds.length) {
    const res=await db.from("products")
      .select("id,name,image_url,sku")
      .eq("organization_id",ORG_ID)
      .in("id",productIds);
    if (res.error) throw res.error;
    products=res.data ?? [];
  }
  const pMap=new Map(products.map((p:any)=>[p.id,p]));
  const locationMap=await productLocationMap(productIds);

  let customer:any=null;
  if (order.customer_id) {
    const { data:c, error:cErr } = await db.from("customers")
      .select("id,display_name,first_name,last_name,status,birth_date,metadata")
      .eq("organization_id",ORG_ID)
      .eq("id",order.customer_id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (c) {
      const bundles=await customerBundle([c.id]);
      const b=bundles[0]??{identities:[],addresses:[]};
      const get=(kind:string)=>b.identities.find((x:any)=>x.kind===kind)?.normalized_value ?? "";
      customer={...c,phone:get("phone")||get("whatsapp"),cpf:get("cpf"),email:get("email"),address:b.addresses[0]??null};
    }
  } else if (order.delivery_address_snapshot?.source_customer_id) {
    const snap=order.delivery_address_snapshot;
    customer={
      id:null,
      source_customer_id:snap.source_customer_id,
      display_name:snap.customer_name??snap.recipient_name??"",
      phone:snap.phone??"",
      cpf:snap.cpf??"",
      email:snap.email??"",
      status:"active",
      address:{
        street:snap.street??null,
        number:snap.number??null,
        complement:snap.complement??null,
        district:snap.district??null,
        city:snap.city??null,
        state:snap.state??null,
        postal_code:snap.postal_code??null,
        raw_text:snap.raw_text??null,
        google_maps_url:snap.google_maps_url??null,
        block:snap.block??null
      }
    };
  }

  const groupedComponents=new Map<string,any[]>();
  for (const c of components) {
    if (!groupedComponents.has(c.order_item_id)) groupedComponents.set(c.order_item_id,[]);
    const p=pMap.get(c.product_id);
    groupedComponents.get(c.order_item_id)!.push({...c,image_url:p?.image_url??"",product_name:p?.name??c.name_snapshot,gondola_number:locationMap.get(c.product_id)??null});
  }

  const {data:historySync,error:historySyncError}=await db.from("vitrine_history_sync_outbox")
    .select("order_id,state,attempt_count,last_attempt_at,last_synced_at,last_error,remote_order_id,remote_customer_id")
    .eq("order_id",id)
    .maybeSingle();
  if(historySyncError)throw historySyncError;

  return {
    order,
    customer,
    history_sync:historySync??{state:"pending",attempt_count:0,last_error:null},
    items:(items??[]).map((item:any)=>{
      const p=pMap.get(item.product_id);
      return {
        ...item,
        image_url:p?.image_url ?? item.metadata?.image_url ?? "",
        gondola_number:locationMap.get(item.product_id)??null,
        components:groupedComponents.get(item.id)??[]
      };
    })
  };
}

async function orderStockReservationItems(orderId:string) {
  const {data:items,error:iErr}=await db.from("order_items")
    .select("id,item_kind,product_id,quantity")
    .eq("organization_id",ORG_ID)
    .eq("order_id",orderId);
  if(iErr)throw iErr;
  const rows=items??[];
  const basketItemIds=rows.filter((x:any)=>x.item_kind==="basket").map((x:any)=>x.id);
  let components:any[]=[];
  if(basketItemIds.length){
    const {data,error}=await db.from("order_item_components")
      .select("order_item_id,product_id,quantity")
      .eq("organization_id",ORG_ID)
      .in("order_item_id",basketItemIds);
    if(error)throw error;
    components=data??[];
  }
  const basketQty=new Map(rows.filter((x:any)=>x.item_kind==="basket").map((x:any)=>[x.id,Number(x.quantity||0)]));
  const demand=new Map<string,number>();
  const add=(productId:string,quantity:number)=>{
    if(!productId||quantity<=0)return;
    demand.set(productId,Math.round(((demand.get(productId)??0)+quantity)*1000)/1000);
  };
  for(const item of rows)if(item.item_kind==="product"&&item.product_id)add(item.product_id,Number(item.quantity||0));
  for(const c of components)add(c.product_id,Number(c.quantity||0)*Number(basketQty.get(c.order_item_id)||0));
  return [...demand.entries()].map(([product_id,quantity])=>({product_id,quantity})).sort((a,b)=>a.product_id.localeCompare(b.product_id));
}

async function consumeOrderStock(payload:any) {
  const id=uuid(payload?.id);
  if(!id)return {error:"invalid_order",status:400};

  const {data:order,error:oErr}=await db.from("orders")
    .select("id,status,payment_method_snapshot")
    .eq("organization_id",ORG_ID)
    .eq("id",id)
    .maybeSingle();
  if(oErr)throw oErr;
  if(!order)return {error:"order_not_found",status:404};
  if(order.status==="cancelled")return {error:"order_cancelled",status:409};

  const payment=order.payment_method_snapshot&&typeof order.payment_method_snapshot==="object"
    ? order.payment_method_snapshot : {};

  if(payment.stock_model==="reservation_v2"){
    const {data:consumed,error}=await db.rpc("consume_storefront_order_stock_v2",{
      p_organization_id:ORG_ID,p_order_id:id
    });
    if(error)throw error;
    if(!consumed?.ok)return {error:String(consumed?.error||"stock_consume_failed"),status:409,...consumed};

    const nextPayment={...payment,stock_reserved:true,stock_consumed:true,stock_released:false,stock_consumed_at:new Date().toISOString()};
    const {error:uErr}=await db.from("orders")
      .update({payment_method_snapshot:nextPayment,status:order.status==="created"?"processing":order.status})
      .eq("organization_id",ORG_ID).eq("id",id);
    if(uErr)throw uErr;
    const stockItems=await orderStockReservationItems(id);
    try{await queueBlingStockSnapshots(stockItems.map((x:any)=>x.product_id),"order_separation")}catch{}
    const historySync=await syncVitrineOrderHistory(db,id,ORG_ID);
    return {order_id:id,stock_status:"consumed",already_consumed:Boolean(consumed.already_consumed),history_synced:Boolean(historySync.ok)};
  }

  if(payment.stock_reserved===true){
    // Legacy model already deducted physical stock when the order was created.
    return {order_id:id,stock_status:"legacy_already_deducted",already_consumed:true};
  }

  const stockItems=await orderStockReservationItems(id);
  if(!stockItems.length)return {error:"empty_order_stock",status:409};

  const {data:reserved,error:rErr}=await db.rpc("reserve_storefront_order_stock_v2",{
    p_organization_id:ORG_ID,p_order_id:id,p_items:stockItems
  });
  if(rErr)throw rErr;
  if(!reserved?.ok)return {error:String(reserved?.error||"insufficient_stock"),status:409,...reserved};

  const {data:consumed,error:cErr}=await db.rpc("consume_storefront_order_stock_v2",{
    p_organization_id:ORG_ID,p_order_id:id
  });
  if(cErr)throw cErr;
  if(!consumed?.ok)return {error:String(consumed?.error||"stock_consume_failed"),status:409,...consumed};

  const nextPayment={...payment,stock_reserved:true,stock_consumed:true,stock_released:false,stock_model:"reservation_v2",stock_consumed_at:new Date().toISOString()};
  const {error:uErr}=await db.from("orders")
    .update({payment_method_snapshot:nextPayment,status:order.status==="created"?"processing":order.status})
    .eq("organization_id",ORG_ID).eq("id",id);
  if(uErr)throw uErr;

  try{await queueBlingStockSnapshots(stockItems.map((x:any)=>x.product_id),"order_separation")}catch{}
  const historySync=await syncVitrineOrderHistory(db,id,ORG_ID);
  return {order_id:id,stock_status:"consumed",already_consumed:false,history_synced:Boolean(historySync.ok)};
}

async function blingHubControl(subaction:string,extra:any={}) {
  const allowed=new Set(["readiness","probe_readonly","reconcile_products_readonly","reconcile_product_catalog_readonly","enqueue_job","enqueue_jobs"]);
  if(!allowed.has(subaction))return {error:"invalid_bling_action",status:400};

  const secret=await db.from("internal_integration_secrets")
    .select("secret_value")
    .eq("integration_key","bling_hub_v2")
    .maybeSingle();
  if(secret.error)throw secret.error;
  if(!secret.data?.secret_value)return {error:"bling_bridge_not_configured",status:503};

  const response=await fetch(CANONICAL_ADMIN_API,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-dona-antonia-bling-hub-key":String(secret.data.secret_value)
    },
    body:JSON.stringify({action:"vitrine_bling_hub_internal",subaction,...extra}),
    signal:AbortSignal.timeout(["probe_readonly","reconcile_products_readonly","reconcile_product_catalog_readonly"].includes(subaction)?120000:10000)
  });
  const data=await response.json().catch(()=>({ok:false,error:"invalid_bling_response"}));
  if(response.status>=400)return {error:String(data?.error||"bling_hub_unavailable"),status:response.status,detail:data?.detail||null};
  return {data};
}

async function reconcileBlingProductCatalogReadonly(){
  const all:any[]=[];
  for(let offset=0;offset<3000;offset+=1000){
    const q=await db.from("products")
      .select("id,sku,gtin,name")
      .eq("organization_id",ORG_ID)
      .eq("active",true)
      .order("id",{ascending:true})
      .range(offset,offset+999);
    if(q.error)throw q.error;
    all.push(...(q.data||[]));
    if((q.data||[]).length<1000)break;
  }
  const items=all.map((p:any)=>({source_id:p.id,sku:p.sku||"",gtin:p.gtin||"",name:p.name||""}));
  const remote=await blingHubControl("reconcile_product_catalog_readonly",{items});
  if((remote as any).error)return remote;
  return (remote as any).data;
}
async function reconcileBlingProductsReadonly(payload:any){
  const offset=Math.max(0,Math.min(100000,Math.floor(Number(payload?.offset||0))));
  const limit=Math.max(1,Math.min(25,Math.floor(Number(payload?.limit||20))));
  const rows=await db.from("products")
    .select("id,sku,gtin,name")
    .eq("organization_id",ORG_ID)
    .eq("active",true)
    .order("id",{ascending:true})
    .range(offset,offset+limit-1);
  if(rows.error)throw rows.error;
  const items=(rows.data||[]).map((p:any)=>({source_id:p.id,sku:p.sku||"",gtin:p.gtin||"",name:p.name||""}));
  if(!items.length)return {processed:0,results:[],next_offset:null};
  const remote=await blingHubControl("reconcile_products_readonly",{items});
  if((remote as any).error)return remote;
  return {
    ...(remote as any).data,
    offset,limit,
    next_offset:items.length===limit?offset+items.length:null
  };
}
async function queueBlingStockSnapshots(productIds:string[],reason:string){
  const ids=[...new Set((productIds||[]).filter(Boolean))];
  if(!ids.length)return false;
  const q=await db.from("products").select("id,gtin,sku,name,stock_quantity,updated_at")
    .eq("organization_id",ORG_ID).in("id",ids);
  if(q.error)throw q.error;
  const stamp=new Date().toISOString();
  const jobs=(q.data||[]).map((p:any)=>({
    domain:"stock",operation:"set_stock",source_id:p.id,
    idempotency_key:"vitrine_qx:stock:"+p.id+":"+stamp,
    payload:{product_id:p.id,gtin:p.gtin||"",sku:p.sku||"",name:p.name||"",stock_quantity:Number(p.stock_quantity||0),reason,occurred_at:stamp}
  }));
  if(!jobs.length)return false;
  const result=await blingHubControl("enqueue_jobs",{jobs});
  return !(result as any).error;
}
async function retryHistorySync(payload:any) {
  const id=uuid(payload?.id);
  if(!id)return {error:"invalid_order",status:400};
  const {data:order,error}=await db.from("orders")
    .select("id")
    .eq("organization_id",ORG_ID)
    .eq("id",id)
    .maybeSingle();
  if(error)throw error;
  if(!order)return {error:"order_not_found",status:404};
  const result=await syncVitrineOrderHistory(db,id,ORG_ID);
  if(!result.ok)return {error:"history_sync_failed",detail:result.error,status:502};
  return {order_id:id,history_synced:true,remote_order_id:result.order_id??null,remote_customer_id:result.customer_id??null};
}

async function updateOrder(payload:any) {
  const id=uuid(payload?.id);
  if (!id) return { error:"invalid_order",status:400 };

  const {data:currentOrder,error:currentErr}=await db.from("orders")
    .select("id,status,payment_method_snapshot,delivery_address_snapshot")
    .eq("organization_id",ORG_ID)
    .eq("id",id)
    .maybeSingle();
  if(currentErr)throw currentErr;
  if(!currentOrder)return {error:"order_not_found",status:404};

  const patch:any={};
  const currentPayment=currentOrder.payment_method_snapshot&&typeof currentOrder.payment_method_snapshot==="object"
    ? currentOrder.payment_method_snapshot : {};
  let stockReleasedChange:null|boolean=null;
  const allowedStatuses=new Set(["created","confirmed","processing","ready","out_for_delivery","delivered","cancelled"]);
  if (payload?.status !== undefined) {
    const status=text(payload.status,40);
    if (!allowedStatuses.has(status)) return {error:"invalid_status",status:400};

    const storefrontReserved=currentPayment.source==="vitrine"&&currentPayment.stock_reserved===true;
    const alreadyReleased=currentPayment.stock_released===true;
    const reservationV2=currentPayment.stock_model==="reservation_v2";

    if(storefrontReserved&&status==="cancelled"&&currentOrder.status!=="cancelled"&&!alreadyReleased){
      if(reservationV2){
        const {data:released,error}=await db.rpc("release_storefront_order_stock_v2",{p_organization_id:ORG_ID,p_order_id:id});
        if(error)throw error;
        if(!released?.ok)return {error:String(released?.error||"stock_release_failed"),status:409};
      }else{
        const stockItems=await orderStockReservationItems(id);
        if(stockItems.length){
          const {data:released,error}=await db.rpc("release_storefront_stock_v1",{p_organization_id:ORG_ID,p_items:stockItems});
          if(error)throw error;
          if(!released?.ok)return {error:String(released?.error||"stock_release_failed"),status:409};
        }
      }
      stockReleasedChange=true;
    }else if(storefrontReserved&&currentOrder.status==="cancelled"&&status!=="cancelled"&&alreadyReleased){
      const stockItems=await orderStockReservationItems(id);
      if(stockItems.length){
        if(reservationV2){
          const {data:reserved,error}=await db.rpc("reserve_storefront_order_stock_v2",{p_organization_id:ORG_ID,p_order_id:id,p_items:stockItems});
          if(error)throw error;
          if(!reserved?.ok)return {error:String(reserved?.error||"insufficient_stock"),status:409};
        }else{
          const {data:reserved,error}=await db.rpc("reserve_storefront_stock_v1",{p_organization_id:ORG_ID,p_items:stockItems});
          if(error)throw error;
          if(!reserved?.ok)return {error:String(reserved?.error||"insufficient_stock"),status:409};
        }
      }
      stockReleasedChange=false;
    }

    patch.status=status;
    if (status==="confirmed") patch.confirmed_at=new Date().toISOString();
    if (status==="delivered") patch.delivered_at=new Date().toISOString();
  }

  if (payload?.customer_snapshot !== undefined) {
    const snap=payload.customer_snapshot;
    patch.customer_id=null;
    if (snap && uuid(snap.id)) {
      const a=snap.address && typeof snap.address==="object" ? snap.address : {};
      patch.delivery_address_snapshot={
        ...(currentOrder.delivery_address_snapshot&&typeof currentOrder.delivery_address_snapshot==="object"?currentOrder.delivery_address_snapshot:{}),
        source_customer_id:uuid(snap.id),
        customer_name:text(snap.display_name,180),
        recipient_name:text(snap.display_name,180),
        phone:text(snap.phone,40),
        cpf:text(snap.cpf,30),
        email:text(snap.email,180),
        postal_code:maybeText(a.postal_code,20),
        street:maybeText(a.street,180),
        number:maybeText(a.number,40),
        complement:maybeText(a.complement,140),
        district:maybeText(a.district,140),
        city:maybeText(a.city,120),
        state:maybeText(a.state,2),
        country_code:"BR",
        raw_text:maybeText(a.raw_text,400),
        google_maps_url:maybeText(a.google_maps_url,800),
        block:maybeText(a.block,80)
      };
    } else {
      patch.delivery_address_snapshot=null;
    }
  } else if (payload?.customer_id !== undefined) {
    const customerId=uuid(payload.customer_id);
    patch.customer_id=customerId || null;
    if (customerId) {
      const { data:c,error:cErr }=await db.from("customers")
        .select("id,display_name")
        .eq("organization_id",ORG_ID)
        .eq("id",customerId)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!c) return {error:"customer_not_found",status:404};
      const { data:a,error:aErr }=await db.from("customer_addresses")
        .select("recipient_name,postal_code,street,number,complement,district,city,state,country_code,raw_text")
        .eq("organization_id",ORG_ID)
        .eq("customer_id",customerId)
        .eq("active",true)
        .order("is_default",{ascending:false})
        .limit(1)
        .maybeSingle();
      if (aErr) throw aErr;
      patch.delivery_address_snapshot=a??null;
    } else {
      patch.delivery_address_snapshot=null;
    }
  }

  if (payload?.payment_method !== undefined) {
    const payment=text(payload.payment_method,80);
    patch.payment_method_snapshot={...currentPayment,method:payment,label:payment,timing:"on_delivery",source:currentPayment.source||"admin"};
  }
  if(stockReleasedChange!==null){
    patch.payment_method_snapshot={
      ...(patch.payment_method_snapshot??currentPayment),
      stock_released:stockReleasedChange,
      ...(currentPayment.stock_model==="reservation_v2"&&stockReleasedChange===true?{stock_consumed:false}: {})
    };
  }

  const { data,error }=await db.from("orders")
    .update(patch)
    .eq("organization_id",ORG_ID)
    .eq("id",id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return {error:"order_not_found",status:404};
  if(stockReleasedChange===true){
    try{
      const stockItems=await orderStockReservationItems(data.id);
      await queueBlingStockSnapshots(stockItems.map((x:any)=>x.product_id),"order_cancelled");
    }catch{}
  }
  const historySync=await syncVitrineOrderHistory(db,data.id,ORG_ID);
  return {order_id:data.id,stock_released:stockReleasedChange,history_synced:Boolean(historySync.ok)};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors(req)});

  try {
    const url=new URL(req.url);
    const action=text(url.searchParams.get("action") || "health",50);

    if (req.method==="GET" && action==="health") return json(req,{ok:true,service:"vitrine-admin-v1"});
    if (req.method==="GET" && action==="products") return json(req,{ok:true,...await listProducts(url)});
    if (req.method==="GET" && action==="product_facets") return json(req,{ok:true,...await productFacets(url.searchParams.get("category"))});
    if (req.method==="GET" && action==="customers") return json(req,{ok:true,customers:await listCustomers(url)});
    if (req.method==="GET" && action==="orders") return json(req,{ok:true,orders:await listOrders()});
    if (req.method==="GET" && action==="bling_status") {
      const result=await blingHubControl("readiness");
      if ((result as any).error) return json(req,{ok:false,error:(result as any).error,detail:(result as any).detail},(result as any).status);
      return json(req,{ok:true,bling:(result as any).data?.readiness??null});
    }
    if (req.method==="GET" && action==="ean_lookup") {
      const result=await findProductByEan(url.searchParams.get("ean"));
      if ((result as any).error) return json(req,{ok:false,error:(result as any).error},(result as any).status);
      return json(req,{ok:true,...result});
    }
    if (req.method==="GET" && action==="gondolas") return json(req,{ok:true,gondolas:await listGondolas()});
    if (req.method==="GET" && action==="gondola") {
      const result=await getGondola(url.searchParams.get("id"));
      if ((result as any).error) return json(req,{ok:false,error:(result as any).error},(result as any).status);
      return json(req,{ok:true,...result});
    }
    if (req.method==="GET" && action==="order") {
      const id=uuid(url.searchParams.get("id"));
      if (!id) return json(req,{ok:false,error:"invalid_order"},400);
      const result=await orderDetail(id);
      if (result.error) return json(req,{ok:false,error:result.error},result.status);
      return json(req,{ok:true,...result});
    }

    if (req.method==="POST") {
      const payload=await req.json().catch(()=>({}));
      if (action==="product_save") {
        const result=await saveProduct(payload);
        if (result.error) return json(req,{ok:false,error:result.error},result.status);
        return json(req,{ok:true,...result});
      }
      if (action==="customer_save") {
        const result=await saveCustomer(payload);
        if (result.error) return json(req,{ok:false,error:result.error},result.status);
        return json(req,{ok:true,...result});
      }
      if (action==="order_update") {
        const result=await updateOrder(payload);
        if (result.error) return json(req,{ok:false,error:result.error},result.status);
        return json(req,{ok:true,...result});
      }
      if (action==="order_consume_stock") {
        const result=await consumeOrderStock(payload);
        if (result.error) return json(req,{ok:false,...result},result.status);
        return json(req,{ok:true,...result});
      }
      if (action==="history_sync_retry") {
        const result=await retryHistorySync(payload);
        if (result.error) return json(req,{ok:false,...result},result.status);
        return json(req,{ok:true,...result});
      }
      if (action==="bling_probe_readonly") {
        const result=await blingHubControl("probe_readonly");
        if ((result as any).error) return json(req,{ok:false,error:(result as any).error,detail:(result as any).detail},(result as any).status);
        return json(req,{ok:true,probe:(result as any).data});
      }
      if (action==="bling_reconcile_products_readonly") {
        const result=await reconcileBlingProductsReadonly(payload);
        if ((result as any).error) return json(req,{ok:false,error:(result as any).error,detail:(result as any).detail},(result as any).status);
        return json(req,{ok:true,...result});
      }
      if (action==="bling_reconcile_catalog_readonly") {
        const result=await reconcileBlingProductCatalogReadonly();
        if ((result as any).error) return json(req,{ok:false,error:(result as any).error,detail:(result as any).detail},(result as any).status);
        return json(req,{ok:true,...result});
      }
      if (action==="balance_confirm") {
        const result=await balanceConfirm(payload);
        if ((result as any).error) return json(req,{ok:false,error:(result as any).error},(result as any).status);
        return json(req,{ok:true,...result});
      }
      if (action==="gondola_create") {
        const result=await createGondola(payload);
        if ((result as any).error) return json(req,{ok:false,error:(result as any).error},(result as any).status);
        return json(req,{ok:true,...result});
      }
      if (action==="gondola_assign") {
        const result=await assignGondolaProduct(payload);
        if ((result as any).error) return json(req,{ok:false,error:(result as any).error},(result as any).status);
        return json(req,{ok:true,...result});
      }
      if (action==="gondola_remove") {
        const result=await removeGondolaProduct(payload);
        if ((result as any).error) return json(req,{ok:false,error:(result as any).error},(result as any).status);
        return json(req,{ok:true,...result});
      }
    }

    return json(req,{ok:false,error:"not_found"},404);
  } catch (error) {
    console.error("vitrine-admin-v1", error);
    const message=String((error as any)?.message ?? "");
    const status=message.includes("duplicate key") ? 409 : 500;
    return json(req,{ok:false,error:status===409?"duplicate_value":"service_unavailable"},status);
  }
});