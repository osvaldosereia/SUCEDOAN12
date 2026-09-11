import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const text=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const num=(v:unknown)=>{const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:null};
const validToken=(v:unknown)=>/^[a-f0-9]{64}$/i.test(text(v,80));
const validUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(v,80));
const DEFAULT_PHONE="5565984491018";
const CATEGORY_GROUPS=[
  {id:"mercearia",label:"Mercearia",db:["MERCEARIA BÁSICA","CAFÉ DA MANHÃ","BOLACHAS E BISCOITOS","MACARRÃO E MOLHOS","TEMPEROS","CONFEITARIA","BALAS E CHICLETES","CHOCOLATES E DOCES","MOLHOS E CONDIMENTOS","SALGADINHOS E PETISCOS"]},
  {id:"limpeza",label:"Limpeza",db:["LIMPEZA","LAVANDERIA"]},
  {id:"higiene",label:"Higiene",db:["HIGIENE","SHAMPOO E CONDICIONADOR","SABONETE","BELEZA","BEBÊ"]},
  {id:"bebidas",label:"Bebidas",db:["SUCOS, REFRI E ENERGÉTICOS"]},
  {id:"casa-pet",label:"Casa e Pet",db:["PETS"]}
] as const;

type Client=ReturnType<typeof createClient>;
type ProductRow={id:string;name:string;price:number|string|null;image_url:string|null;category:string|null;brand:string|null;packaging:string|null;stock:number|string|null;is_offer:boolean|null;sort_order?:number|null};

