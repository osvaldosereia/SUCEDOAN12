import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { sendTemplateViaMeta, MetaTransportError } from "../_shared/whatsapp-meta-transport-v1.mjs";

const U=Deno.env.get("SUPABASE_URL")||"";
const K=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||""}})();
const META_WHATSAPP_ACCESS_TOKEN=(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"").trim();
const META_WHATSAPP_GRAPH_VERSION=(Deno.env.get("META_WHATSAPP_GRAPH_VERSION")||"").trim();
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});

type Channel="0975"|"1018";
type DispatchScope="admin_manual"|"checkout_auto";
type JsonRecord=Record<string,unknown>;
type OrderItem={product_id?:unknown;name_snapshot?:unknown;quantity?:unknown;metadata?:unknown;created_at?:unknown};
type OrderRow={
  id?:unknown;order_number?:unknown;customer_id?:unknown;phone_e164?:unknown;total?:unknown;payment_method?:unknown;
  created_at?:unknown;customer_snapshot?:unknown;delivery_address?:unknown;checkout_snapshot?:unknown;basket_name_snapshot?:unknown;
};

const ORDER_TEMPLATE_BY_CHANNEL:Record<Channel,string>={
  "0975":"pedidoorganizadosite0975v2",
  "1018":"pedidoorganizadosite1018v2"
};
const ORDER_TEMPLATE_LANGUAGE="pt_BR";

