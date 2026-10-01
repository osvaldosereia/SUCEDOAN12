from pathlib import Path


def replace_once(path, old, new, label):
    p=Path(path)
    s=p.read_text()
    count=s.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    p.write_text(s.replace(old,new,1))

# admin-products-live-v1: expose authenticated actions.
path='supabase/functions/admin-products-live-v1/index.ts'
s=Path(path).read_text()
s=s.replace('"manual_order_create","ops_papoai_capture_status","papoai_issue_catalog_link","ops_timeline"',
            '"manual_order_create","order_whatsapp_send","order_registration_link_issue","order_registration_link_status","ops_papoai_capture_status","papoai_issue_catalog_link","ops_timeline"',1)
s=s.replace('"ops_delivery_plan","manual_order_create","papoai_issue_catalog_link","order_payment_capture"',
            '"ops_delivery_plan","manual_order_create","order_whatsapp_send","order_registration_link_issue","papoai_issue_catalog_link","order_payment_capture"',1)
if 'order_registration_link_status' not in s or 'order_whatsapp_send' not in s:
    raise SystemExit('admin action sets patch failed')

helper='''\nasync function orderWhatsappRegistrationStatus(rawId:any){
  const oid=id(rawId);if(!oid)return {error:"invalid_order",status:400};
  const oq=await db.from("orders").select("id,customer_id,phone_e164,conversation_id").eq("id",oid).maybeSingle();
  if(oq.error)throw oq.error;if(!oq.data?.id)return {error:"order_not_found",status:404};
  let phone=tx(oq.data.phone_e164,40),registrationComplete=false;
  if(oq.data.customer_id){
    const cq=await db.from("ops2_admin_customer_registration_v1").select("primary_whatsapp_e164,registration_complete").eq("customer_id",oq.data.customer_id).maybeSingle();
    if(cq.error)throw cq.error;phone=phone||tx(cq.data?.primary_whatsapp_e164,40);registrationComplete=cq.data?.registration_complete===true;
  }
  const [wq,lq]=await Promise.all([
    db.from("ops2_whatsapp_outbox_v1").select("recipient_kind,status,attempt_count,sent_at,last_error,channel_origin,phone_e164,updated_at").eq("order_id",oid).eq("message_kind","order_received").order("created_at",{ascending:false}),
    db.from("ops2_order_registration_links_v1").select("id,phone_e164,expires_at,consumed_at,consumed_customer_id,revoked_at,created_at").eq("order_id",oid).order("created_at",{ascending:false}).limit(1)
  ]);
  if(wq.error)throw wq.error;if(lq.error)throw lq.error;
  const whatsapp:any={};for(const row of wq.data||[])if(!whatsapp[row.recipient_kind])whatsapp[row.recipient_kind]=row;
  const link:any=(lq.data||[])[0]||null;
  let linkState="none";
  if(link){
    if(link.consumed_at)linkState="consumed";
    else if(link.revoked_at)linkState="revoked";
    else if(Date.parse(link.expires_at)<=Date.now())linkState="expired";
    else linkState="active";
  }
  return {order_id:oid,phone_e164:phone,registration_complete:registrationComplete,whatsapp,registration_link:link?{...link,state:linkState}:null};
}
async function dispatchOrderWhatsapp(oid:string){
  const deliveries:any[]=[];
  for(let i=0;i<2;i++){
    try{
      const res=await fetch(U+"/functions/v1/whatsapp-order-outbound-v1",{
        method:"POST",headers:{"Content-Type":"application/json","apikey":K,"x-internal-key":K},
        body:JSON.stringify({order_id:oid}),signal:AbortSignal.timeout(20000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"invalid_gateway_response"}));
      deliveries.push({...data,http_status:res.status});
    }catch(e){deliveries.push({ok:false,error:"gateway_unreachable",detail:tx((e as Error)?.message||e,180)})}
  }
  return deliveries;
}
async function orderWhatsappSend(p:any){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const q=await db.rpc("ops2_enqueue_admin_order_whatsapp_v1",{p_order_id:oid});
  if(q.error)throw q.error;if(q.data?.ok!==true)return {error:q.data?.error||"whatsapp_enqueue_failed",status:409};
  const deliveries=await dispatchOrderWhatsapp(oid),current:any=await orderWhatsappRegistrationStatus(oid);
  const relevant=deliveries.filter(x=>x?.status!=="idle");
  return {queued:q.data,deliveries,delivery_ok:relevant.length>0&&relevant.every(x=>x?.ok===true),status_snapshot:current};
}
async function orderRegistrationLinkIssue(p:any,adminAuthorization:string){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const q=await db.rpc("ops2_issue_order_registration_link_v1",{p_order_id:oid});
  if(q.error)throw q.error;if(q.data?.ok!==true)return {error:q.data?.error||"registration_link_failed",status:409};
  const link=q.data||{};
  const order=await db.from("orders").select("id,conversation_id,phone_e164").eq("id",oid).maybeSingle();
  if(order.error)throw order.error;
  let conversationId=order.data?.conversation_id||null;
  const targetDigits=dg(link.phone_e164||order.data?.phone_e164,20);
  if(!conversationId&&targetDigits){
    const conv=await db.from("conversations").select("id,wa_contact_e164,updated_at").not("whatsapp_account_id","is",null).order("updated_at",{ascending:false}).limit(120);
    if(conv.error)throw conv.error;
    const match=(conv.data||[]).find((x:any)=>dg(x.wa_contact_e164,20)===targetDigits);conversationId=match?.id||null;
  }
  let papoaiSend:any={ok:false,error:"conversation_not_found"};
  if(conversationId&&adminAuthorization){
    try{
      const text="Olá! Para concluir seu cadastro da Dona Antônia e vincular ao seu pedido, acesse: "+String(link.registration_url||"");
      const res=await fetch(U+"/functions/v1/admin-whatsapp-ops-v1?action=send_text",{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":adminAuthorization,"apikey":K},
        body:JSON.stringify({conversation_id:conversationId,text,idempotency_key:"order-registration:"+oid+":"+String(link.link_id||"")}),
        signal:AbortSignal.timeout(20000)
      });
      const data=await res.json().catch(()=>({ok:false,error:"invalid_papoai_response"}));
      papoaiSend={...data,http_status:res.status,ok:res.ok&&data?.ok!==false&&data?.dispatch?.ok!==false};
    }catch(e){papoaiSend={ok:false,error:"papoai_unreachable",detail:tx((e as Error)?.message||e,180)}}
  }
  return {link_id:link.link_id,registration_url:link.registration_url,expires_at:link.expires_at,phone_e164:link.phone_e164,conversation_id:conversationId,papoai_send:papoaiSend};
}
'''
anchor='\nasync function adminAuth(r:Request){'
if anchor not in s: raise SystemExit('admin helper anchor missing')
s=s.replace(anchor,helper+anchor,1)

