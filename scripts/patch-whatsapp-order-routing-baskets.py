from pathlib import Path

admin_path = Path('vitrine/admin/index.html')
admin = admin_path.read_text(encoding='utf-8')
start = admin.index('  const COMPANY_WHATSAPP_E164="5565998150975";')
end = admin.index('  function currentOrderRegistrationUrl()', start)

replacement = r'''  const COMPANY_WHATSAPP_E164="5565998150975";
  function appendCurrentOrderWhatsappItems(lines,items){
    (Array.isArray(items)?items:[]).forEach(item=>{
      const qty=Number(item?.quantity||item?.qty||1)||1;
      const name=String(item?.name_snapshot||item?.product_name||item?.name||item?.title||'Item').trim();
      lines.push('- '+qty+'x '+name);
      const components=Array.isArray(item?.components)?item.components:[];
      if(components.length){
        lines.push('  Itens da cesta:');
        components.forEach(component=>{
          const componentQty=Number(component?.quantity||component?.qty||1)||1;
          const componentName=String(component?.name_snapshot||component?.product_name||component?.name||component?.title||'Item').trim();
          lines.push('  - '+componentQty+'x '+componentName);
        });
      }
    });
  }
  function currentOrderCompanyWhatsappMessage(){
    const d=state.currentOrder||{},o=d.order||{},items=Array.isArray(d.items)?d.items:[];
    const customer=o.customer_snapshot&&typeof o.customer_snapshot==='object'?o.customer_snapshot:{};
    const delivery=(o.delivery_address_snapshot&&typeof o.delivery_address_snapshot==='object'?o.delivery_address_snapshot:(o.delivery_address&&typeof o.delivery_address==='object'?o.delivery_address:{}));
    const code=o.order_number||o.id||'';
    const lines=['PEDIDO DONA ANTONIA'];
    if(code)lines.push('','Pedido: '+code);
    const customerName=o.customer_name||customer.name||customer.display_name||delivery.customer_name||'';
    const customerPhone=o.phone_e164||o.whatsapp_phone_e164||customer.phone_e164||delivery.phone||'';
    lines.push('','CLIENTE');
    if(customerName)lines.push('Nome: '+customerName);
    if(customerPhone)lines.push('WhatsApp: '+formatPhone(customerPhone));
    const address=[delivery.street,delivery.number,delivery.complement].filter(Boolean).join(', ');
    const district=delivery.district||delivery.neighborhood||'';
    const city=delivery.city||'';
    if(address||district||city){
      lines.push('','ENTREGA');
      if(address)lines.push('Endereco: '+address);
      if(district)lines.push('Bairro: '+district);
      if(city)lines.push('Cidade: '+city);
    }
    lines.push('','PRODUTOS');
    appendCurrentOrderWhatsappItems(lines,items);
    const total=Number(o.total||o.total_amount||0);if(Number.isFinite(total)&&total>0)lines.push('','TOTAL: '+total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
    const payment=o.payment_method||o.payment_label||'';if(payment)lines.push('PAGAMENTO: '+payment);
    return lines.join('\n')
  }
  function openNativeWhatsapp(phone,message){
    const url='whatsapp://send?phone='+encodeURIComponent(phone)+'&text='+encodeURIComponent(message);
    window.location.href=url;
  }
  function openCurrentOrderCompanyWhatsapp(){
    openNativeWhatsapp(COMPANY_WHATSAPP_E164,currentOrderCompanyWhatsappMessage())
  }
  function currentOrderCustomerWhatsappMessage(){
    const d=state.currentOrder||{},o=d.order||{},items=Array.isArray(d.items)?d.items:[],code=o.order_number||o.id||'';
    const lines=['Ola! Segue o seu pedido da Dona Antonia'+(code?' '+code:'')+'.'];
    if(items.length){lines.push('','PRODUTOS');appendCurrentOrderWhatsappItems(lines,items)}
    const total=Number(o.total||o.total_amount||0);if(Number.isFinite(total)&&total>0)lines.push('','Total: '+total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
    return lines.join('\n')
  }
  function openCurrentOrderCustomerWhatsapp(){
    const o=state.currentOrder?.order||{},phone=phoneDigits(o.phone_e164||o.whatsapp_phone_e164||o.delivery_address_snapshot?.phone||o.delivery_address?.phone||'');
    if(!phone){toast('Pedido sem WhatsApp do cliente');return}
    openNativeWhatsapp(phone,currentOrderCustomerWhatsappMessage())
  }
'''

