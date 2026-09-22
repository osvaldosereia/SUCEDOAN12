import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET_KEYS = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); }
  catch { return {}; }
})();
const SERVER_KEY = SECRET_KEYS.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORG_ID = "95b1b61d-f6ed-41cb-8917-b55f6793b10b";
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
  const offset = Math.floor(num(url.searchParams.get("offset"), 0, 5000));
  const limit = Math.floor(num(url.searchParams.get("limit") ?? 60, 1, 100));

  let query = db.from("products")
    .select("id,sku,gtin,name,description,active,sale_price_cents,stock_quantity,image_url,metadata,updated_at")
    .eq("organization_id", ORG_ID)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);
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
      category: p.metadata?.sales_category ?? p.metadata?.storefront_category ?? ""
    })),
    next_offset: rows.length === limit ? offset + limit : null
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
      .select("id")
      .single();
    if (error) throw error;
    return { product_id:data.id };
  }
  const { data, error } = await db.from("products")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return { product_id:data.id };
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
  return rows.map((r:any)=>({
    ...r,
    customer_name:r.customer_id
      ? cMap.get(r.customer_id)??""
      : r.delivery_address_snapshot?.customer_name ?? r.delivery_address_snapshot?.recipient_name ?? ""
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
    groupedComponents.get(c.order_item_id)!.push({...c,image_url:p?.image_url??"",product_name:p?.name??c.name_snapshot});
  }

  return {
    order,
    customer,
    items:(items??[]).map((item:any)=>{
      const p=pMap.get(item.product_id);
      return {
        ...item,
        image_url:p?.image_url ?? item.metadata?.image_url ?? "",
        components:groupedComponents.get(item.id)??[]
      };
    })
  };
}

async function updateOrder(payload:any) {
  const id=uuid(payload?.id);
  if (!id) return { error:"invalid_order",status:400 };
  const patch:any={};
  const allowedStatuses=new Set(["created","confirmed","processing","ready","out_for_delivery","delivered","cancelled"]);
  if (payload?.status !== undefined) {
    const status=text(payload.status,40);
    if (!allowedStatuses.has(status)) return {error:"invalid_status",status:400};
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
    patch.payment_method_snapshot={method:payment,label:payment,timing:"on_delivery",source:"admin"};
  }

  const { data,error }=await db.from("orders")
    .update(patch)
    .eq("organization_id",ORG_ID)
    .eq("id",id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return {error:"order_not_found",status:404};
  return {order_id:data.id};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors(req)});

  try {
    const url=new URL(req.url);
    const action=text(url.searchParams.get("action") || "health",50);

    if (req.method==="GET" && action==="health") return json(req,{ok:true,service:"vitrine-admin-v1"});
    if (req.method==="GET" && action==="products") return json(req,{ok:true,...await listProducts(url)});
    if (req.method==="GET" && action==="customers") return json(req,{ok:true,customers:await listCustomers(url)});
    if (req.method==="GET" && action==="orders") return json(req,{ok:true,orders:await listOrders()});
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
    }

    return json(req,{ok:false,error:"not_found"},404);
  } catch (error) {
    console.error("vitrine-admin-v1", error);
    const message=String((error as any)?.message ?? "");
    const status=message.includes("duplicate key") ? 409 : 500;
    return json(req,{ok:false,error:status===409?"duplicate_value":"service_unavailable"},status);
  }
});