old='if(r.method==="GET"&&a==="orders")return js(r,{ok:true,orders:await ordersList()});if(r.method==="GET"&&a==="order"){const x:any=await orderDetailCanonical(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_stock_shortages")'
new='if(r.method==="GET"&&a==="orders")return js(r,{ok:true,orders:await ordersList()});if(r.method==="GET"&&a==="order"){const x:any=await orderDetailCanonical(u.searchParams.get("id"));return x.error?js(r,{ok:false,error:x.error},x.status):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_registration_link_status"){const x:any=await orderWhatsappRegistrationStatus(u.searchParams.get("id"));return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="GET"&&a==="order_stock_shortages")'
if old not in s: raise SystemExit('admin GET order anchor missing')
s=s.replace(old,new,1)

old='if(r.method==="POST"&&a==="papoai_issue_catalog_link"){const x:any=await opsPapoAiIssueCatalogLink(p,auth);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}'
new='if(r.method==="POST"&&a==="order_whatsapp_send"){const x:any=await orderWhatsappSend(p);return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}if(r.method==="POST"&&a==="order_registration_link_issue"){const x:any=await orderRegistrationLinkIssue(p,r.headers.get("Authorization")||"");return x.error?js(r,{ok:false,...x},x.status||400):js(r,{ok:true,...x})}'+old
if old not in s: raise SystemExit('admin POST anchor missing')
s=s.replace(old,new,1)
Path(path).write_text(s)

# storefront-v2: resolve and consume order_token without making registration contingent on the link.
path='supabase/functions/storefront-v2/index.ts'
s=Path(path).read_text()
old='  const customer=await loadCustomerForCheckout(r.data.customer_id);return {ok:true,registration_complete:true,customer,bling_job_id:r.data.bling_job_id||null};'
new='''  const customer=await loadCustomerForCheckout(r.data.customer_id);
  let order_link:any=null;const orderToken=txt(p?.order_token,200);
  if(orderToken){
    const linked=await db.rpc("ops2_consume_order_registration_link_v1",{p_token:orderToken,p_customer_id:r.data.customer_id,p_phone:ph});
    order_link=linked.error?{ok:false,error:"order_link_unavailable"}:(linked.data||{ok:false,error:"order_link_failed"});
  }
  return {ok:true,registration_complete:true,customer,bling_job_id:r.data.bling_job_id||null,order_link};'''
