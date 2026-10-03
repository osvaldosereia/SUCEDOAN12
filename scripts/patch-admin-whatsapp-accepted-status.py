from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')

old='''  function renderCurrentOrderWhatsappStatus(data){
    const host=$(\'#orderWhatsappRegistrationStatus\');if(!host)return;
    const customer=data?.whatsapp?.customer,ops=data?.whatsapp?.ops_0975,link=data?.registration_link;
    const lines=[];
    lines.push(data?.registration_complete?'Cadastro concluído':'Cadastro pendente');
    if(data?.whatsapp_ready!==true)lines.push('Envio do pedido aguardando configuração PapoAI');
    if(customer?.status)lines.push('Cliente: '+(customer.status==='sent'?'pedido enviado':customer.status));
    if(ops?.status)lines.push('Empresa 0975: '+(ops.status==='sent'?'enviada':ops.status));
'''
new='''  function customerWhatsappAcceptedIsStale(customer){
    if(customer?.status!=='accepted')return false;
    const updatedAt=Date.parse(customer.updated_at||'');
    return Number.isFinite(updatedAt)&&Date.now()-updatedAt>15*60*1000;
  }
  function customerWhatsappDeliveryLabel(customer){
    const status=String(customer?.status||'').toLowerCase();
    if(status==='sent')return 'Enviado confirmado pelo WhatsApp';
    if(status==='accepted')return customerWhatsappAcceptedIsStale(customer)?'Sem confirmação da Meta há mais de 15 min · revisar no PapoAI':'PapoAI aceitou · aguardando confirmação da Meta';
    if(status==='failed')return 'Falha no envio'+(customer?.last_error?': '+customer.last_error:'');
    if(status==='retry')return 'Falha temporária · nova tentativa pendente';
    if(status==='pending'||status==='sending')return 'Aguardando envio';
    if(status==='suppressed')return 'Envio não realizado';
    return status||'Sem status de envio';
  }
  function renderCurrentOrderWhatsappStatus(data){
    const host=$(\'#orderWhatsappRegistrationStatus\');if(!host)return;
    const customer=data?.whatsapp?.customer,link=data?.registration_link;
    const lines=[];
    lines.push(data?.registration_complete?'Cadastro concluído':'Cadastro pendente');
    if(data?.whatsapp_ready!==true)lines.push('Envio do pedido aguardando configuração PapoAI');
    if(customer?.status)lines.push('Cliente: '+customerWhatsappDeliveryLabel(customer));
    lines.push('Empresa: envio manual pelo WhatsApp (não rastreado pelo PapoAI)');
    const staleAccepted=customerWhatsappAcceptedIsStale(customer);
    host.style.color=staleAccepted?'var(--danger)':'';
    host.style.fontWeight=staleAccepted?'800':'';
'''
if old not in s:
    raise SystemExit('renderCurrentOrderWhatsappStatus anchor not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('patched admin WhatsApp accepted/sent display')
