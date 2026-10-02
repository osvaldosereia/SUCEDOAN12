import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const PROVIDER_TOKEN=Deno.env.get("PAPOAI_ORDER_WEBHOOK_TOKEN")||"";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});

type Channel="0975"|"1018";
type DispatchScope="admin_manual"|"checkout_auto";
type JsonRecord=Record<string,unknown>;
type OrderItem={product_id?:unknown;name_snapshot?:unknown;quantity?:unknown;metadata?:unknown;created_at?:unknown};
type OrderRow={
  id?:unknown;order_number?:unknown;customer_id?:unknown;phone_e164?:unknown;total?:unknown;payment_method?:unknown;
  created_at?:unknown;customer_snapshot?:unknown;delivery_address?:unknown;checkout_snapshot?:unknown;basket_name_snapshot?:unknown;
};
const providerUrl=async(channel:Channel)=>{
  const envUrl=channel==="1018"
    ? (Deno.env.get("PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL")||"")
    : (Deno.env.get("PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL")||"");
  if(envUrl)return envUrl;
  const r=await db.rpc("ops2_papoai_order_provider_url_v1",{p_channel:channel});
  if(r.error)return "";
  return text(r.data,2000);
};
const providerReadiness=async()=>{
  const [u0975,u1018]=await Promise.all([providerUrl("0975"),providerUrl("1018")]);
  const p0975=Boolean(u0975),p1018=Boolean(u1018);
  return {ready:p0975&&p1018,providers:{"0975":p0975,"1018":p1018}};
};

const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const text=(v:unknown,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const uid=(v:unknown)=>{const s=text(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const money=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n):""};
const quantityLabel=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("pt-BR",{maximumFractionDigits:3}).format(n):""};
const obj=(v:unknown):JsonRecord=>v&&typeof v==="object"&&!Array.isArray(v)?v as JsonRecord:{};
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const paymentLabel=(v:unknown)=>{
  const raw=text(v,80),key=raw.toLowerCase();
  const labels:Record<string,string>={pix:"PIX",dinheiro:"Dinheiro",cash:"Dinheiro",credito:"Cartão de crédito",credit_card:"Cartão de crédito",alimentacao:"Cartão alimentação",refeicao:"Cartão refeição"};
  return labels[key]||raw||"A confirmar";
};
const formatPhoneBr=(v:unknown)=>{
  let digits=String(v??"").replace(/\D/g,"");
  if(digits.startsWith("55")&&(digits.length===12||digits.length===13))digits=digits.slice(2);
  if(digits.length===11)return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if(digits.length===10)return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return text(v,40)||"NAO INFORMADO";
};
const formatOrderDateCuiaba=(v:unknown)=>{
  const d=new Date(String(v??""));
  if(Number.isNaN(d.getTime()))return "NAO INFORMADA";
  const parts=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Cuiaba",day:"numeric",month:"long",year:"numeric"}).formatToParts(d);
  const get=(kind:string)=>parts.find(p=>p.type===kind)?.value||"";
  const month=get("month");
  const monthTitle=month?month.charAt(0).toUpperCase()+month.slice(1):"";
  return `${get("day")} de ${monthTitle} de ${get("year")}`;
};
const deliveryLabel=(delivery:JsonRecord,checkoutDelivery:JsonRecord)=>text(
  delivery.delivery_label||delivery.label||checkoutDelivery.label||checkoutDelivery.delivery_label||checkoutDelivery.delivery_date||delivery.delivery_date||"NAO INFORMADA",
  160
);