if old not in s: raise SystemExit('storefront registration return anchor missing')
s=s.replace(old,new,1)
old='    if(req.method==="GET"&&action==="resolve_identity_token"){const r=await resolveToken(u.searchParams.get("token"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}\n    if(req.method==="GET"&&action==="delivery_options")'
new='''    if(req.method==="GET"&&action==="resolve_identity_token"){const r=await resolveToken(u.searchParams.get("token"));return r.error?json(req,{ok:false,...r},r.status||400,{"Cache-Control":"no-store"}):json(req,{ok:true,...r},200,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="resolve_order_token"){const token=txt(u.searchParams.get("order_token"),200),r=await db.rpc("ops2_resolve_order_registration_link_v1",{p_token:token});if(r.error)return json(req,{ok:false,error:"order_link_unavailable"},503,{"Cache-Control":"no-store"});const data=r.data||{};return data.ok===true?json(req,{ok:true,...data},200,{"Cache-Control":"no-store"}):json(req,{ok:false,...data},["token_expired","token_already_used"].includes(data.error)?410:400,{"Cache-Control":"no-store"})}
    if(req.method==="GET"&&action==="delivery_options")'''
if old not in s: raise SystemExit('storefront resolve token anchor missing')
s=s.replace(old,new,1)
Path(path).write_text(s)

# cadastro page: resolve the order capability first and submit it back unchanged.
path='cadastro/index.html'
s=Path(path).read_text()
old="  const $=s=>document.querySelector(s),status=$('#status'),form=$('#form'),success=$('#success'),save=$('#save');"
new=old+"\n  let savedOrderToken='';"
if old not in s: raise SystemExit('registration vars anchor missing')
s=s.replace(old,new,1)
old="  async function resolveIdentity(){const q=new URLSearchParams(location.search);try{let d=null;if(q.get('token'))d=await api('resolve_identity_token',{token:q.get('token')});else if(q.get('code'))d=await api('resolve_identity_code',{code:q.get('code')});if(d?.phone_e164){$('#phone').value=d.phone_e164;$('#phone').readOnly=true;await lookup(d.phone_e164);return true}}catch{}return false}"
new="""  async function resolveOrderToken(){const q=new URLSearchParams(location.search),order_token=q.get('order_token')||'';if(!order_token)return false;try{const d=await api('resolve_order_token',{order_token});if(d?.phone_e164){savedOrderToken=order_token;$('#phone').value=d.phone_e164;$('#phone').readOnly=true;await lookup(d.phone_e164);setStatus('Este cadastro será vinculado automaticamente ao seu pedido. Confira e complete seus dados.','ok');return true}}catch(err){savedOrderToken='';setStatus('Este link de cadastro expirou ou já foi usado. Peça um novo link à Dona Antônia.','err');save.disabled=true}return true}
  async function resolveIdentity(){const q=new URLSearchParams(location.search);try{let d=null;if(q.get('token'))d=await api('resolve_identity_token',{token:q.get('token')});else if(q.get('code'))d=await api('resolve_identity_code',{code:q.get('code')});if(d?.phone_e164){$('#phone').value=d.phone_e164;$('#phone').readOnly=true;await lookup(d.phone_e164);return true}}catch{}return false}"""
