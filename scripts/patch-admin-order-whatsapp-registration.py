from pathlib import Path


def replace_once(path, old, new, label):
    p=Path(path)
    s=p.read_text()
    count=s.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    p.write_text(s.replace(old,new,1))

path='supabase/functions/admin-products-live-v1/index.ts'
s=Path(path).read_text()
s=s.replace('/functions/v1/whatsapp-order-outbound-v1','/functions/v1/admin-orders-v1')

anchor='async function orderWhatsappRegistrationStatus(rawId:any){'
helper='''async function orderWhatsappGatewayReadiness(){
  try{
    const res=await fetch(U+"/functions/v1/admin-orders-v1",{
      method:"GET",headers:{"apikey":K,"x-internal-key":K},signal:AbortSignal.timeout(8000)
    });
    const data=await res.json().catch(()=>({ok:false,error:"invalid_gateway_response"}));
    return {ready:res.ok&&data?.ready===true,providers:data?.providers||{},error:res.ok?null:(data?.error||"gateway_unavailable")};
  }catch(e){return {ready:false,providers:{},error:"gateway_unreachable"}}
}
'''
if helper.strip() not in s:
    if s.count(anchor)!=1: raise SystemExit('gateway readiness anchor missing')
    s=s.replace(anchor,helper+anchor,1)

old='''  const [wq,lq]=await Promise.all([
    db.from("ops2_whatsapp_outbox_v1").select("recipient_kind,status,attempt_count,sent_at,last_error,channel_origin,phone_e164,updated_at").eq("order_id",oid).eq("message_kind","order_received").order("created_at",{ascending:false}),
    db.from("ops2_order_registration_links_v1").select("id,phone_e164,expires_at,consumed_at,consumed_customer_id,revoked_at,created_at").eq("order_id",oid).order("created_at",{ascending:false}).limit(1)
  ]);'''
new='''  const [wq,lq,gateway]=await Promise.all([
    db.from("ops2_whatsapp_outbox_v1").select("recipient_kind,status,attempt_count,sent_at,last_error,channel_origin,phone_e164,updated_at").eq("order_id",oid).eq("message_kind","order_received").order("created_at",{ascending:false}),
    db.from("ops2_order_registration_links_v1").select("id,phone_e164,expires_at,consumed_at,consumed_customer_id,revoked_at,created_at").eq("order_id",oid).order("created_at",{ascending:false}).limit(1),
    orderWhatsappGatewayReadiness()
  ]);'''
if old in s:s=s.replace(old,new,1)
elif new not in s: raise SystemExit('status Promise.all anchor missing')

old='return {order_id:oid,phone_e164:phone,registration_complete:registrationComplete,whatsapp,registration_link:link?{...link,state:linkState}:null};'
new='return {order_id:oid,phone_e164:phone,registration_complete:registrationComplete,whatsapp_ready:gateway.ready===true,whatsapp_provider:gateway,whatsapp,registration_link:link?{...link,state:linkState}:null};'
if old in s:s=s.replace(old,new,1)
elif new not in s: raise SystemExit('status return anchor missing')

old='''async function orderWhatsappSend(p:any){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const q=await db.rpc("ops2_enqueue_admin_order_whatsapp_v1",{p_order_id:oid});'''
new='''async function orderWhatsappSend(p:any){
  const oid=id(p?.id);if(!oid)return {error:"invalid_order",status:400};
  const gateway=await orderWhatsappGatewayReadiness();
  if(gateway.ready!==true)return {error:"order_whatsapp_provider_not_configured",status:409,provider:gateway};
  const q=await db.rpc("ops2_enqueue_admin_order_whatsapp_v1",{p_order_id:oid});'''
if old in s:s=s.replace(old,new,1)
elif new not in s: raise SystemExit('order send readiness anchor missing')
Path(path).write_text(s)

path='vitrine/admin/index.html'
s=Path(path).read_text()
old='''        '<button class="primary" id="sendOrderWhatsApp" type="button" '+(phone?'':'disabled')+'>Enviar pedido no WhatsApp</button>'+'''
new='''        '<button class="primary" id="sendOrderWhatsApp" type="button" disabled>Enviar pedido no WhatsApp</button>'+'''
if old in s:s=s.replace(old,new,1)
elif new not in s: raise SystemExit('initial send disabled anchor missing')

old='''        '<button class="secondary" id="issueOrderRegistrationLink" type="button" '+(phone||registered?'':'disabled')+'>'+(registered?'Cadastro concluído':'Gerar link de cadastro')+'</button>'+'''
new='''        '<button class="secondary" id="issueOrderRegistrationLink" type="button" '+(phone&&!registered?'':'disabled')+'>'+(registered?'Cadastro concluído':'Gerar link de cadastro')+'</button>'+'''
if old in s:s=s.replace(old,new,1)
elif new not in s: raise SystemExit('registration disabled anchor missing')

old="""    const customer=data?.whatsapp?.customer,ops=data?.whatsapp?.ops_0975,link=data?.registration_link;
    const lines=[];
    lines.push(data?.registration_complete?'Cadastro concluído':'Cadastro pendente');"""
new="""    const customer=data?.whatsapp?.customer,ops=data?.whatsapp?.ops_0975,link=data?.registration_link,sendBtn=$('#sendOrderWhatsApp');
    const lines=[];
    lines.push(data?.registration_complete?'Cadastro concluído':'Cadastro pendente');
    if(sendBtn)sendBtn.disabled=!(data?.phone_e164&&data?.whatsapp_ready===true);
    if(data?.whatsapp_ready!==true)lines.push('Envio do pedido aguardando configuração PapoAI');"""
if old in s:s=s.replace(old,new,1)
elif new not in s: raise SystemExit('UI readiness status anchor missing')

registration_guard="const registrationBtn=$('#issueOrderRegistrationLink');"
if registration_guard not in s:
    old="""    if(link?.state==='active')lines.push('Link de cadastro ativo');
    if(link?.state==='consumed')lines.push('Link de cadastro concluído');
    if(link?.state==='expired')lines.push('Último link expirou');
    host.textContent=lines.join(' · ');"""
    new="""    const registrationBtn=$('#issueOrderRegistrationLink');
    if(registrationBtn){
      const activeLink=link?.state==='active';
      registrationBtn.disabled=data?.registration_complete===true||activeLink||!data?.phone_e164;
      registrationBtn.textContent=data?.registration_complete===true?'Cadastro concluído':activeLink?'Link de cadastro ativo':'Gerar link de cadastro';
    }
    if(link?.state==='active')lines.push('Link de cadastro ativo');
    if(link?.state==='consumed')lines.push('Link de cadastro concluído');
    if(link?.state==='expired')lines.push('Último link expirou');
    host.textContent=lines.join(' · ');"""
    if s.count(old)!=1: raise SystemExit('active registration link guard anchor missing')
    s=s.replace(old,new,1)
Path(path).write_text(s)

print('provider readiness and registration-link safety patch applied')
