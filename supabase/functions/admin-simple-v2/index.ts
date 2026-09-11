import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const numberValue=(v:unknown)=>{if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n:null};
const integer=(v:unknown,min=-100000,max=100000)=>Math.min(max,Math.max(min,Number.parseInt(String(v??0),10)||0));
const normalizePhone=(v:unknown)=>{let d=digits(v);if(!d)return null;if(d.startsWith("55")&&(d.length===12||d.length===13))return `+${d}`;if(d.length===10||d.length===11)return `+55${d}`;return null};
const validGtin=(value:unknown)=>{const g=digits(value);if(!g)return true;if(![8,12,13,14].includes(g.length))return false;const expected=Number(g.at(-1));let sum=0;for(let i=g.length-2,o=0;i>=0;i--,o++)sum+=Number(g[i])*(o%2===0?3:1);return(10-(sum%10))%10===expected};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL");
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceRole)return json({ok:false,error:"server_config"},500);
  const sb=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{}
  const action=clean(body?.action||"health",60).toLowerCase();

  if(action==="health")return json({ok:true,mode:"public_no_auth",version:2});

  if(action==="products"){
    const page=Math.max(1,integer(body?.page,1,100000));
    const limit=Math.min(100,Math.max(10,integer(body?.limit,10,100)));
    const from=(page-1)*limit,to=from+limit-1;
    const q=clean(body?.q,100),status=clean(body?.status,30),category=clean(body?.category,120),brand=clean(body?.brand,120);
    let query=sb.from("products").select("id,sku,name,gtin,price,cost,stock,image_url,brand,category,subcategory,packaging,validity_date,gondola,shelf,is_active,is_offer,sort_order,physically_verified,updated_at",{count:"exact"}).eq("physically_verified",true).range(from,to);
    if(q){const safe=q.replace(/[,%()]/g," ").trim();if(safe)query=query.or(`name.ilike.%${safe}%,gtin.ilike.%${safe}%,sku.ilike.%${safe}%,brand.ilike.%${safe}%`)}
    if(category)query=query.ilike("category",`%${category.replace(/[%_]/g,"")}%`);
    if(brand)query=query.ilike("brand",`%${brand.replace(/[%_]/g,"")}%`);
    if(status==="offer")query=query.eq("is_offer",true);
    if(status==="inactive")query=query.eq("is_active",false);
    if(status==="no-stock")query=query.lte("stock",0);
    const sort=clean(body?.sort,20);
    const col=sort==="name"?"name":sort==="price"?"price":sort==="stock"?"stock":"sort_order";
    query=query.order(col,{ascending:true,nullsFirst:false}).order("name",{ascending:true});
    const {data,error,count}=await query;
    if(error)return json({ok:false,error:"products_failed",detail:error.message},400);
    return json({ok:true,products:data||[],total:count||0,page,limit});
  }

  if(action==="product"){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:"id_required"},400);
    const {data,error}=await sb.from("products").select("id,sku,name,gtin,ncm,price,cost,stock,image_url,brand,category,subcategory,packaging,validity_date,gondola,shelf,is_active,is_offer,sort_order,description_short,description_long,tags,physically_verified,updated_at").eq("id",id).maybeSingle();
    if(error||!data)return json({ok:false,error:"product_not_found"},404);
    return json({ok:true,product:data});
  }

  if(action==="update_product"){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:"id_required"},400);
    const src=body?.patch&&typeof body.patch==="object"?body.patch:{};
    const patch:any={updated_at:new Date().toISOString(),last_admin_edit_at:new Date().toISOString(),last_admin_edit_by:null};
    for(const [key,max] of [["name",180],["sku",100],["brand",180],["category",180],["subcategory",180],["packaging",180],["image_url",1200],["description_short",1000],["description_long",5000]] as const){if(src[key]!==undefined)patch[key]=clean(src[key],max)||null}
    if(src.gtin!==undefined){if(!validGtin(src.gtin))return json({ok:false,error:"invalid_gtin"},400);patch.gtin=digits(src.gtin)||null}
    if(src.ncm!==undefined){const n=digits(src.ncm);if(n&&n.length!==8)return json({ok:false,error:"invalid_ncm"},400);patch.ncm=n||null}
    for(const key of ["price","cost"]){if(src[key]!==undefined){const n=numberValue(src[key]);if(n!==null&&n<0)return json({ok:false,error:`invalid_${key}`},400);patch[key]=n}}
    if(src.sort_order!==undefined)patch.sort_order=integer(src.sort_order);
    if(typeof src.is_active==="boolean")patch.is_active=src.is_active;
    if(typeof src.is_offer==="boolean")patch.is_offer=src.is_offer;
    if(src.validity_date!==undefined)patch.validity_date=clean(src.validity_date,10)||null;
    if(src.tags!==undefined)patch.tags=Array.isArray(src.tags)?src.tags.map((x:any)=>clean(x,80)).filter(Boolean).slice(0,50):[];
    if(patch.name!==undefined&&!patch.name)return json({ok:false,error:"name_required"},400);
    const {data,error}=await sb.from("products").update(patch).eq("id",id).select("id,sku,name,gtin,ncm,price,cost,stock,image_url,brand,category,subcategory,packaging,validity_date,gondola,shelf,is_active,is_offer,sort_order,description_short,description_long,tags,updated_at").single();
    if(error)return json({ok:false,error:"update_failed",detail:error.message},400);
    return json({ok:true,product:data});
  }

  if(action==="baskets"){
    const q=clean(body?.q,100);
    let query=sb.from("basket_templates").select("id,sku,name,description,image_url,base_price,is_active,is_featured,sort_order,updated_at,basket_template_items(count)",{count:"exact"}).order("sort_order",{ascending:true}).order("name",{ascending:true});
    if(q){const safe=q.replace(/[,%()]/g," ").trim();if(safe)query=query.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)}
    const {data,error,count}=await query;if(error)return json({ok:false,error:"baskets_failed",detail:error.message},400);
    return json({ok:true,baskets:data||[],total:count||0});
  }

  if(action==="basket"){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:"id_required"},400);
    const {data:basket,error}=await sb.from("basket_templates").select("id,sku,name,description,image_url,base_price,is_active,is_featured,sort_order,internal_notes,updated_at").eq("id",id).maybeSingle();
    if(error||!basket)return json({ok:false,error:"basket_not_found"},404);
    const {data:items}=await sb.from("basket_template_items").select("id,quantity,removable,quantity_editable,min_quantity,max_quantity,sort_order,product:products(id,name,sku,gtin,image_url,brand,packaging,stock,price,is_active,physically_verified)").eq("basket_id",id).order("sort_order",{ascending:true}).order("created_at",{ascending:true});
    return json({ok:true,basket,items:items||[]});
  }

  if(action==="save_basket"){
    const id=clean(body?.id,80),name=clean(body?.name,180),price=numberValue(body?.base_price);
    if(!name)return json({ok:false,error:"name_required"},400);if(price===null||price<0)return json({ok:false,error:"invalid_base_price"},400);
    const row:any={name,sku:clean(body?.sku,100)||null,description:clean(body?.description,3000)||null,image_url:clean(body?.image_url,1200)||null,base_price:price,is_active:body?.is_active!==false,is_featured:body?.is_featured===true,sort_order:integer(body?.sort_order),internal_notes:clean(body?.internal_notes,3000)||null,updated_by:null,updated_at:new Date().toISOString()};
    if(id){const {data,error}=await sb.from("basket_templates").update(row).eq("id",id).select("id,sku,name,description,image_url,base_price,is_active,is_featured,sort_order,internal_notes,updated_at").single();if(error)return json({ok:false,error:"basket_save_failed",detail:error.message},400);return json({ok:true,basket:data})}
    const {data,error}=await sb.from("basket_templates").insert({...row,is_whatsapp_active:false}).select("id,sku,name,description,image_url,base_price,is_active,is_featured,sort_order,internal_notes,updated_at").single();if(error)return json({ok:false,error:"basket_save_failed",detail:error.message},400);return json({ok:true,basket:data});
  }

  if(action==="search_products"){
    const q=clean(body?.q,100);if(q.length<2)return json({ok:true,products:[]});
    const safe=q.replace(/[,%()]/g," ").trim();
    let query=sb.from("products").select("id,name,sku,gtin,image_url,brand,packaging,stock,price,is_active,physically_verified").eq("physically_verified",true).eq("is_active",true).limit(30);
    if(safe)query=query.or(`name.ilike.%${safe}%,gtin.ilike.%${safe}%,sku.ilike.%${safe}%,brand.ilike.%${safe}%`);
    const {data,error}=await query;if(error)return json({ok:false,error:"product_search_failed",detail:error.message},400);return json({ok:true,products:data||[]});
  }

  if(action==="add_basket_item"){
    const basketId=clean(body?.basket_id,80),productId=clean(body?.product_id,80),qty=numberValue(body?.quantity);
    if(!basketId||!productId)return json({ok:false,error:"ids_required"},400);if(qty===null||qty<=0)return json({ok:false,error:"invalid_quantity"},400);
    const {data:existing}=await sb.from("basket_template_items").select("id").eq("basket_id",basketId).eq("product_id",productId).maybeSingle();
    if(existing){const {data,error}=await sb.from("basket_template_items").update({quantity:qty}).eq("id",existing.id).select("*").single();if(error)return json({ok:false,error:"item_save_failed",detail:error.message},400);return json({ok:true,item:data})}
    const {data,error}=await sb.from("basket_template_items").insert({basket_id:basketId,product_id:productId,quantity:qty,removable:body?.removable!==false,quantity_editable:body?.quantity_editable!==false,min_quantity:0,max_quantity:null,substitution_group:null,pricing_rule:{},sort_order:integer(body?.sort_order,0,100000)}).select("*").single();
    if(error)return json({ok:false,error:"item_save_failed",detail:error.message},400);return json({ok:true,item:data});
  }

  if(action==="update_basket_item"){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:"id_required"},400);const patch:any={};
    if(body?.quantity!==undefined){const q=numberValue(body.quantity);if(q===null||q<=0)return json({ok:false,error:"invalid_quantity"},400);patch.quantity=q}
    if(typeof body?.removable==="boolean")patch.removable=body.removable;if(typeof body?.quantity_editable==="boolean")patch.quantity_editable=body.quantity_editable;if(body?.sort_order!==undefined)patch.sort_order=integer(body.sort_order,0,100000);
    const {data,error}=await sb.from("basket_template_items").update(patch).eq("id",id).select("*").single();if(error)return json({ok:false,error:"item_save_failed",detail:error.message},400);return json({ok:true,item:data});
  }

  if(action==="remove_basket_item"){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:"id_required"},400);const {error}=await sb.from("basket_template_items").delete().eq("id",id);if(error)return json({ok:false,error:"remove_failed",detail:error.message},400);return json({ok:true});
  }

  if(action==="customers"){
    const page=Math.max(1,integer(body?.page,1,100000));const limit=Math.min(100,Math.max(10,integer(body?.limit,10,100)));const from=(page-1)*limit,to=from+limit-1;const q=clean(body?.q,100);
    let query=sb.from("customers").select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,order_count,lifetime_value,last_order_at,created_at,updated_at",{count:"exact"}).range(from,to).order("name",{ascending:true,nullsFirst:false});
    if(q){const safe=q.replace(/[,%()]/g," ").trim();if(safe)query=query.or(`name.ilike.%${safe}%,cpf_cnpj.ilike.%${safe}%,primary_whatsapp_e164.ilike.%${safe}%`)}
    const {data,error,count}=await query;if(error)return json({ok:false,error:"customers_failed",detail:error.message},400);return json({ok:true,customers:data||[],total:count||0,page,limit});
  }

  if(action==="customer"){
    const id=clean(body?.id,80);if(!id)return json({ok:false,error:"id_required"},400);
    const {data:customer,error}=await sb.from("customers").select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active,order_count,lifetime_value,last_order_at,created_at,updated_at").eq("id",id).maybeSingle();if(error||!customer)return json({ok:false,error:"customer_not_found"},404);
    const [{data:address},{data:email}]=await Promise.all([
      sb.from("customer_addresses").select("id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default,is_active").eq("customer_id",id).eq("is_active",true).order("is_default",{ascending:false}).limit(1).maybeSingle(),
      sb.from("customer_emails").select("id,email,is_primary").eq("customer_id",id).order("is_primary",{ascending:false}).limit(1).maybeSingle()
    ]);
    return json({ok:true,customer,address:address||null,email:email?.email||null});
  }

  if(action==="save_customer"){
    const id=clean(body?.id,80);const name=clean(body?.name,180);const phone=normalizePhone(body?.phone);const cpf=digits(body?.cpf_cnpj)||null;const email=clean(body?.email,320).toLowerCase()||null;
    if(!name)return json({ok:false,error:"name_required"},400);if(body?.phone&&!phone)return json({ok:false,error:"invalid_phone"},400);
    if(phone){let dup=sb.from("customers").select("id").eq("primary_whatsapp_e164",phone);if(id)dup=dup.neq("id",id);const {data:duplicate}=await dup.limit(1).maybeSingle();if(duplicate)return json({ok:false,error:"phone_already_used"},409)}
    const row:any={name,cpf_cnpj:cpf,primary_whatsapp_e164:phone,is_active:body?.is_active!==false,updated_at:new Date().toISOString()};
    let customer:any;
    if(id){const {data,error}=await sb.from("customers").update(row).eq("id",id).select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active").single();if(error)return json({ok:false,error:"customer_save_failed",detail:error.message},400);customer=data}
    else{const {data,error}=await sb.from("customers").insert(row).select("id,name,cpf_cnpj,primary_whatsapp_e164,is_active").single();if(error)return json({ok:false,error:"customer_save_failed",detail:error.message},400);customer=data}
    const customerId=customer.id;
    if(phone){await sb.from("customer_phones").delete().eq("customer_id",customerId);const {error}=await sb.from("customer_phones").insert({customer_id:customerId,phone_e164:phone,source:"admin_simple_v2",is_primary:true});if(error)return json({ok:false,error:"phone_save_failed",detail:error.message},400)}
    if(email){await sb.from("customer_emails").delete().eq("customer_id",customerId);const {error}=await sb.from("customer_emails").insert({customer_id:customerId,email,email_normalized:email,verification_status:"unverified",is_primary:true,source:"admin_simple_v2",evidence:{}});if(error)return json({ok:false,error:"email_save_failed",detail:error.message},400)}
    if(body?.address&&typeof body.address==="object"){
      const a=body.address;const payload={customer_id:customerId,label:clean(a.label,80)||"Principal",street:clean(a.street,180)||null,number:clean(a.number,60)||null,complement:clean(a.complement,180)||null,neighborhood:clean(a.neighborhood,180)||null,city:clean(a.city,120)||null,state:clean(a.state,2).toUpperCase()||"MT",postal_code:digits(a.postal_code)||null,reference:clean(a.reference,300)||null,is_default:true,is_active:true,updated_at:new Date().toISOString()};
      const {data:existing}=await sb.from("customer_addresses").select("id").eq("customer_id",customerId).eq("is_default",true).limit(1).maybeSingle();
      if(existing){const {error}=await sb.from("customer_addresses").update(payload).eq("id",existing.id);if(error)return json({ok:false,error:"address_save_failed",detail:error.message},400)}
      else{const {error}=await sb.from("customer_addresses").insert(payload);if(error)return json({ok:false,error:"address_save_failed",detail:error.message},400)}
    }
    return json({ok:true,customer});
  }

  return json({ok:false,error:"unknown_action"},400);
});
