import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const validToken=(v:unknown)=>/^[a-f0-9]{64}$/i.test(clean(v,80));
const validUuid=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(v,80));
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const brl=(v:number)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const DEFAULT_PHONE="5565984491018";
type Client=ReturnType<typeof createClient>;
type BasketItem={product_id:string;name:string;image_url:string|null;packaging:string|null;price:number;stock:number;quantity:number;base_quantity:number;min_quantity:number;max_quantity:number;removable:boolean;quantity_editable:boolean;remove_unit_delta:number|null;add_unit_delta:number|null};

async function sessionFor(sb:Client,token:string){
  const {data,error}=await sb.from("catalog_sessions").select("id,customer_id,conversation_id,status,expires_at").eq("public_token",token).maybeSingle();
  if(error)throw new Error("session_lookup_failed");
  if(!data||data.status!=="open"||new Date(data.expires_at).getTime()<=Date.now())throw new Error("catalog_unavailable");
  return data;
}
async function phoneFor(sb:Client,conversationId:string|null){
  let phone=DEFAULT_PHONE;
  if(conversationId){const {data}=await sb.from("conversations").select("whatsapp_account:whatsapp_accounts(phone_e164)").eq("id",conversationId).maybeSingle();const found=digits((data as any)?.whatsapp_account?.phone_e164);if(found)phone=found}
  return phone;
}
async function detail(sb:Client,basketId:string){
  const {data:b,error:be}=await sb.from("basket_templates").select("id,name,base_price,image_url,description").eq("id",basketId).eq("is_active",true).eq("is_whatsapp_active",true).maybeSingle();
  if(be||!b)throw new Error("basket_not_found");
  const {data:rows,error:ie}=await sb.from("basket_template_items").select("product_id,quantity,removable,quantity_editable,sort_order,remove_unit_delta,add_unit_delta,product:products(id,name,image_url,packaging,price,stock,is_active,physically_verified)").eq("basket_id",basketId).order("sort_order",{ascending:true});
  if(ie)throw new Error("basket_items_failed");
  const items:BasketItem[]=(rows||[]).map((x:any)=>{
    const base=Math.max(0,Math.trunc(Number(x.quantity||0)));
    const stock=Math.max(0,Math.floor(Number(x.product?.stock||0)));
    // Igual ao site ativo: pode zerar/retirar e pode aumentar até o estoque real; sem teto artificial do Flow.
    const min=x.removable?0:base;
    const max=x.quantity_editable?Math.max(base,stock):base;
    return {product_id:String(x.product_id),name:x.product?.name||"Produto",image_url:x.product?.image_url||null,packaging:x.product?.packaging||null,price:Number(x.product?.price||0),stock,quantity:base,base_quantity:base,min_quantity:min,max_quantity:max,removable:Boolean(x.removable),quantity_editable:Boolean(x.quantity_editable),remove_unit_delta:x.remove_unit_delta==null?null:Number(x.remove_unit_delta),add_unit_delta:x.add_unit_delta==null?null:Number(x.add_unit_delta)};
  });
  return {id:b.id,name:b.name,base_price:Number(b.base_price||0),price:Number(b.base_price||0),image_url:b.image_url||null,description:b.description||null,items,selection:items.map(x=>({product_id:x.product_id,quantity:x.quantity}))};
}
function validateSelection(basket:any,selectionInput:any){
  if(!Array.isArray(selectionInput))throw new Error("basket_selection_invalid");
  const requested=new Map<string,number>();
  for(const raw of selectionInput){
    const id=clean(raw?.product_id,80),n=Number(raw?.quantity);
    if(!validUuid(id)||!Number.isInteger(n)||n<0)throw new Error("invalid_quantity");
    if(requested.has(id))throw new Error("duplicate_product");
    requested.set(id,n);
  }
  if(requested.size!==basket.items.length)throw new Error("basket_selection_incomplete");
  return basket.items.map((item:BasketItem)=>{
    if(!requested.has(item.product_id))throw new Error("basket_selection_incomplete");
    const q=requested.get(item.product_id)!;
    if(q===0&&!item.removable)throw new Error("product_not_removable");
    if(q!==item.base_quantity&&!item.quantity_editable)throw new Error("quantity_not_editable");
    if(q<item.min_quantity)throw new Error("quantity_below_minimum");
    if(q>item.max_quantity)throw new Error("stock_insufficient");
    return {...item,quantity:q,changed:q!==item.base_quantity};
  });
}
async function quote(sb:Client,basketId:string,selectionInput:any){
  const basket=await detail(sb,basketId);
  const normalized=validateSelection(basket,Array.isArray(selectionInput)?selectionInput:basket.selection);
  // Mesma lógica comercial do index ativo: preço-base da cesta +/− diferença das unidades pelo preço do produto.
  let total=Number(basket.base_price||0);
  for(const x of normalized){
    if(x.quantity<x.base_quantity)total-=(x.base_quantity-x.quantity)*Number(x.remove_unit_delta??x.price);
    else if(x.quantity>x.base_quantity)total+=(x.quantity-x.base_quantity)*Number(x.add_unit_delta??x.price);
  }
  total=Math.max(0,Math.round((total+Number.EPSILON)*100)/100);
  return {basket,selection:normalized.map(x=>({product_id:x.product_id,quantity:x.quantity})),normalized,total};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)return json({ok:false,error:"server_config"},500);
  const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let body:any={};try{body=await req.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const action=clean(body?.action||"detail",30),token=clean(body?.token,80),basketId=clean(body?.basket_id,80);
  if(!validToken(token))return json({ok:false,error:"invalid_token"},400);
  if(!validUuid(basketId))return json({ok:false,error:"invalid_basket"},400);
  let session:any;try{session=await sessionFor(sb,token)}catch(e){return json({ok:false,error:clean((e as Error).message,80)},404)}
  if(action==="detail"){try{return json({ok:true,basket:await detail(sb,basketId)})}catch(e){return json({ok:false,error:clean((e as Error).message,100)},404)}}
  if(action==="quote"){try{const q=await quote(sb,basketId,body?.selection);return json({ok:true,total:q.total,selection:q.selection,normalized:q.normalized})}catch(e){return json({ok:false,error:clean((e as Error).message,100)},400)}}
  if(action==="send"){
    try{
      const q=await quote(sb,basketId,body?.selection),kept=q.normalized.filter(x=>x.quantity>0);if(!kept.length)return json({ok:false,error:"basket_empty"},400);
      const phone=await phoneFor(sb,session.conversation_id),title=/cesta/i.test(q.basket.name)?q.basket.name:`Cesta ${q.basket.name}`;
      // Exatamente o princípio do index ativo: a mensagem recebe a lista completa visível do pedido; itens zerados não entram.
      const itemsTxt=kept.map(x=>`${x.quantity}x ${x.name}`).join("\n");
      const orderId=String(Date.now()).slice(-6);
      const msg=`*PEDIDO #${orderId}*\n\n*CESTA:* ${title}\n\n*ITENS:*\n${itemsTxt}\n\n*TOTAL: ${brl(q.total)}*`;
      await sb.from("catalog_events").insert({catalog_session_id:session.id,customer_id:session.customer_id,event_type:"basket_interest",event_data:{order_ref:orderId,basket_id:q.basket.id,basket_name:q.basket.name,total:q.total,selection:q.selection,items:kept.map(x=>({product_id:x.product_id,name:x.name,quantity:x.quantity})),customized:q.normalized.some(x=>x.changed),source:"public_catalog"}});
      return json({ok:true,order_ref:orderId,total:q.total,items:kept.map(x=>({product_id:x.product_id,name:x.name,quantity:x.quantity})),whatsapp_url:`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`});
    }catch(e){return json({ok:false,error:clean((e as Error).message,100)},400)}
  }
  return json({ok:false,error:"unknown_action"},400);
});
