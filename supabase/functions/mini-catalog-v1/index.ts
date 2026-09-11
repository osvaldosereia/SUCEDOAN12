import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const text=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const digits=(v:unknown)=>String(v??"").replace(/\D/g,"");
const num=(v:unknown)=>{const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:null};
const validToken=(v:unknown)=>/^[a-f0-9]{64}$/i.test(text(v,80));
const DEFAULT_PHONE="5565984491018";

type Client=ReturnType<typeof createClient>;

async function phoneFor(sb:Client,conversationId:string|null){
  let phone=DEFAULT_PHONE;
  if(conversationId){
    const {data:conv}=await sb.from("conversations").select("whatsapp_account:whatsapp_accounts(phone_e164)").eq("id",conversationId).maybeSingle();
    const found=digits((conv as any)?.whatsapp_account?.phone_e164);if(found)phone=found;
  }
  return phone;
}

async function publicItems(sb:Client,sessionId:string){
  const {data:products,error:pe}=await sb.from("products")
    .select("id,name,price,image_url,category,brand,packaging,stock,is_offer,sort_order")
    .eq("physically_verified",true).eq("is_active",true).eq("is_whatsapp_active",true).gt("stock",0)
    .order("is_offer",{ascending:false}).order("sort_order",{ascending:true,nullsFirst:false}).order("name",{ascending:true}).limit(500);
  if(pe)throw new Error("catalog_items_failed");
  const {data:selected,error:se}=await sb.from("catalog_session_items").select("product_id,quantity").eq("catalog_session_id",sessionId).gt("quantity",0);
  if(se)throw new Error("catalog_selection_failed");
  const quantities=new Map<string,number>((selected||[]).map((x:any)=>[String(x.product_id),Number(x.quantity||0)]));
  return (products||[]).map((p:any,index:number)=>({
    product_id:p.id,rank:index+1,reason:"Catálogo Dona Antônia",recommendation_score:0,quantity:quantities.get(String(p.id))||0,
    product:{id:p.id,name:p.name,price:p.price,image_url:p.image_url,category:p.category,brand:p.brand,packaging:p.packaging,stock:p.stock,is_offer:p.is_offer}
  }));
}