admin = admin[:start] + replacement + admin[end:]
admin_path.write_text(admin, encoding='utf-8')

transport_path = Path('supabase/functions/admin-orders-v1/index.ts')
transport = transport_path.read_text(encoding='utf-8')
helper_anchor = '\nDeno.serve(async(req:Request)=>{'
if helper_anchor not in transport:
    raise SystemExit('admin-orders helper anchor not found')
helper = r'''
function providerFailureIsTransient(status:number,detail:unknown){
  const message=text(detail,400).toLowerCase();
  return status===429||status===502||status===503||status===504||(status===500&&/(timeout|timed out|connect|connection|temporar|upstream)/.test(message));
}
'''
transport = transport.replace(helper_anchor, helper + helper_anchor, 1)

block_start = transport.index('  try{\n    const audit=await db.from("ops2_whatsapp_outbox_v1")')
block_end = transport.index('\n  }\n});', block_start) + len('\n  }')
new_block = r'''  try{
    const audit=await db.from("ops2_whatsapp_outbox_v1")
      .update({payload:{...obj(item.payload),provider_request:providerPayload}})
      .eq("id",outboxId).eq("status","sending");
    if(audit.error)throw new Error(`provider_payload_audit_failed: ${text(audit.error.message,240)}`);

    const providerAttempts=scope==="checkout_auto"?2:1;
    for(let providerAttempt=1;providerAttempt<=providerAttempts;providerAttempt++){
      const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(providerPayload)});
      const data=await response.json().catch(()=>({}));
      if(response.ok){
        const externalId=text(data?.external_message_id||data?.message_id||data?.id||"",200)||null;
        await finish(outboxId,"sent",externalId,null);
        void enqueuePapoAiOrderSignals(orderId,channel,item.phone_e164,details);
        return respond({ok:true,status:"sent",outbox_id:outboxId,recipient_kind:item.recipient_kind,channel_origin:channel,dispatch_scope:scope,external_message_id:externalId});
      }

      const providerDetail=data?.error||data?.message||response.statusText;
      const transient=providerFailureIsTransient(response.status,providerDetail);
      if(scope==="checkout_auto"&&transient&&providerAttempt<providerAttempts){
        await new Promise(resolve=>setTimeout(resolve,750));
        continue;
      }

      const retryable=(scope==="checkout_auto"&&transient)||response.status===429;
      const state=retryable&&Number(item.attempt_count||0)<5?"retry":"failed";
      const errorText=`provider_http_${response.status}: ${text(providerDetail,300)}`;
      await finish(outboxId,state,null,errorText,retryable?(response.status===429?300:30):0);
      return respond({ok:false,error:"provider_rejected",status:state,outbox_id:outboxId,recipient_kind:item.recipient_kind,dispatch_scope:scope},retryable?503:502);
    }
    throw new Error("provider_attempt_loop_exhausted");
  }catch(error){
    const errorText=`provider_ambiguous_failure: ${text((error as Error)?.message||error,300)}`;
    const state=scope==="checkout_auto"&&Number(item.attempt_count||0)<5?"retry":"failed";
    try{await finish(outboxId,state,null,errorText,state==="retry"?30:0)}catch(finishError){
      return respond({ok:false,error:"provider_failure_and_finish_failed",outbox_id:outboxId,detail:text((finishError as Error)?.message||finishError)},500);
    }
    return respond({ok:false,error:"provider_unreachable",status:state,outbox_id:outboxId,recipient_kind:item.recipient_kind,dispatch_scope:scope},503);
  }'''
transport = transport[:block_start] + new_block + transport[block_end:]
transport_path.write_text(transport, encoding='utf-8')

print('patched admin native WhatsApp + basket expansion + checkout transient retry')
