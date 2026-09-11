import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const json=(body:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const numberValue=(v:unknown)=>{if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n:null};
const integer=(v:unknown,min=-100000,max=100000)=>Math.min(max,Math.max(min,Number.parseInt(String(v??0),10)||0));
const normalizePhone=(v:unknown)=>{let d=digits(v);if(!d)return null;if(d.startsWith("55")&&(d.length===12||d.length===13))return `+${d}`;if(d.length===10||d.length===11)return `+55${d}`;return null};
const validGtin=(value:unknown)=>{const g=digits(value);if(!g)return true;if(![8,12,13,14].includes(g.length))return false;const expected=Number(g.at(-1));let sum=0;for(let i=g.length-2,o=0;i>=0;i--,o++)sum+=Number(g[i])*(o%2===0?3:1);return(10-(sum%10))%10===expected};
const safeGoogleMapsUrl=(v:unknown)=>{const raw=clean(v,1200);if(!raw)return null;try{const u=new URL(raw);const h=u.hostname.toLowerCase();const allowed=u.protocol==="https:"&&(h==="maps.app.goo.gl"||h==="goo.gl"||h==="google.com"||h.endsWith(".google.com"));return allowed?u.toString():null}catch{return null}};
const safeSearch=(v:unknown,max=100)=>clean(v,max).replace(/[,%()]/g," ").trim();

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({ok:false,error:"origin_not_allowed"},403,null);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405,origin);
  const url=Deno.env.get("SUPABASE_URL"),serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceRole)return json({ok:false,error:"server_config"},500,origin);
  const sb=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400,origin)}
  const action=clean(body?.action||"health",60).toLowerCase();
  const respond=(payload:unknown,status=200)=>json(payload,status,origin);

  if(action==="health")return respond({ok:true,mode:"public_no_auth",version:3});

  if(action==="dashboard"){
    const [active,noImage,noStock,baskets,offers,recent]=await Promise.all([
      sb.from("products").select("id",{count:"exact",head:true}).eq("is_active",true),
      sb.from("products").select("id",{count:"exact",head:true}).eq("is_active",true).or("image_url.is.null,image_url.eq."),
      sb.from("products").select("id",{count:"exact",head:true}).eq("is_active",true).lte("stock",0),
      sb.from("basket_templates").select("id",{count:"exact",head:true}).eq("is_active",true),
      sb.from("products").select("id",{count:"exact",head:true}).eq("is_active",true).eq("is_offer",true),
      sb.from("orders").select("id,order_number,phone_e164,status,total,created_at").eq("source","storefront_v2").order("created_at",{ascending:false}).limit(8)
    ]);
    return respond({ok:true,stats:{active_products:active.count||0,no_image:noImage.count||0,no_stock:noStock.count||0,active_baskets:baskets.count||0,offers:offers.count||0,recent_orders:recent.data?.length||0},recent_orders:recent.data||[]});
  }

  if(action==="storefront"){
    const [categories,products,baskets]=await Promise.all([
      sb.from("storefront_v3_categories").select("name,is_visible,show_home,sort_order,updated_at").order("sort_order",{ascending:true}).order("name",{ascending:true}),
      sb.from("products").select("id,name,image_url,price,category,storefront_featured,is_offer,is_active,physically_verified,stock").eq("storefront_featured",true).order("sort_order",{ascending:true}).order("name",{ascending:true}).limit(50),
      sb.from("basket_templates").select("id,name,image_url,base_price,is_featured,is_active,sort_order").eq("is_featured",true).order("sort_order",{ascending:true}).order("name",{ascending:true}).limit(30)
    ]);
    if(categories.error)return respond({ok:false,error:"storefront_failed",detail:categories.error.message},400);
    return respond({ok:true,categories:categories.data||[],featured_products:products.data||[],featured_baskets:baskets.data||[]});
  }

  if(action==="save_storefront"){
    const categories=Array.isArray(body?.categories)?body.categories.slice(0,100):[];
    if(categories.length){
      const rows=categories.map((row:any)=>({name:clean(row?.name,120),is_visible:row?.is_visible!==false,show_home:row?.show_home===true,sort_order:integer(row?.sort_order,0,100000),updated_at:new Date().toISOString()})).filter((row:any)=>row.name);
      const {error}=await sb.from("storefront_v3_categories").upsert(rows,{onConflict:"name"});if(error)return respond({ok:false,error:"category_save_failed",detail:error.message},400);
    }
    if(Array.isArray(body?.featured_product_ids)){
      const ids=body.featured_product_ids.map((x:any)=>clean(x,80)).filter(Boolean).slice(0,50);
      const clear=await sb.from("products").update({storefront_featured:false}).eq("storefront_featured",true);if(clear.error)return respond({ok:false,error:"featured_products_clear_failed",detail:clear.error.message},400);
      if(ids.length){const set=await sb.from("products").update({storefront_featured:true}).in("id",ids);if(set.error)return respond({ok:false,error:"featured_products_save_failed",detail:set.error.message},400)}
    }
    if(Array.isArray(body?.featured_basket_ids)){
      const ids=body.featured_basket_ids.map((x:any)=>clean(x,80)).filter(Boolean).slice(0,30);
      const clear=await sb.from("basket_templates").update({is_featured:false}).eq("is_featured",true);if(clear.error)return respond({ok:false,error:"featured_baskets_clear_failed",detail:clear.error.message},400);
      if(ids.length){const set=await sb.from("basket_templates").update({is_featured:true}).in("id",ids);if(set.error)return respond({ok:false,error:"featured_baskets_save_failed",detail:set.error.message},400)}
    }
    return respond({ok:true});
  }

  if(action==="products"){
    const page=Math.max(1,integer(body?.page,1,100000)),limit=Math.min(100,Math.max(12,integer(body?.limit,12,100))),from=(page-1)*limit,to=from+limit-1;
    const q=safeSearch(body?.q),status=clean(body?.status,30),category=clean(body?.category,120);
    let query=sb.from("products").select("id,sku,name,gtin,price,cost,stock,image_url,brand,category,packaging,is_active,is_offer,storefront_featured,sort_order,physically_verified,source_system,updated_at",{count:"exact"}).range(from,to);
    if(q)query=query.or(`name.ilike.%${q}%,gtin.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%`);
    if(category)query=query.eq("category",category);
    if(status==="active")query=query.eq("is_active",true);else if(status==="inactive")query=query.eq("is_active",false);else if(status==="offer")query=query.eq("is_offer",true);else if(status==="featured")query=query.eq("storefront_featured",true);else if(status==="no-stock")query=query.lte("stock",0);
    query=query.order("sort_order",{ascending:true,nullsFirst:false}).order("name",{ascending:true});
    const {data,error,count}=await query;if(error)return respond({ok:false,error:"products_failed",detail:error.message},400);
    return respond({ok:true,products:data||[],total:count||0,page,limit});
  }

  if(action==="product"){
    const id=clean(body?.id,80);if(!id)return respond({ok:false,error:"id_required"},400);
    const {data,error}=await sb.from("products").select("id,sku,name,gtin,ncm,price,cost,stock,image_url,brand,category,subcategory,packaging,validity_date,gondola,shelf,is_active,is_offer,storefront_featured,sort_order,description_short,description_long,tags,physically_verified,source_system,updated_at").eq("id",id).maybeSingle();
    if(error||!data)return respond({ok:false,error:"product_not_found"},404);return respond({ok:true,product:data});
  }

  if(action==="save_product"){
    const id=clean(body?.id,80);if(!id)return respond({ok:false,error:"id_required"},400);const src=body?.patch&&typeof body.patch==="object"?body.patch:body;const patch:any={updated_at:new Date().toISOString(),last_admin_edit_at:new Date().toISOString(),last_admin_edit_by:null};
    for(const [key,max] of [["name",180],["sku",100],["brand",180],["category",180],["subcategory",180],["packaging",180],["image_url",1200],["description_short",1000],["description_long",5000],["gondola",80],["shelf",80]] as const){if(src[key]!==undefined)patch[key]=clean(src[key],max)||null}
    if(src.gtin!==undefined){if(!validGtin(src.gtin))return respond({ok:false,error:"invalid_gtin"},400);patch.gtin=digits(src.gtin)||null}
    if(src.ncm!==undefined){const n=digits(src.ncm);if(n&&n.length!==8)return respond({ok:false,error:"invalid_ncm"},400);patch.ncm=n||null}
    for(const key of ["price","cost","stock"]){if(src[key]!==undefined){const n=numberValue(src[key]);if(n!==null&&n<0)return respond({ok:false,error:`invalid_${key}`},400);patch[key]=n}}
    if(src.sort_order!==undefined)patch.sort_order=integer(src.sort_order);
    for(const key of ["is_active","is_offer","storefront_featured"]){if(typeof src[key]==="boolean")patch[key]=src[key]}
    if(src.validity_date!==undefined)patch.validity_date=clean(src.validity_date,10)||null;
    if(src.tags!==undefined)patch.tags=Array.isArray(src.tags)?src.tags.map((x:any)=>clean(x,80)).filter(Boolean).slice(0,50):[];
    if(patch.name!==undefined&&!patch.name)return respond({ok:false,error:"name_required"},400);
    const {data,error}=await sb.from("products").update(patch).eq("id",id).select("id,sku,name,gtin,ncm,price,cost,stock,image_url,brand,category,subcategory,packaging,validity_date,gondola,shelf,is_active,is_offer,storefront_featured,sort_order,description_short,description_long,tags,physically_verified,source_system,updated_at").single();
    if(error)return respond({ok:false,error:"product_save_failed",detail:error.message},400);return respond({ok:true,product:data});
  }

  if(action==="baskets"){
    const q=safeSearch(body?.q);let query=sb.from("basket_templates").select("id,sku,name,description,image_url,base_price,is_active,is_featured,sort_order,updated_at,basket_template_items(count)",{count:"exact"}).order("sort_order",{ascending:true}).order("name",{ascending:true});
    if(q)query=query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);const {data,error,count}=await query;if(error)return respond({ok:false,error:"baskets_failed",detail:error.message},400);return respond({ok:true,baskets:data||[],total:count||0});
  }

  if(action==="basket"){
    const id=clean(body?.id,80);if(!id)return respond({ok:false,error:"id_required"},400);
    const {data:basket,error}=await sb.from("basket_templates").select("id,sku,name,description,image_url,base_price,is_active,is_featured,sort_order,internal_notes,updated_at").eq("id",id).maybeSingle();if(error||!basket)return respond({ok:false,error:"basket_not_found"},404);
    const {data:items}=await sb.from("basket_template_items").select("id,product_id,quantity,removable,quantity_editable,min_quantity,max_quantity,sort_order,product:products(id,name,sku,gtin,image_url,brand,packaging,stock,price,is_active,physically_verified)").eq("basket_id",id).order("sort_order",{ascending:true}).order("created_at",{ascending:true});
    return respond({ok:true,basket,items:items||[]});
  }

  if(action==="save_basket"){
    const id=clean(body?.id,80),name=clean(body?.name,180),price=numberValue(body?.base_price);if(!name)return respond({ok:false,error:"name_required"},400);if(price===null||price<0)return respond({ok:false,error:"invalid_base_price"},400);
    const row:any={name,sku:clean(body?.sku,100)||null,description:clean(body?.description,3000)||null,image_url:clean(body?.image_url,1200)||null,base_price:price,is_active:body?.is_active!==false,is_featured:body?.is_featured===true,sort_order:integer(body?.sort_order),internal_notes:clean(body?.internal_notes,3000)||null,updated_by:null,updated_at:new Date().toISOString()};
    if(id){const {data,error}=await sb.from("basket_templates").update(row).eq("id",id).select("id,sku,name,description,image_url,base_price,is_active,is_featured,sort_order").single();if(error)return respond({ok:false,error:"basket_save_failed",detail:error.message},400);return respond({ok:true,basket:data})}
    const {data,error}=await sb.from("basket_templates").insert({...row,is_whatsapp_active:false}).select("id,sku,name,description,image_url,base_price,is_active,is_featured,sort_order").single();if(error)return respond({ok:false,error:"basket_save_failed",detail:error.message},400);return respond({ok:true,basket:data});
  }

  if(action==="search_products"){
    const q=safeSearch(body?.q);if(q.length<2)return respond({ok:true,products:[]});let query=sb.from("products").select("id,name,sku,gtin,image_url,brand,packaging,stock,price,is_active,physically_verified").eq("is_active",true).limit(30);query=query.or(`name.ilike.%${q}%,gtin.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%`);const {data,error}=await query;if(error)return respond({ok:false,error:"product_search_failed",detail:error.message},400);return respond({ok:true,products:data||[]});
  }

  if(action==="add_basket_item"){
    const basketId=clean(body?.basket_id,80),productId=clean(body?.product_id,80),qty=numberValue(body?.quantity);if(!basketId||!productId)return respond({ok:false,error:"ids_required"},400);if(qty===null||qty<=0)return respond({ok:false,error:"invalid_quantity"},400);
    const {data:existing}=await sb.from("basket_template_items").select("id").eq("basket_id",basketId).eq("product_id",productId).maybeSingle();if(existing){const {data,error}=await sb.from("basket_template_items").update({quantity:qty}).eq("id",existing.id).select("*").single();if(error)return respond({ok:false,error:"item_save_failed",detail:error.message},400);return respond({ok:true,item:data})}
    const {data,error}=await sb.from("basket_template_items").insert({basket_id:basketId,product_id:productId,quantity:qty,removable:body?.removable!==false,quantity_editable:body?.quantity_editable!==false,min_quantity:0,max_quantity:null,substitution_group:null,pricing_rule:{},sort_order:integer(body?.sort_order,0,100000)}).select("*").single();if(error)return respond({ok:false,error:"item_save_failed",detail:error.message},400);return respond({ok:true,item:data});
  }

  if(action==="update_basket_item"){
    const id=clean(body?.id,80);if(!id)return respond({ok:false,error:"id_required"},400);const patch:any={};if(body?.quantity!==undefined){const q=numberValue(body.quantity);if(q===null||q<=0)return respond({ok:false,error:"invalid_quantity"},400);patch.quantity=q}if(typeof body?.removable==="boolean")patch.removable=body.removable;if(typeof body?.quantity_editable==="boolean")patch.quantity_editable=body.quantity_editable;if(body?.sort_order!==undefined)patch.sort_order=integer(body.sort_order,0,100000);const {data,error}=await sb.from("basket_template_items").update(patch).eq("id",id).select("*").single();if(error)return respond({ok:false,error:"item_save_failed",detail:error.message},400);return respond({ok:true,item:data});
  }

  if(action==="remove_basket_item"){
    const id=clean(body?.id,80);if(!id)return respond({ok:false,error:"id_required"},400);const {error}=await sb.from("basket_template_items").delete().eq("id",id);if(error)return respond({ok:false,error:"remove_failed",detail:error.message},400);return respond({ok:true});
  }

  if(action==="categories"){
    const {data,error}=await sb.from("storefront_v3_categories").select("name,is_visible,show_home,sort_order,updated_at").order("sort_order",{ascending:true}).order("name",{ascending:true});if(error)return respond({ok:false,error:"categories_failed",detail:error.message},400);
    const {data:productRows}=await sb.from("products").select("category").not("category","is",null).limit(5000);const counts=new Map<string,number>();for(const row of productRows||[]){const name=clean((row as any).category,120);if(name)counts.set(name,(counts.get(name)||0)+1)}
    return respond({ok:true,categories:(data||[]).map((c:any)=>({...c,product_count:counts.get(c.name)||0}))});
  }

  if(action==="save_category"){
    const name=clean(body?.name,120);if(!name)return respond({ok:false,error:"name_required"},400);const row={name,is_visible:body?.is_visible!==false,show_home:body?.show_home===true,sort_order:integer(body?.sort_order,0,100000),updated_at:new Date().toISOString()};const {data,error}=await sb.from("storefront_v3_categories").upsert(row,{onConflict:"name"}).select("*").single();if(error)return respond({ok:false,error:"category_save_failed",detail:error.message},400);return respond({ok:true,category:data});
  }

  if(action==="rename_category"){
    const oldName=clean(body?.old_name,120),newName=clean(body?.new_name,120);if(!oldName||!newName)return respond({ok:false,error:"category_name_required"},400);const {error}=await sb.rpc("rename_storefront_v3_category",{p_old:oldName,p_new:newName});if(error)return respond({ok:false,error:"category_rename_failed",detail:error.message},400);return respond({ok:true,name:newName});
  }

  if(action==="orders"){
    const page=Math.max(1,integer(body?.page,1,100000)),limit=Math.min(100,Math.max(10,integer(body?.limit,10,100))),from=(page-1)*limit,to=from+limit-1;const status=clean(body?.status,40),q=safeSearch(body?.q);
    let query=sb.from("orders").select("id,order_number,customer_id,phone_e164,status,total,subtotal,basket_id,created_at,updated_at",{count:"exact"}).eq("source","storefront_v2").range(from,to).order("created_at",{ascending:false});if(status)query=query.eq("status",status);if(q)query=query.or(`order_number.ilike.%${q}%,phone_e164.ilike.%${q}%`);const {data,error,count}=await query;if(error)return respond({ok:false,error:"orders_failed",detail:error.message},400);return respond({ok:true,orders:data||[],total:count||0,page,limit});
  }

  if(action==="order"){
    const id=clean(body?.id,80);if(!id)return respond({ok:false,error:"id_required"},400);const {data:order,error}=await sb.from("orders").select("id,order_number,customer_id,phone_e164,status,total,subtotal,basket_id,created_at,updated_at,customer_snapshot").eq("id",id).eq("source","storefront_v2").maybeSingle();if(error||!order)return respond({ok:false,error:"order_not_found"},404);const {data:items}=await sb.from("order_items").select("id,product_id,name_snapshot,quantity,unit_price,line_total,metadata").eq("order_id",id).order("created_at",{ascending:true});return respond({ok:true,order,items:items||[]});
  }

  if(action==="customers"){
    const page=Math.max(1,integer(body?.page,1,100000)),limit=Math.min(100,Math.max(10,integer(body?.limit,10,100))),from=(page-1)*limit,to=from+limit-1,q=safeSearch(body?.q);let query=sb.from("customers").select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,created_at,updated_at",{count:"exact"}).range(from,to).order("name",{ascending:true,nullsFirst:false});if(q)query=query.or(`name.ilike.%${q}%,cpf_cnpj.ilike.%${q}%,primary_whatsapp_e164.ilike.%${q}%`);const {data,error,count}=await query;if(error)return respond({ok:false,error:"customers_failed",detail:error.message},400);return respond({ok:true,customers:data||[],total:count||0,page,limit});
  }

  if(action==="customer"){
    const id=clean(body?.id,80);if(!id)return respond({ok:false,error:"id_required"},400);const {data:customer,error}=await sb.from("customers").select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,created_at,updated_at").eq("id",id).maybeSingle();if(error||!customer)return respond({ok:false,error:"customer_not_found"},404);const [{data:address},{data:email}]=await Promise.all([sb.from("customer_addresses").select("id,label,street,number,complement,neighborhood,city,state,postal_code,reference,google_maps_url,is_default,is_active").eq("customer_id",id).eq("is_active",true).order("is_default",{ascending:false}).limit(1).maybeSingle(),sb.from("customer_emails").select("id,email,is_primary").eq("customer_id",id).order("is_primary",{ascending:false}).limit(1).maybeSingle()]);return respond({ok:true,customer,address:address||null,email:email?.email||null});
  }

  if(action==="save_customer"){
    const id=clean(body?.id,80),name=clean(body?.name,180),phone=normalizePhone(body?.phone),cpf=digits(body?.cpf_cnpj)||null,email=clean(body?.email,320).toLowerCase()||null;if(!name)return respond({ok:false,error:"name_required"},400);if(body?.phone&&!phone)return respond({ok:false,error:"invalid_phone"},400);
    if(phone){let dup=sb.from("customers").select("id").eq("primary_whatsapp_e164",phone);if(id)dup=dup.neq("id",id);const {data:duplicate}=await dup.limit(1).maybeSingle();if(duplicate)return respond({ok:false,error:"phone_already_used"},409)}
    const row:any={name,cpf_cnpj:cpf,primary_whatsapp_e164:phone,is_active:body?.is_active!==false,updated_at:new Date().toISOString()};let customer:any;
    if(id){const {data,error}=await sb.from("customers").update(row).eq("id",id).select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active").single();if(error)return respond({ok:false,error:"customer_save_failed",detail:error.message},400);customer=data}else{const {data,error}=await sb.from("customers").insert(row).select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active").single();if(error)return respond({ok:false,error:"customer_save_failed",detail:error.message},400);customer=data}
    const customerId=customer.id;if(phone){await sb.from("customer_phones").delete().eq("customer_id",customerId);const {error}=await sb.from("customer_phones").insert({customer_id:customerId,phone_e164:phone,source:"admin_v3",is_primary:true});if(error)return respond({ok:false,error:"phone_save_failed",detail:error.message},400)}
    if(email){await sb.from("customer_emails").delete().eq("customer_id",customerId);const {error}=await sb.from("customer_emails").insert({customer_id:customerId,email,email_normalized:email,verification_status:"unverified",is_primary:true,source:"admin_v3",evidence:{}});if(error)return respond({ok:false,error:"email_save_failed",detail:error.message},400)}
    if(body?.address&&typeof body.address==="object"){
      const a=body.address,rawMaps=clean(a.google_maps_url,1200),mapsUrl=safeGoogleMapsUrl(rawMaps);if(rawMaps&&!mapsUrl)return respond({ok:false,error:"invalid_google_maps_url"},400);const payload={customer_id:customerId,label:clean(a.label,80)||"Principal",street:clean(a.street,180)||null,number:clean(a.number,60)||null,complement:clean(a.complement,180)||null,neighborhood:clean(a.neighborhood,180)||null,city:clean(a.city,120)||null,state:clean(a.state,2).toUpperCase()||"MT",postal_code:digits(a.postal_code)||null,reference:clean(a.reference,300)||null,google_maps_url:mapsUrl,is_default:true,is_active:true,updated_at:new Date().toISOString()};const {data:existing}=await sb.from("customer_addresses").select("id").eq("customer_id",customerId).eq("is_default",true).limit(1).maybeSingle();if(existing){const {error}=await sb.from("customer_addresses").update(payload).eq("id",existing.id);if(error)return respond({ok:false,error:"address_save_failed",detail:error.message},400)}else{const {error}=await sb.from("customer_addresses").insert(payload);if(error)return respond({ok:false,error:"address_save_failed",detail:error.message},400)}
    }
    return respond({ok:true,customer});
  }

  return respond({ok:false,error:"unknown_action"},400);
});