const marketingSlug=(v:unknown)=>text(v,220).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const MARKETING_CTA_PRIORITY=["BEBE","CABELOS","BELEZA","LIMPEZA","LAVANDERIA","PET"];
const marketingInterestForProduct=(product:JsonRecord)=>{
  const sub=marketingSlug(product.customer_subcategory||product.subcategory),leaf=marketingSlug(product.customer_subsubcategory||product.subsubcategory);
  if(sub==="bebe"||leaf.includes("fralda")||leaf.includes("bebe"))return "BEBE";
  if(sub==="cabelos"||["shampoo","condicionador","creme-de-pentear","tratamentos-capilares","coloracao-capilar","oleos-e-seruns-capilares","acessorios-de-cabelo","escovas-e-pentes","kits-de-shampoo-e-condicionador"].includes(leaf))return "CABELOS";
  if(sub==="beleza-e-cuidados"||["unhas","labios","cuidados-corporais","cuidados-com-o-rosto","protecao-da-pele","acessorios-de-beleza"].includes(leaf))return "BELEZA";
  if(sub==="higiene-pessoal")return "HIGIENE";
  if(sub==="limpeza")return "LIMPEZA";
  if(sub==="lavanderia")return "LAVANDERIA";
  if(sub==="pets"||["caes","gatos","petiscos-para-pets","higiene-pet"].includes(leaf))return "PET";
  if(sub==="casa-e-utilidades")return "CASA";
  if(["biscoitos","chocolates-e-doces","balas-e-chicletes","salgadinhos-e-petiscos","bebidas","cereais-e-barras"].includes(leaf))return "DOCES_LANCHES";
  return "";
};

async function orderDetails(orderId:string){
  const [orderResult,itemsResult]=await Promise.all([
    db.from("orders")
      .select("id,order_number,customer_id,phone_e164,total,payment_method,created_at,customer_snapshot,delivery_address,checkout_snapshot,basket_name_snapshot")
      .eq("id",orderId)
      .maybeSingle(),
    db.from("order_items")
      .select("product_id,name_snapshot,quantity,metadata,created_at")
      .eq("order_id",orderId)
      .order("created_at",{ascending:true})
  ]);
  if(orderResult.error)throw new Error(`order_query_failed: ${text(orderResult.error.message,240)}`);
  if(!orderResult.data)throw new Error("order_not_found");
  if(itemsResult.error)throw new Error(`order_items_query_failed: ${text(itemsResult.error.message,240)}`);

  const order=orderResult.data as OrderRow;
  const rows=(itemsResult.data||[]) as OrderItem[];
  const customer=obj(order.customer_snapshot),delivery=obj(order.delivery_address),checkout=obj(order.checkout_snapshot),checkoutDelivery=obj(checkout.delivery),checkoutCustomer=obj(checkout.customer);
  const checkoutCustomerAddress=obj(checkoutCustomer.address);
  const address={...checkoutCustomerAddress,...delivery};
  const lines=rows.map((row)=>{
    const name=text(row.name_snapshot,180)||"Item";
    const qty=quantityLabel(row.quantity)||"1";
    return `${qty}x ${name}`;
  });
  const productLines=lines.map(line=>`• ${line}`);
  const productsText=productLines.join("\n");
  const itemsText=lines.join(" • ").replace(/[\r\n\t]+/g," ").replace(/ {4,}/g,"   ").trim();

  const cartBaskets=arr(checkout.cart).map(obj).filter(item=>text(item.type,30)==="basket");
  const basketNames=arr(checkout.basket_names).map(v=>text(v,180)).filter(Boolean);
  let basketLines:string[]=[];
  if(basketNames.length){
    basketLines=basketNames.map((name,index)=>`${quantityLabel(cartBaskets[index]?.qty)||"1"}x ${name}`);
  }else{
    const seen=new Set<string>();
    for(const row of rows){
      const meta=obj(row.metadata),name=text(meta.basket_name,180);
      if(!name)continue;
      const qty=quantityLabel(meta.basket_quantity)||"1";
      const line=`${qty}x ${name}`;
      if(!seen.has(line)){seen.add(line);basketLines.push(line)}
    }
  }
  if(!basketLines.length){
    const fallbackBasket=text(order.basket_name_snapshot,180);
    if(fallbackBasket)basketLines=[`1x ${fallbackBasket}`];
  }
  const basketText=basketLines.length?basketLines.join("\n"):"NENHUMA";
  const basketTextTemplate=basketLines.length?basketLines.join(" • "):"NENHUMA";

  const checkoutProducts=arr(checkout.cart).map(obj).filter(item=>text(item.type,30)==="product");
  let standaloneIds=[...new Set(checkoutProducts.map(item=>uid(item.id||item.product_id)).filter(Boolean))];
  if(!standaloneIds.length){
    standaloneIds=[...new Set(rows.filter(row=>!text(obj(row.metadata).basket_name,180)).map(row=>uid(row.product_id)).filter(Boolean))];
  }
  let marketingProducts:JsonRecord[]=[];
  if(standaloneIds.length){
    const productsResult=await db.from("products").select("id,brand,subcategory,subsubcategory,customer_subcategory,customer_subsubcategory").in("id",standaloneIds);
    if(productsResult.error)throw new Error(`marketing_products_query_failed: ${text(productsResult.error.message,240)}`);
    marketingProducts=(productsResult.data||[]).map(obj);
  }
  const marketingInterests=new Set<string>();
  if(cartBaskets.length||basketLines.length)marketingInterests.add("CESTAS");
  const marketingBrands=new Set<string>();
  for(const product of marketingProducts){
    const interest=marketingInterestForProduct(product);if(interest)marketingInterests.add(interest);
    const brand=marketingSlug(product.brand);if(brand==="nivea")marketingBrands.add("NIVEA");else if(brand==="elseve")marketingBrands.add("ELSEVE");
  }
  const marketingOptIn=customer.marketing_opt_in===true||checkoutCustomer.marketing_opt_in===true;
  const marketingCta=marketingOptIn?(MARKETING_CTA_PRIORITY.find(value=>marketingInterests.has(value))||(marketingInterests.has("CESTAS")?"OFERTAS":"NENHUM")):"NENHUM";
  const marketingCampaign=text(customer.marketing_campaign||checkoutCustomer.marketing_campaign||checkout.marketing_campaign,80)||"NENHUM";

  const addressParts=[address.street,address.number,address.complement].map(v=>text(v,180)).filter(Boolean);
  const addressLabel=addressParts.join(", ")||"NAO INFORMADO";
  const districtLabel=text(address.district||address.neighborhood,140)||"NAO INFORMADO";
  const cityLabel=text(address.city,140)||"NAO INFORMADA";
  const deliveryDate=deliveryLabel(delivery,checkoutDelivery);
  const deliveryAddressFull=text([addressLabel,districtLabel,cityLabel].filter(v=>v&&v!=="NAO INFORMADO"&&v!=="NAO INFORMADA").join(" • "),500)||"A confirmar";
  const deliverySummary=text([deliveryDate,deliveryAddressFull].filter(Boolean).join(" • "),500)||"A confirmar";
  const fullNumber=text(order.order_number,80);
  const customerRegistered=Boolean(text(order.customer_id,80)||text(customer.customer_id,80));
  const customerName=text(customer.name||customer.display_name||checkoutCustomer.name||checkoutCustomer.display_name||delivery.customer_name,180)||"NAO INFORMADO";
  const customerPhone=formatPhoneBr(order.phone_e164||customer.phone_e164||checkoutCustomer.phone_e164||delivery.phone);

  return {
    order,
    itemCount:rows.length,
    orderDate:formatOrderDateCuiaba(order.created_at),
    orderNumber:fullNumber,
    orderNumberShort:fullNumber?fullNumber.slice(-8):"NAO INFORMADO",
    customerStatus:customerRegistered?"CADASTRADO":"NOVO",
    customerName,
    customerPhone,
    addressLabel,
    districtLabel,
    cityLabel,
    deliveryLabel:deliveryDate,
    deliveryAddressFull,
    deliverySummary,
    basketText,
    basketTextTemplate,
    marketingOptIn,
    marketingInterests:[...marketingInterests],
    marketingBrands:[...marketingBrands],
    marketingCta,
    marketingCampaign,
    productsText,
    itemsText,
    totalFormatted:money(order.total),
    paymentLabel:paymentLabel(order.payment_method||checkout.payment_label)
  };
}