async function selectedSummary(sb:Client,sessionId:string){
  const {data,error}=await sb.from("catalog_session_items")
    .select("product_id,quantity,product:products(name,price)")
    .eq("catalog_session_id",sessionId).gt("quantity",0).order("updated_at",{ascending:true});
  if(error)return {lines:[] as string[],total:0,count:0};
  let total=0;
  const rows=(data||[]) as any[];
  const lines=rows.slice(0,25).map((x:any)=>{
    const q=Number(x.quantity||0),price=Number(x.product?.price||0);total+=q*price;
    return `${q}x ${text(x.product?.name,100)}`;
  });
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
  const action=text(body?.action||"open",40).toLowerCase();
  const token=text(body?.token,80);

  if(action==="open_public"){
    const expiresAt=new Date(Date.now()+4*60*60*1000).toISOString();
    const {data:session,error:ce}=await sb.from("catalog_sessions").insert({
      kind:"browse",title:"Produtos",status:"open",expires_at:expiresAt,
      metadata:{public_guest:true,shopping_mode:"catalog_first",source:"public_catalog_root"},last_opened_at:new Date().toISOString()
    }).select("id,public_token,kind,title,status,expires_at,metadata").single();
    if(ce||!session)return json({ok:false,error:"catalog_create_failed",detail:ce?.message||null},500);
    let items:any[]=[];try{items=await publicItems(sb,session.id)}catch(e){return json({ok:false,error:text((e as Error).message,80)},500)}
    const phone=DEFAULT_PHONE;
    return json({ok:true,token:session.public_token,session:{title:session.title,kind:session.kind,expires_at:session.expires_at,shopping_mode:"catalog_first",public_guest:true},items,cart:null,whatsapp_url:`https://wa.me/${phone}?text=${encodeURIComponent("Olá! Vim pela vitrine da Dona Antônia.")}`});
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
    let items:any[]=[];
    if(isPublicGuest){
      try{items=await publicItems(sb,session.id)}catch(e){return json({ok:false,error:text((e as Error).message,80)},500)}
    }else{
      const {data,error:ie}=await sb.from("catalog_session_items").select("product_id,rank,reason,recommendation_score,quantity,product:products(id,name,price,image_url,category,brand,packaging,stock,is_offer)").eq("catalog_session_id",session.id).order("rank",{ascending:true});
      if(ie)return json({ok:false,error:"catalog_items_failed"},500);items=data||[];
    }
    let cart:any=null;if(session.cart_id){const {data:c}=await sb.from("carts").select("id,total,fiscal_subtotal,other_expenses,discount,status,version").eq("id",session.cart_id).maybeSingle();cart=c||null}
    const phone=await phoneFor(sb,session.conversation_id);
    const waText=encodeURIComponent(isPublicGuest?"Olá! Vim pela vitrine da Dona Antônia.":"Pronto, já escolhi os produtos no catálogo. Podemos continuar meu pedido?");
    return json({ok:true,token:session.public_token,session:{title:session.title,kind:session.kind,expires_at:session.expires_at,shopping_mode:session.metadata?.shopping_mode||null,public_guest:isPublicGuest},items,cart,whatsapp_url:`https://wa.me/${phone}?text=${waText}`});
  }

  if(action==="set_quantity"){
    const productId=text(body?.product_id,80),quantity=num(body?.quantity);
    if(!/^[0-9a-f-]{36}$/i.test(productId)||quantity===null||quantity<0||quantity>999)return json({ok:false,error:"invalid_quantity"},400);
    if(isPublicGuest){
      const {data:product,error:pe}=await sb.from("products").select("id").eq("id",productId).eq("physically_verified",true).eq("is_active",true).eq("is_whatsapp_active",true).gt("stock",0).maybeSingle();
      if(pe||!product)return json({ok:false,error:"product_not_available"},400);
      const {data:old}=await sb.from("catalog_session_items").select("quantity").eq("catalog_session_id",session.id).eq("product_id",productId).maybeSingle();
      if(quantity===0){
        const {error}=await sb.from("catalog_session_items").delete().eq("catalog_session_id",session.id).eq("product_id",productId);if(error)return json({ok:false,error:"quantity_failed",detail:error.message},400);
      }else{
        const {error}=await sb.from("catalog_session_items").upsert({catalog_session_id:session.id,product_id:productId,rank:9999,reason:"Vitrine pública",recommendation_score:0,quantity,added_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata:{source:"public_catalog_root"}},{onConflict:"catalog_session_id,product_id"});
        if(error)return json({ok:false,error:"quantity_failed",detail:error.message},400);
      }
      if(quantity>Number(old?.quantity||0))await sb.from("catalog_events").insert({catalog_session_id:session.id,customer_id:null,product_id:productId,event_type:"catalog_add",event_data:{from:Number(old?.quantity||0),to:quantity,source:"public_catalog_root"}});
      return json({ok:true,cart:null});
    }
    const {data,error}=await sb.rpc("set_catalog_item_quantity",{p_public_token:token,p_product_id:productId,p_quantity:quantity});
    if(error)return json({ok:false,error:"quantity_failed",detail:error.message},400);
    return json({ok:true,...data});
  }

  if(action==="return_whatsapp"){
    await sb.from("catalog_events").insert({catalog_session_id:session.id,customer_id:session.customer_id,event_type:"catalog_checkout_return",event_data:{source:isPublicGuest?"public_catalog_root":"public_catalog"}});
    const phone=await phoneFor(sb,session.conversation_id);
    if(isPublicGuest){
      const summary=await selectedSummary(sb,session.id);
      let message="Olá! Vim pela vitrine da Dona Antônia.";
      if(summary.count){
        const total=summary.total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
        message=`Olá! Escolhi estes produtos na vitrine da Dona Antônia:\n\n${summary.lines.join("\n")}\n\nTotal estimado: ${total}. Quero continuar meu pedido.`;
      }
      return json({ok:true,whatsapp_url:`https://wa.me/${phone}?text=${encodeURIComponent(message)}`});
    }
    return json({ok:true,whatsapp_url:`https://wa.me/${phone}?text=${encodeURIComponent("Pronto, já escolhi os produtos no catálogo. Podemos continuar meu pedido?")}`});
  }
  return json({ok:false,error:"unknown_action"},400);
});
