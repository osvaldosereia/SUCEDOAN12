const HISTORY_ENDPOINT="https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1";

const clean=(v:unknown,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);

export async function syncVitrineOrderHistory(db:any,orderId:string,organizationId:string){
  const started=new Date().toISOString();
  const previous=await db.from("vitrine_history_sync_outbox")
    .select("attempt_count").eq("order_id",orderId).maybeSingle();
  const attempt=Number(previous.data?.attempt_count||0)+1;
  await db.from("vitrine_history_sync_outbox").upsert({
    order_id:orderId,state:"pending",attempt_count:attempt,last_attempt_at:started,last_error:null,updated_at:started
  },{onConflict:"order_id"});

  try{
    const {data:order,error:oErr}=await db.from("orders")
      .select("id,order_number,status,subtotal_cents,discount_cents,delivery_cents,total_cents,delivery_address_snapshot,payment_method_snapshot,confirmed_at,delivered_at,created_at,whatsapp_phone_e164")
      .eq("organization_id",organizationId).eq("id",orderId).maybeSingle();
    if(oErr)throw oErr;
    if(!order)throw new Error("order_not_found");

    const {data:items,error:iErr}=await db.from("order_items")
      .select("id,product_id,basket_id,item_kind,name_snapshot,sku_snapshot,quantity,unit_price_cents,total_cents,metadata")
      .eq("organization_id",organizationId).eq("order_id",orderId);
    if(iErr)throw iErr;

    const itemRows=items||[];
    const itemIds=itemRows.map((x:any)=>x.id);
    let components:any[]=[];
    if(itemIds.length){
      const c=await db.from("order_item_components")
        .select("id,order_item_id,product_id,name_snapshot,sku_snapshot,quantity,metadata")
        .eq("organization_id",organizationId).in("order_item_id",itemIds);
      if(c.error)throw c.error;
      components=c.data||[];
    }

    const productIds=[...new Set([
      ...itemRows.map((x:any)=>x.product_id),
      ...components.map((x:any)=>x.product_id)
    ].filter(Boolean))];
    let products:any[]=[];
    if(productIds.length){
      const p=await db.from("products").select("id,sku,gtin,name").eq("organization_id",organizationId).in("id",productIds);
      if(p.error)throw p.error;
      products=p.data||[];
    }
    const productMap=new Map(products.map((p:any)=>[p.id,p]));
    const compMap=new Map<string,any[]>();
    for(const c of components){
      if(!compMap.has(c.order_item_id))compMap.set(c.order_item_id,[]);
      const p=productMap.get(c.product_id);
      compMap.get(c.order_item_id)!.push({
        product_id:c.product_id||null,
        sku:c.sku_snapshot||p?.sku||"",
        gtin:p?.gtin||"",
        name:c.name_snapshot||p?.name||"Item da cesta",
        quantity:Number(c.quantity||0),
        metadata:c.metadata||{}
      });
    }

    const delivery=order.delivery_address_snapshot&&typeof order.delivery_address_snapshot==="object"
      ? order.delivery_address_snapshot : {};
    const payment=order.payment_method_snapshot&&typeof order.payment_method_snapshot==="object"
      ? order.payment_method_snapshot : {};
    const payload={
      source_order_id:order.id,
      order_number:String(order.order_number||""),
      status:String(order.status||"created"),
      subtotal_cents:Number(order.subtotal_cents||0),
      discount_cents:Number(order.discount_cents||0),
      delivery_cents:Number(order.delivery_cents||0),
      total_cents:Number(order.total_cents||0),
      created_at:order.created_at,
      confirmed_at:order.confirmed_at,
      delivered_at:order.delivered_at,
      updated_at:new Date().toISOString(),
      customer:{
        source_customer_id:delivery.source_customer_id||null,
        name:delivery.customer_name||"",
        phone:order.whatsapp_phone_e164||delivery.phone||"",
        cpf:delivery.cpf||delivery.cpf_cnpj||""
      },
      delivery,
      payment,
      items:itemRows.map((x:any)=>{
        const p=productMap.get(x.product_id);
        return {
          source_item_id:x.id,
          kind:x.item_kind||"product",
          product_id:x.product_id||null,
          basket_id:x.basket_id||null,
          sku:x.sku_snapshot||p?.sku||"",
          gtin:p?.gtin||"",
          name:x.name_snapshot||p?.name||"Item",
          quantity:Number(x.quantity||0),
          unit_price_cents:Number(x.unit_price_cents||0),
          total_cents:Number(x.total_cents||0),
          metadata:x.metadata||{},
          components:compMap.get(x.id)||[]
        };
      })
    };

    const secretQ=await db.from("internal_integration_secrets").select("secret_value")
      .eq("integration_key","vitrine_history_bridge").maybeSingle();
    if(secretQ.error||!secretQ.data?.secret_value)throw new Error("history_bridge_secret_missing");

    const response=await fetch(HISTORY_ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-vitrine-history-key":String(secretQ.data.secret_value)},
      body:JSON.stringify({action:"vitrine_history_ingest",payload}),
      signal:AbortSignal.timeout(4500)
    });
    const data=await response.json().catch(()=>({ok:false,error:"invalid_history_response"}));
    if(!response.ok||data?.ok!==true)throw new Error(clean(data?.error||data?.detail||("history_http_"+response.status),500));

    const now=new Date().toISOString();
    await db.from("vitrine_history_sync_outbox").update({
      state:"synced",last_synced_at:now,last_error:null,remote_order_id:data.order_id||null,
      remote_customer_id:data.customer_id||null,updated_at:now
    }).eq("order_id",orderId);
    return {ok:true,...data};
  }catch(e){
    const msg=clean((e as Error)?.message,500)||"history_sync_failed";
    await db.from("vitrine_history_sync_outbox").update({
      state:"failed",last_error:msg,updated_at:new Date().toISOString()
    }).eq("order_id",orderId);
    return {ok:false,error:msg};
  }
}


export async function preloadPapoAiOperationalMessage(
  db:any,
  payload:{
    phone:string;
    name?:string|null;
    system_message:string;
    system_message_kind?:string|null;
    system_message_session_id?:string|null;
  }
){
  try{
    const secretQ=await db.from("internal_integration_secrets").select("secret_value")
      .eq("integration_key","vitrine_history_bridge").maybeSingle();
    if(secretQ.error||!secretQ.data?.secret_value)throw new Error("history_bridge_secret_missing");

    const response=await fetch(HISTORY_ENDPOINT,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-vitrine-history-key":String(secretQ.data.secret_value)
      },
      body:JSON.stringify({
        action:"vitrine_papoai_operational_preload_internal",
        phone:String(payload.phone||""),
        name:String(payload.name||"Cliente"),
        system_message:String(payload.system_message||"").slice(0,8000),
        system_message_kind:String(payload.system_message_kind||"post_order_cross_sell_offer").slice(0,80),
        system_message_session_id:String(payload.system_message_session_id||"").slice(0,100)
      }),
      signal:AbortSignal.timeout(15000)
    });
    const data=await response.json().catch(()=>({ok:false,error:"invalid_papoai_preload_response"}));
    if(!response.ok||data?.ok!==true){
      throw new Error(clean(data?.error||data?.detail||("papoai_preload_http_"+response.status),500));
    }
    return {ok:true,...data};
  }catch(e){
    return {ok:false,error:clean((e as Error)?.message,500)||"papoai_preload_failed"};
  }
}