const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const text=(v:unknown,n=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const metaErrorDiagnostic=(error:MetaTransportError)=>{
  const digits=(value:unknown)=>String(value??"").replace(/\D+/g,"").slice(0,16);
  const parts=[text(error.code,80)||"meta_error"];
  const httpStatus=digits(error.httpStatus),providerCode=digits(error.providerCode),providerSubcode=digits(error.providerSubcode);
  if(httpStatus)parts.push(`http_${httpStatus}`);
  if(providerCode)parts.push(`provider_code_${providerCode}`);
  if(providerSubcode)parts.push(`provider_subcode_${providerSubcode}`);
  return parts.join(":");
};
const uid=(v:unknown)=>{const s=text(v,80);return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:""};
const money=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n):""};
const quantityLabel=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("pt-BR",{maximumFractionDigits:3}).format(n):""};
const obj=(v:unknown):JsonRecord=>v&&typeof v==="object"&&!Array.isArray(v)?v as JsonRecord:{};
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const channelKeyFromPhone=(v:unknown):Channel|null=>{const d=String(v??"").replace(/\D+/g,"");if(d.endsWith("0975"))return "0975";if(d.endsWith("1018"))return "1018";return null};
const metaConfigReady=()=>Boolean(META_WHATSAPP_ACCESS_TOKEN&&/^v\d+\.\d+$/.test(META_WHATSAPP_GRAPH_VERSION));
const paymentLabel=(v:unknown)=>{
  const raw=text(v,80),key=raw.toLowerCase();
  const labels:Record<string,string>={pix:"PIX",dinheiro:"Dinheiro",cash:"Dinheiro",credito:"Cartão de crédito",credit_card:"Cartão de crédito",alimentacao:"Cartão alimentação",refeicao:"Cartão refeição",food_card:"Cartão alimentação/refeição"};
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

async function activeMetaAccounts(){
  const r=await db.from("whatsapp_accounts").select("id,phone_e164,phone_number_id,is_active").eq("is_active",true);
  if(r.error)throw new Error(`meta_accounts_query_failed: ${text(r.error.message,220)}`);
  return r.data||[];
}
async function metaAccountForItem(item:any,channel:Channel){
  if(!metaConfigReady())return null;
  const rows=await activeMetaAccounts();
  const accountId=uid(item?.whatsapp_account_id);
  const account=accountId?rows.find((row:any)=>String(row.id)===accountId):rows.find((row:any)=>channelKeyFromPhone(row.phone_e164)===channel);
  if(!account||channelKeyFromPhone(account.phone_e164)!==channel)return null;
  if(!/^\d{5,30}$/.test(String(account.phone_number_id||"")))return null;
  return account;
}
async function providerReadiness(){
  if(!metaConfigReady())return {ready:false,provider:"meta",providers:{"0975":false,"1018":false},reason:"meta_transport_not_configured"};
  const rows=await activeMetaAccounts();
  const ready=(channel:Channel)=>rows.some((row:any)=>channelKeyFromPhone(row.phone_e164)===channel&&/^\d{5,30}$/.test(String(row.phone_number_id||"")));
  const p0975=ready("0975"),p1018=ready("1018");
  return {ready:p0975&&p1018,provider:"meta",providers:{"0975":p0975,"1018":p1018}};
}

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
  const itemsTextLineSeparator=lines.join("\u2028").trim();
  const productOverflow=lines.length>60;
  const productBucket=productOverflow?0:Math.max(5,Math.ceil(lines.length/5)*5);
  const productTemplateMode=productOverflow?"legacy_fallback":"bucketed";
  const productSlotCount=productOverflow?0:productBucket;
  const productPaddingCount=productOverflow?0:productBucket-lines.length;
  const productSlots=Object.fromEntries(Array.from({length:productSlotCount},(_,index)=>[
    `product_${String(index+1).padStart(2,"0")}`,
    lines[index]||"\u200B"
  ] as const));

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

  const addressParts=[address.street,address.number,address.complement,address.reference].map(v=>text(v,220)).filter(Boolean);
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
    itemsTextLineSeparator,
    productTemplateMode,
    productOverflow,
    productBucket,
    productPaddingCount,
    productSlots,
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
async function finish(outboxId:string,status:"accepted"|"sent"|"retry"|"failed"|"suppressed",externalId:string|null,lastError:string|null,retrySeconds=300){
  const r=await db.rpc("ops2_finish_whatsapp_outbox_v1",{
    p_outbox_id:outboxId,p_status:status,p_external_message_id:externalId,p_last_error:lastError,p_retry_after_seconds:retrySeconds
  });
  if(r.error||r.data?.ok!==true)throw new Error(`finish_failed: ${text(r.error?.message||r.data?.error)}`);
  return r.data;
}
async function markMetaUncertain(outboxId:string,item:any,providerPayload:JsonRecord,metaRequest:JsonRecord,providerMessageId:string|null,errorCode:string){
  const code=`meta_send_uncertain:${text(errorCode,180)||"unknown"}`;
  const updated=await db.from("ops2_whatsapp_outbox_v1").update({
    status:"failed",external_message_id:providerMessageId||null,last_error:code,locked_at:null,updated_at:new Date().toISOString(),
    payload:{...obj(item?.payload),provider_request:providerPayload,meta_request:metaRequest,meta_send_uncertain:{code,provider_message_id:providerMessageId||null,recorded_at:new Date().toISOString()}}
  }).eq("id",outboxId).eq("status","sending");
  if(updated.error)throw new Error(`meta_uncertain_audit_failed: ${text(updated.error.message,220)}`);
  return code;
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
  let account:any=null;
  try{account=await metaAccountForItem(item,channel)}catch(error){
    const errorText=text((error as Error)?.message||error,300);
    const nextStatus=scope==="checkout_auto"?"retry":"failed";
    try{await finish(outboxId,nextStatus,null,errorText,300)}catch{}
    return respond({ok:false,error:"meta_transport_not_configured",status:nextStatus,channel_origin:channel,outbox_id:outboxId},503);
  }
  if(!account){
    const errorText=`meta_transport_not_configured_${channel}`;
    const nextStatus=scope==="checkout_auto"?"retry":"failed";
    try{await finish(outboxId,nextStatus,null,errorText,300)}catch{}
    return respond({ok:false,error:"meta_transport_not_configured",status:nextStatus,channel_origin:channel,recipient_kind:item.recipient_kind||null,outbox_id:outboxId},503);
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

  let publicOrderLink:any=null;
  try{
    const publicLinkResult=await db.rpc("ops2_order_public_link_v1",{p_order_id:orderId});
    if(!publicLinkResult.error)publicOrderLink=publicLinkResult.data||null;
  }catch(error){console.error("order_public_link",text((error as Error)?.message||error,180))}
  const publicOrderCode=text(publicOrderLink?.public_code,5);
  const publicOrderUrl=text(publicOrderLink?.public_url,300);
  if(!/^[A-Z]{2}[0-9]{3}$/.test(publicOrderCode)||!publicOrderUrl){
    const nextStatus=scope==="checkout_auto"?"retry":"failed";
    try{await finish(outboxId,nextStatus,null,"public_order_identity_missing",scope==="checkout_auto"?30:0)}catch{}
    return respond({ok:false,error:"public_order_identity_missing",status:nextStatus,outbox_id:outboxId,dispatch_scope:scope},scope==="checkout_auto"?503:409);
  }

  const providerPayload={
    event:"order_received",
    source:scope==="checkout_auto"?"dona_antonia_supabase":"dona_antonia_admin",
    event_id:outboxId,
    order_id:item.order_id,
    order_public_token:text(publicOrderLink?.public_token,32),
    order_public_code:publicOrderCode,
    order_url:publicOrderUrl,
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
    product_count:details.itemCount,
    product_template_mode:details.productTemplateMode,
    product_overflow:details.productOverflow,
    product_bucket:details.productBucket,
    product_padding_count:details.productPaddingCount,
    ...details.productSlots,
    items_count:details.itemCount,
    items_text_line_separator:details.itemsTextLineSeparator,
    items_text:details.itemsText
  };

  const templateName=ORDER_TEMPLATE_BY_CHANNEL[channel];
  const components=[{type:"body",parameters:[
    {type:"text",text:text(details.orderDate,40)},
    {type:"text",text:publicOrderCode},
    {type:"text",text:text(details.customerStatus,30)},
    {type:"text",text:text(details.customerName,80)},
    {type:"text",text:text(details.customerPhone,30)},
    {type:"text",text:text(details.addressLabel,90)},
    {type:"text",text:text(details.districtLabel,40)},
    {type:"text",text:text(details.cityLabel,40)},
    {type:"text",text:text(details.deliveryLabel,80)},
    {type:"text",text:text(details.basketTextTemplate,80)},
    {type:"text",text:text(details.itemsText,180)},
    {type:"text",text:text(details.totalFormatted,30)},
    {type:"text",text:text(details.paymentLabel,50)},
    {type:"text",text:publicOrderUrl}
  ]}];
  const metaRequest:JsonRecord={provider:"meta",dispatch_scope:scope,template_name:templateName,language_code:ORDER_TEMPLATE_LANGUAGE,components};

  try{
    const audit=await db.from("ops2_whatsapp_outbox_v1")
      .update({whatsapp_account_id:account.id,channel_phone_e164:account.phone_e164,payload:{...obj(item.payload),provider_request:providerPayload,meta_request:metaRequest}})
      .eq("id",outboxId).eq("status","sending");
    if(audit.error)throw new Error(`provider_payload_audit_failed: ${text(audit.error.message,240)}`);

    const providerAttempts=scope==="checkout_auto"?2:1;
    for(let providerAttempt=1;providerAttempt<=providerAttempts;providerAttempt++){
      try{
        const result=await sendTemplateViaMeta({
          accessToken:META_WHATSAPP_ACCESS_TOKEN,
          phoneNumberId:String(account.phone_number_id||""),
          toE164:item.phone_e164,
          templateName,
          languageCode:ORDER_TEMPLATE_LANGUAGE,
          components,
          graphVersion:META_WHATSAPP_GRAPH_VERSION,
          timeoutMs:15000
        });
        const acceptedAt=new Date().toISOString();
        const accepted=await db.rpc("ops2_accept_order_whatsapp_meta_v1",{
          p_outbox_id:outboxId,p_provider_message_id:result.providerMessageId,p_accepted_at:acceptedAt
        });
        if(accepted.error||accepted.data?.ok!==true){
          const detail=text(accepted.error?.message||accepted.data?.error||"canonical_persist_failed",240);
          await markMetaUncertain(outboxId,item,providerPayload,metaRequest,result.providerMessageId,`canonical_persist_failed:${detail}`);
          return respond({ok:false,error:"meta_send_uncertain",status:"failed",uncertain:true,outbox_id:outboxId,recipient_kind:item.recipient_kind,channel_origin:channel,dispatch_scope:scope,external_message_id:result.providerMessageId},502);
        }
        return respond({
          ok:true,status:"sent",provider:"meta",outbox_id:outboxId,recipient_kind:item.recipient_kind,
          channel_origin:channel,dispatch_scope:scope,external_message_id:result.providerMessageId,
          canonical_message_id:accepted.data?.message_id||null,status_current:accepted.data?.status_current||"accepted"
        });
      }catch(error){
        if(error instanceof MetaTransportError){
          if(error.uncertain){
            await markMetaUncertain(outboxId,item,providerPayload,metaRequest,null,metaErrorDiagnostic(error));
            return respond({ok:false,error:"meta_send_uncertain",status:"failed",uncertain:true,outbox_id:outboxId,recipient_kind:item.recipient_kind,dispatch_scope:scope},503);
          }
          const retryable=error.retryable===true&&Number(item.attempt_count||0)<5;
          if(scope==="checkout_auto"&&retryable&&providerAttempt<providerAttempts){
            await new Promise(resolve=>setTimeout(resolve,750));
            continue;
          }
          const state=retryable?"retry":"failed";
          await finish(outboxId,state,null,metaErrorDiagnostic(error),error.httpStatus===429?300:30);
          return respond({ok:false,error:error.code,status:state,retryable,uncertain:false,outbox_id:outboxId,recipient_kind:item.recipient_kind,dispatch_scope:scope,http_status:error.httpStatus},retryable?503:502);
        }
        await markMetaUncertain(outboxId,item,providerPayload,metaRequest,null,"unexpected_transport_error");
        return respond({ok:false,error:"meta_send_uncertain",status:"failed",uncertain:true,outbox_id:outboxId,recipient_kind:item.recipient_kind,dispatch_scope:scope},503);
      }
    }
    throw new Error("provider_attempt_loop_exhausted");
  }catch(error){
    const errorText=text((error as Error)?.message||error,300);
    try{await finish(outboxId,"failed",null,`provider_internal_failure:${errorText}`,0)}catch{}
    return respond({ok:false,error:"provider_internal_failure",status:"failed",outbox_id:outboxId,recipient_kind:item.recipient_kind,dispatch_scope:scope},500);
  }
});