if old not in s: raise SystemExit('registration resolve identity anchor missing')
s=s.replace(old,new,1)
old="payload={phone:ph,name:$('#name').value.trim(),document:$('#document').value,street:$('#street').value.trim(),number:$('#number').value.trim(),neighborhood:$('#neighborhood').value.trim(),city:$('#city').value,postal_code:$('#postal').value,complement:$('#complement').value.trim(),reference:$('#reference').value.trim(),marketing_opt_in:$('#marketing').checked}"
new="payload={phone:ph,name:$('#name').value.trim(),document:$('#document').value,street:$('#street').value.trim(),number:$('#number').value.trim(),neighborhood:$('#neighborhood').value.trim(),city:$('#city').value,postal_code:$('#postal').value,complement:$('#complement').value.trim(),reference:$('#reference').value.trim(),marketing_opt_in:$('#marketing').checked,order_token:savedOrderToken}"
if old not in s: raise SystemExit('registration payload anchor missing')
s=s.replace(old,new,1)
old="form.classList.add('hidden');status.classList.add('hidden');success.classList.remove('hidden');await prepareCatalogReturn(saved)"
new="form.classList.add('hidden');status.classList.add('hidden');success.classList.remove('hidden');if(savedOrderToken){if(saved?.order_link?.ok===true)setReturnStatus('Cadastro concluído e vinculado ao seu pedido. Nossa equipe já consegue continuar o atendimento.','ok');else setReturnStatus('Seu cadastro foi salvo, mas não consegui vinculá-lo automaticamente ao pedido. Avise nossa equipe pelo WhatsApp.','err')}else await prepareCatalogReturn(saved)"
if old not in s: raise SystemExit('registration success anchor missing')
s=s.replace(old,new,1)
old="  resolveIdentity().then(ok=>{if(!ok){const q=new URLSearchParams(location.search),p=q.get('phone');if(p){$('#phone').value=p;lookup(p)}}});"
new="  resolveOrderToken().then(async handled=>{if(handled)return;const ok=await resolveIdentity();if(!ok){const q=new URLSearchParams(location.search),p=q.get('phone');if(p){$('#phone').value=p;lookup(p)}}});"
if old not in s: raise SystemExit('registration startup anchor missing')
s=s.replace(old,new,1)
Path(path).write_text(s)