async function claim(orderId:string,scope:DispatchScope){
  const rpc=scope==="checkout_auto"?"ops2_claim_checkout_order_whatsapp_v1":"ops2_claim_order_whatsapp_outbox_v1";
  const r=await db.rpc(rpc,{p_order_id:orderId});
  if(r.error)throw new Error(`claim_failed: ${text(r.error.message)}`);
  return r.data?.found===true?r.data.item:null;
}
async function finish(outboxId:string,status:"sent"|"retry"|"failed"|"suppressed",externalId:string|null,lastError:string|null,retrySeconds=300){
  const r=await db.rpc("ops2_finish_whatsapp_outbox_v1",{
    p_outbox_id:outboxId,p_status:status,p_external_message_id:externalId,p_last_error:lastError,p_retry_after_seconds:retrySeconds
  });
  if(r.error||r.data?.ok!==true)throw new Error(`finish_failed: ${text(r.error?.message||r.data?.error)}`);
  return r.data;
}
async function enqueuePapoAiOrderSignals(orderId:string,channel:Channel,phone:unknown,details:Awaited<ReturnType<typeof orderDetails>>){
  const keys=["PEDIDO_SITE",...details.marketingInterests.map((v:string)=>`INT_${v}`),...details.marketingBrands.map((v:string)=>`BR_${v}`)];
  if(details.marketingCta&&details.marketingCta!=="NENHUM")keys.push(`CTA_${details.marketingCta}`);
  if(!keys.length)return;
  try{
    const r=await db.rpc("ops2_enqueue_papoai_order_signals_v1",{p_order_id:orderId,p_channel_origin:channel,p_phone_e164:text(phone,40),p_signal_keys:[...new Set(keys)]});
    if(r.error||Number(r.data?.enqueued||0)<=0)return;
    const task=fetch(`${U}/functions/v1/papoai-order-signals-v1`,{method:"POST",headers:{"Content-Type":"application/json","x-internal-key":K},body:"{}"}).catch(error=>console.error("papoai_signal_worker_kick",text((error as Error)?.message||error,180)));
    const runtime=(globalThis as any).EdgeRuntime;if(runtime?.waitUntil)runtime.waitUntil(task);
  }catch(error){console.error("papoai_signal_enqueue",text((error as Error)?.message||error,180))}
}

