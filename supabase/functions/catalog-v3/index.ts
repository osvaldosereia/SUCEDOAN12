import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.112.3";

const ALLOWED_ORIGINS=new Set(["https://donaantonia.com.br","https://www.donaantonia.com.br"]);
const CACHE="public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const NO_STORE="no-store";
const cors=(origin:string|null)=>({
  ...(origin&&ALLOWED_ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  "Access-Control-Allow-Headers":"apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "Vary":"Origin"
});
const reply=(body:unknown,status=200,origin:string|null=null,cache=CACHE)=>new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":cache}});
const clean=(value:unknown,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const integer=(value:unknown,min:number,max:number,fallback:number)=>{const parsed=Number.parseInt(String(value??fallback),10);return Math.min(max,Math.max(min,Number.isFinite(parsed)?parsed:fallback))};
const jsonList=(value:string|null,maxItems:number,maxLength:number)=>{try{const parsed=JSON.parse(value||"[]");if(!Array.isArray(parsed))return [];return [...new Set(parsed.map(v=>clean(v,maxLength)).filter(Boolean))].slice(0,maxItems)}catch{return []}};
const publicProduct=(p:any)=>({id:p.id,name:p.name,price:Number(p.price||0),stock:Math.max(0,Math.floor(Number(p.stock||0))),image_url:p.image_url||null,brand:p.brand||null,category:p.category||null,storefront_category:p.storefront_category||null,packaging:p.packaging||null,is_offer:p.is_offer===true,sort_order:Number(p.sort_order||0)});
const productFields="id,name,price,stock,image_url,brand,category,storefront_category,packaging,is_offer,sort_order";
const basketReady=(items:any[])=>items.length>0&&items.every((i:any)=>i.product?.is_active===true&&Number(i.product?.stock||0)>=Number(i.quantity||0));

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply({ok:false,error:"origin_not_allowed"},403,null,NO_STORE);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(req.method!=="GET")return reply({ok:false,error:"method_not_allowed"},405,origin,NO_STORE);

  const url=Deno.env.get("SUPABASE_URL"),serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceRole)return reply({ok:false,error:"server_config"},500,origin,NO_STORE);
  const sb=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const requestUrl=new URL(req.url);
  const resource=clean(requestUrl.searchParams.get("resource")||"home",40).toLowerCase();

  if(resource==="health")return reply({ok:true,version:5,mode:"read_only",cache_seconds:300},200,origin);

  if(resource==="home"){
    const basketResult=await sb.from("basket_templates").select("id,name,description,image_url,base_price,sort_order,is_featured,basket_template_items(quantity,product:products(is_active,stock))").eq("is_active",true).order("sort_order",{ascending:true}).order("name",{ascending:true});
    if(basketResult.error)return reply({ok:false,error:"baskets_failed"},500,origin,NO_STORE);

    let categoryRows:any[]=[];
    const configured=await sb.from("storefront_v3_categories").select("name,is_visible,show_home,sort_order").eq("is_visible",true).order("sort_order",{ascending:true}).order("name",{ascending:true});
    if(!configured.error&&configured.data?.length){categoryRows=configured.data}else{
      const fallback=await sb.from("products").select("storefront_category").eq("is_active",true).gt("stock",0).not("storefront_category","is",null).limit(5000);
      if(fallback.error)return reply({ok:false,error:"categories_failed"},500,origin,NO_STORE);
      const names=[...new Set((fallback.data||[]).map((row:any)=>clean(row.storefront_category,120)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
      categoryRows=names.map((name,index)=>({name,is_visible:true,show_home:true,sort_order:index*10}));
    }

    let featured:any[]=[];
    const featuredResult=await sb.from("products").select(`${productFields},storefront_featured`).eq("is_active",true).gt("stock",0).eq("storefront_featured",true).order("sort_order",{ascending:true}).order("name",{ascending:true}).limit(8);
    if(!featuredResult.error)featured=(featuredResult.data||[]).map(publicProduct);
    if(!featured.length){
      const offers=await sb.from("products").select(productFields).eq("is_active",true).gt("stock",0).eq("is_offer",true).order("sort_order",{ascending:true}).order("name",{ascending:true}).limit(8);
      if(!offers.error)featured=(offers.data||[]).map(publicProduct);
    }

    const baskets=(basketResult.data||[]).map((b:any)=>{const items=Array.isArray(b.basket_template_items)?b.basket_template_items:[];return {id:b.id,name:b.name,description:b.description||null,image_url:b.image_url||null,base_price:Number(b.base_price||0),sort_order:Number(b.sort_order||0),is_featured:b.is_featured===true,item_count:items.length,ready:basketReady(items)}});
    const categories=categoryRows.map((c:any)=>({name:clean(c.name,120),show_home:c.show_home!==false,sort_order:Number(c.sort_order||0)})).filter((c:any)=>c.name);
    return reply({ok:true,baskets,categories,featured},200,origin);
  }

  if(resource==="offers"){
    const categories=jsonList(requestUrl.searchParams.get("categories"),16,120);
    const excludedIds=new Set(jsonList(requestUrl.searchParams.get("exclude"),80,80).filter(id=>/^[0-9a-f-]{36}$/i.test(id)));
    const limit=integer(requestUrl.searchParams.get("limit"),1,12,8);
    if(!categories.length)return reply({ok:true,products:[]},200,origin);
    const fetchLimit=Math.min(48,Math.max(limit+excludedIds.size+8,limit));
    const {data,error}=await sb.from("products").select(productFields).eq("is_active",true).gt("stock",0).eq("is_offer",true).in("storefront_category",categories).order("sort_order",{ascending:true}).order("name",{ascending:true}).limit(fetchLimit);
    if(error)return reply({ok:false,error:"offers_failed"},500,origin,NO_STORE);
    const products=(data||[]).filter((p:any)=>!excludedIds.has(String(p.id))).slice(0,limit).map(publicProduct);
    return reply({ok:true,products},200,origin);
  }

  if(resource==="category"||resource==="search"){
    const page=integer(requestUrl.searchParams.get("page"),1,100000,1),limit=integer(requestUrl.searchParams.get("limit"),1,24,12),from=(page-1)*limit,to=from+limit;
    const category=clean(requestUrl.searchParams.get("name"),120),sub=clean(requestUrl.searchParams.get("sub"),120),q=clean(requestUrl.searchParams.get("q"),100);
    if(resource==="category"&&!category)return reply({ok:false,error:"category_required"},400,origin,NO_STORE);
    if(resource==="search"&&q.length<2)return reply({ok:true,products:[],page,limit,has_more:false,subfilters:[]},200,origin);
    let query=sb.from("products").select(productFields).eq("is_active",true).gt("stock",0).range(from,to).order("sort_order",{ascending:true}).order("name",{ascending:true});
    if(resource==="category"){query=query.eq("storefront_category",category);if(sub)query=query.eq("category",sub)}
    if(resource==="search"){const safe=q.replace(/[,%()]/g," ").trim();if(safe)query=query.or(`name.ilike.%${safe}%,gtin.ilike.%${safe}%,sku.ilike.%${safe}%,brand.ilike.%${safe}%`)}
    const {data,error}=await query;if(error)return reply({ok:false,error:"products_failed"},500,origin,NO_STORE);
    const rows=data||[],hasMore=rows.length>limit;
    let subfilters:string[]=[];
    if(resource==="category"){
      const subResult=await sb.from("products").select("category").eq("is_active",true).gt("stock",0).eq("storefront_category",category).not("category","is",null).limit(5000);
      if(!subResult.error)subfilters=[...new Set((subResult.data||[]).map((row:any)=>clean(row.category,120)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    }
    return reply({ok:true,products:rows.slice(0,limit).map(publicProduct),page,limit,has_more:hasMore,subfilters,active_sub:sub||null},200,origin);
  }

  if(resource==="product"){
    const id=clean(requestUrl.searchParams.get("id"),80);if(!/^[0-9a-f-]{36}$/i.test(id))return reply({ok:false,error:"invalid_id"},400,origin,NO_STORE);
    const {data,error}=await sb.from("products").select(`${productFields},validity_date,description_short`).eq("id",id).eq("is_active",true).gt("stock",0).maybeSingle();
    if(error||!data)return reply({ok:false,error:"product_not_found"},404,origin,NO_STORE);
    return reply({ok:true,product:{...publicProduct(data),validity_date:(data as any).validity_date||null,description_short:(data as any).description_short||null}},200,origin);
  }

  if(resource==="basket"){
    const id=clean(requestUrl.searchParams.get("id"),80);if(!/^[0-9a-f-]{36}$/i.test(id))return reply({ok:false,error:"invalid_id"},400,origin,NO_STORE);
    const {data:b,error}=await sb.from("basket_templates").select("id,name,description,image_url,base_price,is_featured,basket_template_items(id,product_id,quantity,removable,quantity_editable,min_quantity,max_quantity,add_unit_delta,remove_unit_delta,sort_order,product:products(id,name,price,stock,image_url,brand,category,storefront_category,packaging,is_active,is_offer))").eq("id",id).eq("is_active",true).maybeSingle();
    if(error||!b)return reply({ok:false,error:"basket_not_found"},404,origin,NO_STORE);
    const items=Array.isArray((b as any).basket_template_items)?(b as any).basket_template_items:[];
    return reply({ok:true,basket:{id:(b as any).id,name:(b as any).name,description:(b as any).description||null,image_url:(b as any).image_url||null,base_price:Number((b as any).base_price||0),is_featured:(b as any).is_featured===true,ready:basketReady(items)},items:items.sort((a:any,c:any)=>Number(a.sort_order||0)-Number(c.sort_order||0)).map((i:any)=>({product_id:i.product_id,quantity:Number(i.quantity||0),removable:i.removable===true,quantity_editable:i.quantity_editable===true,min_quantity:Number(i.min_quantity||0),max_quantity:i.max_quantity==null?null:Number(i.max_quantity),add_unit_delta:i.add_unit_delta==null?null:Number(i.add_unit_delta),remove_unit_delta:i.remove_unit_delta==null?null:Number(i.remove_unit_delta),product:publicProduct(i.product)}))},200,origin);
  }

  return reply({ok:false,error:"unknown_resource"},404,origin,NO_STORE);
});