# Admin UI: add order-level WhatsApp and registration actions.
path='vitrine/admin/index.html'
s=Path(path).read_text()
helper='''\n  function orderWhatsappRegistrationHtml(o){
    const phone=o?.whatsapp_phone_e164||o?.delivery_address_snapshot?.phone||'';
    const registered=o?.registration_complete===true;
    return '<div class="section-title">WhatsApp e cadastro</div><div class="rule-notice" id="orderWhatsappRegistrationPanel">'+
      '<strong>'+esc(phone?formatPhone(phone):'Pedido sem WhatsApp')+'</strong><div id="orderWhatsappRegistrationStatus" class="sub">'+(registered?'Cadastro concluído':'Cadastro pendente')+'</div>'+
      '<div class="print-actions" style="margin-top:10px">'+
        '<button class="primary" id="sendOrderWhatsApp" type="button" '+(phone?'':'disabled')+'>Enviar pedido no WhatsApp</button>'+
        '<button class="secondary" id="issueOrderRegistrationLink" type="button" '+(phone||registered?'':'disabled')+'>'+(registered?'Cadastro concluído':'Gerar link de cadastro')+'</button>'+
      '</div><div id="orderRegistrationLinkActions" class="hidden" style="margin-top:10px"><div class="sub" id="orderRegistrationLinkValue"></div><div class="print-actions" style="margin-top:8px"><button class="secondary" id="openOrderRegistrationWhatsApp" type="button">Abrir WhatsApp com link</button><button class="secondary" id="copyOrderRegistrationLink" type="button">Copiar link</button></div></div></div>';
  }
  function renderCurrentOrderWhatsappStatus(data){
    const host=$('#orderWhatsappRegistrationStatus');if(!host)return;
    const customer=data?.whatsapp?.customer,ops=data?.whatsapp?.ops_0975,link=data?.registration_link;
    const lines=[];
    lines.push(data?.registration_complete?'Cadastro concluído':'Cadastro pendente');
    if(customer?.status)lines.push('Cliente: '+(customer.status==='sent'?'pedido enviado':customer.status));
    if(ops?.status)lines.push('Cópia 0975: '+(ops.status==='sent'?'enviada':ops.status));
    if(link?.state==='active')lines.push('Link de cadastro ativo');
    if(link?.state==='consumed')lines.push('Link de cadastro concluído');
    if(link?.state==='expired')lines.push('Último link expirou');
    host.textContent=lines.join(' · ');
  }
  async function refreshCurrentOrderWhatsappRegistration(){
    const oid=state.currentOrder?.order?.id;if(!oid)return;
    try{const data=await api('order_registration_link_status',{id:oid});renderCurrentOrderWhatsappStatus(data)}catch{}
  }
  async function sendCurrentOrderWhatsapp(){
    const oid=state.currentOrder?.order?.id,btn=$('#sendOrderWhatsApp');if(!oid||!btn)return;
    btn.disabled=true;btn.textContent='Enviando…';
    try{const data=await api('order_whatsapp_send',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:oid})});renderCurrentOrderWhatsappStatus(data.status_snapshot||{});toast(data.delivery_ok?'Pedido enviado ao cliente e cópia 0975 registrada':'Envio preparado; revise o status do WhatsApp')}catch(e){toast(errorMessage(e.message))}
    finally{if(document.contains(btn)){btn.disabled=false;btn.textContent='Enviar pedido no WhatsApp'}await refreshCurrentOrderWhatsappRegistration()}
  }
  function showCurrentOrderRegistrationLink(data){
    const box=$('#orderRegistrationLinkActions'),value=$('#orderRegistrationLinkValue');if(!box||!value||!data?.registration_url)return;
    box.dataset.url=data.registration_url;box.classList.remove('hidden');
    const sent=data?.papoai_send?.ok===true;
    value.textContent=sent?'Link enviado pelo PapoAI. Também deixei as opções abaixo disponíveis.':'Link criado. Se a janela do PapoAI estiver fechada, use uma das opções abaixo.';
  }
  async function issueCurrentOrderRegistrationLink(){
    const oid=state.currentOrder?.order?.id,btn=$('#issueOrderRegistrationLink');if(!oid||!btn||state.currentOrder?.order?.registration_complete===true)return;
    btn.disabled=true;btn.textContent='Criando…';
    try{const data=await api('order_registration_link_issue',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:oid})});showCurrentOrderRegistrationLink(data);toast(data?.papoai_send?.ok===true?'Link de cadastro enviado pelo PapoAI':'Link criado; envio automático indisponível nesta conversa');await refreshCurrentOrderWhatsappRegistration()}catch(e){toast(errorMessage(e.message))}
    finally{if(document.contains(btn)){btn.disabled=false;btn.textContent='Gerar link de cadastro'}}
  }
  function currentOrderRegistrationUrl(){return $('#orderRegistrationLinkActions')?.dataset?.url||''}
  function openCurrentOrderRegistrationWhatsapp(){
    const url=currentOrderRegistrationUrl(),o=state.currentOrder?.order||{},phone=phoneDigits(o.whatsapp_phone_e164||o.delivery_address_snapshot?.phone||'');if(!url||!phone)return;
    const text='Olá! Para concluir seu cadastro da Dona Antônia e vincular ao seu pedido, acesse: '+url;
    window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(text),'_blank','noopener');
  }
  async function copyCurrentOrderRegistrationLink(){const url=currentOrderRegistrationUrl();if(!url)return;try{await navigator.clipboard.writeText(url);toast('Link de cadastro copiado')}catch{prompt('Copie o link de cadastro:',url)}}
'''
anchor='\n  async function openOrder(id){'
if anchor not in s: raise SystemExit('admin UI openOrder anchor missing')
s=s.replace(anchor,helper+anchor,1)
old="      '<div class=\"order-summary\"><div class=\"summary-box\"><small>Total</small><strong>'+money(o.total_cents)+'</strong></div><div class=\"summary-box\"><small>Data</small><strong>'+esc(dateTime(o.created_at))+'</strong></div><div class=\"summary-box\"><small>Itens</small><strong>'+esc(String(d.items?.length||0))+'</strong></div></div>'+\n      '<div class=\"form-grid\">'+"
new="      '<div class=\"order-summary\"><div class=\"summary-box\"><small>Total</small><strong>'+money(o.total_cents)+'</strong></div><div class=\"summary-box\"><small>Data</small><strong>'+esc(dateTime(o.created_at))+'</strong></div><div class=\"summary-box\"><small>Itens</small><strong>'+esc(String(d.items?.length||0))+'</strong></div></div>'+\n      orderWhatsappRegistrationHtml(o)+\n      '<div class=\"form-grid\">'+"
if old not in s: raise SystemExit('admin UI summary anchor missing')
s=s.replace(old,new,1)
old="    $('#saveOrder').onclick=saveOrder;\n    if($('#orderCustomerSearch'))"
new="    $('#saveOrder').onclick=saveOrder;\n    if($('#sendOrderWhatsApp'))$('#sendOrderWhatsApp').onclick=sendCurrentOrderWhatsapp;\n    if($('#issueOrderRegistrationLink'))$('#issueOrderRegistrationLink').onclick=issueCurrentOrderRegistrationLink;\n    if($('#openOrderRegistrationWhatsApp'))$('#openOrderRegistrationWhatsApp').onclick=openCurrentOrderRegistrationWhatsapp;\n    if($('#copyOrderRegistrationLink'))$('#copyOrderRegistrationLink').onclick=copyCurrentOrderRegistrationLink;\n    refreshCurrentOrderWhatsappRegistration();\n    if($('#orderCustomerSearch'))"
if old not in s: raise SystemExit('admin UI handlers anchor missing')
s=s.replace(old,new,1)
Path(path).write_text(s)

print('admin order whatsapp registration patch applied')