Deno.serve(async(req:Request)=>{
  if(!U||!K)return respond({ok:false,error:"server_config"},500);
  const internalKey=req.headers.get("x-internal-key")||"",serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(internalKey!==K&&internalKey!==serviceRole)return respond({ok:false,error:"forbidden"},403);
  if(req.method==="GET")return respond({ok:true,service:"admin-orders-v1",...(await providerReadiness())});
  if(req.method!=="POST")return respond({ok:false,error:"method_not_allowed"},405);

  const body=await req.json().catch(()=>({}));
  const orderId=uid(body?.order_id);
  if(!orderId)return respond({ok:false,error:"order_id_required"},400);
  const scope:DispatchScope=text(body?.dispatch_scope,30)==="checkout_auto"?"checkout_auto":"admin_manual";

  if(scope==="admin_manual"){
    const readiness=await providerReadiness();
    if(!readiness.ready)return respond({ok:false,error:"provider_not_configured",...readiness},503);
  }

  let item:any=null;
  try{item=await claim(orderId,scope)}catch(error){return respond({ok:false,error:"claim_failed",detail:text((error as Error)?.message||error)},503)}
  if(!item)return respond({ok:true,status:"idle",sent:false,order_id:orderId,dispatch_scope:scope});

  const outboxId=uid(item.id),channel=(text(item.channel_origin,4)==="1018"?"1018":"0975") as Channel;
  const url=await providerUrl(channel);
  if(!url){
    const errorText=`provider_not_configured_${channel}`;
    const nextStatus=scope==="checkout_auto"?"retry":"failed";
    try{await finish(outboxId,nextStatus,null,errorText,300)}catch{}
    return respond({ok:false,error:"provider_not_configured",status:nextStatus,channel_origin:channel,recipient_kind:item.recipient_kind||null,outbox_id:outboxId},503);
  }

  let details:Awaited<ReturnType<typeof orderDetails>>;
  try{
    details=await orderDetails(orderId);
  }catch(error){
    const errorText=text((error as Error)?.message||error,300);
    const nextStatus=scope==="checkout_auto"?"retry":"failed";
    try{await finish(outboxId,nextStatus,null,errorText,scope==="checkout_auto"?30:0)}catch{}
    return respond({ok:false,error:"order_details_unavailable",status:nextStatus,outbox_id:outboxId,dispatch_scope:scope},scope==="checkout_auto"?503:422);
  }
  if(details.itemCount===0){
    const errorText="order_items_not_ready";
    const nextStatus=scope==="checkout_auto"?"retry":"failed";
    try{await finish(outboxId,nextStatus,null,errorText,scope==="checkout_auto"?30:0)}catch{}
    return respond({ok:false,error:errorText,status:nextStatus,outbox_id:outboxId,dispatch_scope:scope},scope==="checkout_auto"?503:422);
  }

  const providerPayload={
    event:"order_received",
    source:scope==="checkout_auto"?"dona_antonia_supabase":"dona_antonia_admin",
    event_id:outboxId,
    order_id:item.order_id,
    recipient_kind:text(item.recipient_kind,30),
    phone_e164:item.phone_e164,
    order_number:details.orderNumber,
    purchased_at:item.created_at,
    channel_origin:channel,
    delivery_mode:"utility_template",
    order_date:details.orderDate,
    order_number_short:details.orderNumberShort,
    customer_status:details.customerStatus,
    customer_name:details.customerName,
    customer_phone_formatted:details.customerPhone,
    address_label:details.addressLabel,
    district_label:details.districtLabel,
    city_label:details.cityLabel,
    delivery_label:details.deliverySummary,
    delivery_date_label:details.deliveryLabel,
    delivery_address_full:details.deliveryAddressFull,
    basket_text:details.basketText,
    basket_text_template:details.basketTextTemplate,
    marketing_opt_in:details.marketingOptIn?"SIM":"NAO",
    marketing_interests:details.marketingInterests.join("|"),
    marketing_brands:details.marketingBrands.join("|"),
    cta_pos_pedido:details.marketingCta,
    campaign_origin:details.marketingCampaign,
    interest_cestas:details.marketingInterests.includes("CESTAS")?"SIM":"NAO",
    interest_bebe:details.marketingInterests.includes("BEBE")?"SIM":"NAO",
    interest_cabelos:details.marketingInterests.includes("CABELOS")?"SIM":"NAO",
    interest_beleza:details.marketingInterests.includes("BELEZA")?"SIM":"NAO",
    interest_higiene:details.marketingInterests.includes("HIGIENE")?"SIM":"NAO",
    interest_limpeza:details.marketingInterests.includes("LIMPEZA")?"SIM":"NAO",
    interest_lavanderia:details.marketingInterests.includes("LAVANDERIA")?"SIM":"NAO",
    interest_pet:details.marketingInterests.includes("PET")?"SIM":"NAO",
    interest_casa:details.marketingInterests.includes("CASA")?"SIM":"NAO",
    interest_doces_lanches:details.marketingInterests.includes("DOCES_LANCHES")?"SIM":"NAO",
    brand_nivea:details.marketingBrands.includes("NIVEA")?"SIM":"NAO",
    brand_elseve:details.marketingBrands.includes("ELSEVE")?"SIM":"NAO",
    products_text:details.productsText,
    total_formatted:details.totalFormatted,
    payment_label:details.paymentLabel,
    items_count:details.itemCount,
    items_text:details.itemsText
  };

  const headers:Record<string,string>={"Content-Type":"application/json"};
  if(PROVIDER_TOKEN)headers.Authorization=`Bearer ${PROVIDER_TOKEN}`;

  try{
    const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(providerPayload)});
    const data=await response.json().catch(()=>({}));
    if(response.ok){
      const externalId=text(data?.external_message_id||data?.message_id||data?.id||"",200)||null;
      await finish(outboxId,"sent",externalId,null);
      void enqueuePapoAiOrderSignals(orderId,channel,item.phone_e164,details);
      return respond({ok:true,status:"sent",outbox_id:outboxId,recipient_kind:item.recipient_kind,channel_origin:channel,dispatch_scope:scope,external_message_id:externalId});
    }

    const retryable=response.status===429;
    const state=retryable&&Number(item.attempt_count||0)<5?"retry":"failed";
    const errorText=`provider_http_${response.status}: ${text(data?.error||data?.message||response.statusText,300)}`;
    await finish(outboxId,state,null,errorText,retryable?300:0);
    return respond({ok:false,error:"provider_rejected",status:state,outbox_id:outboxId,recipient_kind:item.recipient_kind,dispatch_scope:scope},retryable?503:502);
  }catch(error){
    const errorText=`provider_ambiguous_failure: ${text((error as Error)?.message||error,300)}`;
    try{await finish(outboxId,"failed",null,errorText,0)}catch(finishError){
      return respond({ok:false,error:"provider_failure_and_finish_failed",outbox_id:outboxId,detail:text((finishError as Error)?.message||finishError)},500);
    }
    return respond({ok:false,error:"provider_unreachable",status:"failed",outbox_id:outboxId,recipient_kind:item.recipient_kind,dispatch_scope:scope},503);
  }
});