async function phoneFor(sb:Client,conversationId:string|null){
  let phone=DEFAULT_PHONE;
  if(conversationId){
    const {data:conv}=await sb.from("conversations").select("whatsapp_account:whatsapp_accounts(phone_e164)").eq("id",conversationId).maybeSingle();
    const found=digits((conv as any)?.whatsapp_account?.phone_e164);if(found)phone=found;
  }
  return phone;
}
function productItem(p:ProductRow,index:number,quantity=0){
  return {product_id:p.id,rank:index+1,reason:"Vitrine Dona Antônia",recommendation_score:0,quantity,
    product:{id:p.id,name:p.name,price:p.price,image_url:p.image_url,category:p.category,brand:p.brand,packaging:p.packaging,stock:p.stock,is_offer:p.is_offer}};
}
async function selectedQuantities(sb:Client,sessionId:string){
  const {data}=await sb.from("catalog_session_items").select("product_id,quantity").eq("catalog_session_id",sessionId).gt("quantity",0);
  return new Map<string,number>((data||[]).map((x:any)=>[String(x.product_id),Number(x.quantity||0)]));
}
async function fallbackProducts(sb:Client,limit=18){
  const {data,error}=await sb.from("products").select("id,name,price,image_url,category,brand,packaging,stock,is_offer,sort_order")
    .eq("physically_verified",true).eq("is_active",true).eq("is_whatsapp_active",true).gt("stock",0)
    .order("is_offer",{ascending:false}).order("sort_order",{ascending:true,nullsFirst:false}).order("name",{ascending:true}).limit(limit);
  if(error)throw new Error("catalog_items_failed");return (data||[]) as ProductRow[];
}
async function popularProducts(sb:Client,sessionId:string,limit=18){
  const {data:stats}=await sb.from("customer_product_stats")
    .select("product_id,purchase_count,total_quantity,product:products(id,name,price,image_url,category,brand,packaging,stock,is_offer,sort_order,physically_verified,is_active,is_whatsapp_active)")
    .order("purchase_count",{ascending:false}).order("total_quantity",{ascending:false}).limit(200);
  const ranked=new Map<string,{score:number,p:ProductRow}>();
  for(const row of (stats||[]) as any[]){
    const p=row.product as any;if(!p||!p.physically_verified||!p.is_active||!p.is_whatsapp_active||Number(p.stock||0)<=0)continue;
    const score=Number(row.purchase_count||0)*100+Number(row.total_quantity||0);
    const old=ranked.get(String(p.id));if(!old||score>old.score)ranked.set(String(p.id),{score,p});
  }
  let products=[...ranked.values()].sort((a,b)=>b.score-a.score).map(x=>x.p).slice(0,limit);
  if(products.length<limit){
    const fallback=await fallbackProducts(sb,limit*2),used=new Set(products.map(p=>p.id));
    products=products.concat(fallback.filter(p=>!used.has(p.id)).slice(0,limit-products.length));
  }
  const quantities=await selectedQuantities(sb,sessionId);
  return products.map((p,i)=>productItem(p,i,quantities.get(String(p.id))||0));
}
async function browseProducts(sb:Client,sessionId:string,mode:string,value:string,limit=30){
  let q=sb.from("products").select("id,name,price,image_url,category,brand,packaging,stock,is_offer,sort_order")
    .eq("physically_verified",true).eq("is_active",true).eq("is_whatsapp_active",true).gt("stock",0);
  if(mode==="search"){
    const term=text(value,80).replace(/[%_]/g,"");if(term.length<2)return [];
    q=q.ilike("name",`%${term}%`);
  }else if(mode==="category"){
    const group=CATEGORY_GROUPS.find(x=>x.id===value);if(!group)return [];
    q=q.in("category",[...group.db]);
  }
  const {data,error}=await q.order("is_offer",{ascending:false}).order("sort_order",{ascending:true,nullsFirst:false}).order("name",{ascending:true}).limit(Math.max(1,Math.min(limit,40)));
  if(error)throw new Error("catalog_items_failed");
  const quantities=await selectedQuantities(sb,sessionId);
  return ((data||[]) as ProductRow[]).map((p,i)=>productItem(p,i,quantities.get(String(p.id))||0));
}
async function baskets(sb:Client){
  const {data,error}=await sb.from("basket_templates").select("id,sku,name,base_price,image_url,sort_order")
    .eq("is_active",true).eq("is_whatsapp_active",true).order("sort_order",{ascending:true}).order("name",{ascending:true}).limit(9);
  if(error)return [];
  return (data||[]).map((b:any)=>({id:b.id,sku:b.sku,name:b.name,price:Number(b.base_price||0),image_url:b.image_url||null}));
}
async function basketDetail(sb:Client,basketId:string){
  const {data:b,error:be}=await sb.from("basket_templates").select("id,name,base_price,image_url,description").eq("id",basketId).eq("is_active",true).maybeSingle();
  if(be||!b)throw new Error("basket_not_found");
  const {data:items,error:ie}=await sb.from("basket_template_items")
    .select("quantity,sort_order,product:products(id,name,image_url,packaging)").eq("basket_id",basketId).order("sort_order",{ascending:true});
  if(ie)throw new Error("basket_items_failed");
  return {id:b.id,name:b.name,price:Number(b.base_price||0),image_url:b.image_url||null,description:b.description||null,
    items:(items||[]).map((x:any)=>({quantity:Number(x.quantity||0),name:x.product?.name||"Produto",image_url:x.product?.image_url||null,packaging:x.product?.packaging||null}))};
}
async function selectedSummary(sb:Client,sessionId:string){
  const {data,error}=await sb.from("catalog_session_items").select("product_id,quantity,product:products(name,price)")
    .eq("catalog_session_id",sessionId).gt("quantity",0).order("updated_at",{ascending:true});
  if(error)return {lines:[] as string[],total:0,count:0};
  let total=0;const rows=(data||[]) as any[];
  const lines=rows.slice(0,25).map((x:any)=>{const q=Number(x.quantity||0),price=Number(x.product?.price||0);total+=q*price;return `${q}x ${text(x.product?.name,100)}`});
  if(rows.length>25)lines.push(`+ ${rows.length-25} produto(s) selecionado(s)`);
  if(rows.length>25){for(const x of rows.slice(25)){total+=Number(x.quantity||0)*Number(x.product?.price||0)}}
  return {lines,total,count:rows.length};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return json({ok:false,error:"server_config"},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any;try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=text(body?.action||"open",40).toLowerCase();const token=text(body?.token,80);

  if(action==="open_public"){
    const expiresAt=new Date(Date.now()+4*60*60*1000).toISOString();
    const {data:session,error:ce}=await sb.from("catalog_sessions").insert({kind:"browse",title:"Produtos",status:"open",expires_at:expiresAt,
      metadata:{public_guest:true,shopping_mode:"catalog_first",source:"public_catalog_root"},last_opened_at:new Date().toISOString()})
      .select("id,public_token,kind,title,status,expires_at,metadata").single();
    if(ce||!session)return json({ok:false,error:"catalog_create_failed",detail:ce?.message||null},500);
    let items:any[]=[];try{items=await popularProducts(sb,session.id,18)}catch(e){return json({ok:false,error:text((e as Error).message,80)},500)}
    const [basketRows]=await Promise.all([baskets(sb)]);
    return json({ok:true,token:session.public_token,session:{title:session.title,kind:session.kind,expires_at:session.expires_at,shopping_mode:"catalog_first",public_guest:true},
      items,baskets:basketRows,categories:CATEGORY_GROUPS.map(({id,label})=>({id,label})),cart:null,
      whatsapp_url:`https://wa.me/${DEFAULT_PHONE}?text=${encodeURIComponent("Olá! Vim pela vitrine da Dona Antônia.")}`});
  }

  if(!validToken(token))return json({ok:false,error:"invalid_token"},400);
  const {data:session,error:se}=await sb.from("catalog_sessions").select("id,public_token,customer_id,conversation_id,cart_id,kind,title,status,expires_at,last_opened_at,metadata").eq("public_token",token).maybeSingle();
  if(se)return json({ok:false,error:"catalog_lookup_failed"},500);
  if(!session||session.status!=="open"||new Date(session.expires_at).getTime()<=Date.now())return json({ok:false,error:"catalog_unavailable"},404);
  const isPublicGuest=session.metadata?.public_guest===true;

  if(action==="open"){
    const firstOpen=!session.last_opened_at||(Date.now()-new Date(session.last_opened_at).getTime())>30*60*1000;
    await sb.from("catalog_sessions").update({last_opened_at:new Date().toISOString()}).eq("id",session.id);
    if(firstOpen)await sb.from("catalog_events").insert({catalog_session_id:session.id,customer_id:session.customer_id,event_type:"catalog_open",event_data:{source:isPublicGuest?"public_catalog_root":"public_catalog"}});
    let items:any[]=[];let basketRows:any[]=[];let categories:any[]=[];
    if(isPublicGuest){
      try{items=await popularProducts(sb,session.id,18)}catch(e){return json({ok:false,error:text((e as Error).message,80)},500)}
      [basketRows]=await Promise.all([baskets(sb)]);categories=CATEGORY_GROUPS.map(({id,label})=>({id,label}));
    }else{
      const {data,error:ie}=await sb.from("catalog_session_items").select("product_id,rank,reason,recommendation_score,quantity,product:products(id,name,price,image_url,category,brand,packaging,stock,is_offer)").eq("catalog_session_id",session.id).order("rank",{ascending:true});
      if(ie)return json({ok:false,error:"catalog_items_failed"},500);items=data||[];
    }
    let cart:any=null;if(session.cart_id){const {data:c}=await sb.from("carts").select("id,total,fiscal_subtotal,other_expenses,discount,status,version").eq("id",session.cart_id).maybeSingle();cart=c||null}
    const phone=await phoneFor(sb,session.conversation_id);const waText=encodeURIComponent(isPublicGuest?"Olá! Vim pela vitrine da Dona Antônia.":"Pronto, já escolhi os produtos no catálogo. Podemos continuar meu pedido?");
    return json({ok:true,token:session.public_token,session:{title:session.title,kind:session.kind,expires_at:session.expires_at,shopping_mode:session.metadata?.shopping_mode||null,public_guest:isPublicGuest},items,baskets:basketRows,categories,cart,whatsapp_url:`https://wa.me/${phone}?text=${waText}`});
  }

  if(action==="browse"){
    if(!isPublicGuest)return json({ok:false,error:"public_catalog_required"},400);
    const mode=text(body?.mode||"all",20),value=text(body?.value,100);
    try{return json({ok:true,items:mode==="popular"?await popularProducts(sb,session.id,18):await browseProducts(sb,session.id,mode,value,30)})}
    catch(e){return json({ok:false,error:text((e as Error).message,80)},500)}
  }

  if(action==="basket_detail"){
    const basketId=text(body?.basket_id,80);if(!validUuid(basketId))return json({ok:false,error:"invalid_basket"},400);
    try{return json({ok:true,basket:await basketDetail(sb,basketId)})}catch(e){return json({ok:false,error:text((e as Error).message,80)},404)}
  }

  if(action==="basket_interest"){
    const basketId=text(body?.basket_id,80);if(!validUuid(basketId))return json({ok:false,error:"invalid_basket"},400);
    let b:any;try{b=await basketDetail(sb,basketId)}catch{return json({ok:false,error:"basket_not_found"},404)}
    await sb.from("catalog_events").insert({catalog_session_id:session.id,customer_id:session.customer_id,event_type:"basket_interest",event_data:{basket_id:b.id,basket_name:b.name,source:"public_catalog"}});
    const phone=await phoneFor(sb,session.conversation_id);
    const msg=`Olá! Quero a cesta ${b.name}, no valor de ${Number(b.price).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}. Podemos continuar meu pedido?`;
    return json({ok:true,whatsapp_url:`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`});
  }

  if(action==="set_quantity"){
    const productId=text(body?.product_id,80),quantity=num(body?.quantity);
    if(!validUuid(productId)||quantity===null||quantity<0||quantity>999)return json({ok:false,error:"invalid_quantity"},400);
    if(isPublicGuest){
      const {data:product,error:pe}=await sb.from("products").select("id").eq("id",productId).eq("physically_verified",true).eq("is_active",true).eq("is_whatsapp_active",true).gt("stock",0).maybeSingle();
      if(pe||!product)return json({ok:false,error:"product_not_available"},400);
      const {data:old}=await sb.from("catalog_session_items").select("quantity").eq("catalog_session_id",session.id).eq("product_id",productId).maybeSingle();
      if(quantity===0){const {error}=await sb.from("catalog_session_items").delete().eq("catalog_session_id",session.id).eq("product_id",productId);if(error)return json({ok:false,error:"quantity_failed",detail:error.message},400)}
      else{const {error}=await sb.from("catalog_session_items").upsert({catalog_session_id:session.id,product_id:productId,rank:9999,reason:"Vitrine pública",recommendation_score:0,quantity,added_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata:{source:"public_catalog_root"}},{onConflict:"catalog_session_id,product_id"});if(error)return json({ok:false,error:"quantity_failed",detail:error.message},400)}
      if(quantity>Number(old?.quantity||0))await sb.from("catalog_events").insert({catalog_session_id:session.id,customer_id:null,product_id:productId,event_type:"catalog_add",event_data:{from:Number(old?.quantity||0),to:quantity,source:"public_catalog_root"}});
      return json({ok:true,cart:null});
    }
    const {data,error}=await sb.rpc("set_catalog_item_quantity",{p_public_token:token,p_product_id:productId,p_quantity:quantity});if(error)return json({ok:false,error:"quantity_failed",detail:error.message},400);return json({ok:true,...data});
  }

  if(action==="return_whatsapp"){
    await sb.from("catalog_events").insert({catalog_session_id:session.id,customer_id:session.customer_id,event_type:"catalog_checkout_return",event_data:{source:isPublicGuest?"public_catalog_root":"public_catalog"}});
    const phone=await phoneFor(sb,session.conversation_id);
    if(isPublicGuest){const summary=await selectedSummary(sb,session.id);let message="Olá! Vim pela vitrine da Dona Antônia.";if(summary.count){const total=summary.total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});message=`Olá! Escolhi estes produtos na vitrine da Dona Antônia:\n\n${summary.lines.join("\n")}\n\nTotal estimado: ${total}. Quero continuar meu pedido.`}return json({ok:true,whatsapp_url:`https://wa.me/${phone}?text=${encodeURIComponent(message)}`})}
    return json({ok:true,whatsapp_url:`https://wa.me/${phone}?text=${encodeURIComponent("Pronto, já escolhi os produtos no catálogo. Podemos continuar meu pedido?")}`});
  }
  return json({ok:false,error:"unknown_action"},400);
});
