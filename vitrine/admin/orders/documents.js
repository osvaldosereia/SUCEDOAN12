// Printing content and official DANFE download have no editor or navigation state.
(function(global){
  function create({api,ui,formatters,separationModel,openPrint}){
    const {window,toast}=ui;
    const {esc,fmtQty,dateTime,orderDisplayCode,formatPhone,formatCpf,money,errorMessage}=formatters;
  async function openDanfeForOrder(id,orderCode=''){
    if(!id)return;
    const w=window.open('','_blank','width=900,height=900');
    if(!w){toast('Libere pop-ups para abrir o DANFE');return}
    try{
      w.document.open();
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>DANFE</title></head><body style="font:16px system-ui;padding:30px;text-align:center"><strong>Carregando DANFE…</strong><p>Buscando o PDF oficial no Bling.</p></body></html>');
      w.document.close();
      const data=await api('order_fiscal_document_pdf',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      const raw=atob(String(data.base64||''));
      if(!raw)throw new Error('fiscal_document_empty');
      const bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      const blob=new Blob([bytes],{type:'application/pdf'});
      const url=URL.createObjectURL(blob);
      w.location.replace(url);
      setTimeout(()=>URL.revokeObjectURL(url),120000);
      toast('DANFE '+(data.invoice_number?data.invoice_number+' ':orderCode?'#'+orderCode+' ':'')+'aberto para impressão');
    }catch(e){
      try{w.close()}catch{}
      toast(errorMessage(e?.message||'fiscal_document_download_failed'));
    }
  }
  const {separationItems,separationKitRefs}=separationModel;
  function separationTicketBody(detail){
    const o=detail.order,items=separationItems(detail),kitRefs=separationKitRefs(detail),groups=[];
    for(const item of items){
      const key=item.gondola_number??'none';
      let group=groups.find(g=>g.key===key);
      if(!group){group={key,label:item.gondola_number?'GÔNDOLA '+item.gondola_number:'SEM GÔNDOLA',shelves:[]};groups.push(group)}
      const shelfKey=item.shelf_label||'none';
      let shelf=group.shelves.find(s=>s.key===shelfKey);
      if(!shelf){shelf={key:shelfKey,label:item.shelf_label?'PRATELEIRA '+item.shelf_label:'SEM PRATELEIRA',items:[]};group.shelves.push(shelf)}
      shelf.items.push(item);
    }
    const kitBlock=kitRefs.length?'<div class="block"><b>PEGAR PRONTO</b>'+kitRefs.map(x=>'<div style="border:2px solid #000;padding:1.5mm;margin:1mm 0;font-size:13px;font-weight:900">'+esc(fmtQty(x.quantity))+'× '+esc(x.label)+' · '+esc(x.code)+(x.basket?'<div style="font-size:8px;font-weight:600;margin-top:.5mm">'+esc(x.basket)+'</div>':'')+'</div>').join('')+'</div>':'';
    const sections=groups.map(g=>'<div class="gondola-title">'+esc(g.label)+'</div>'+g.shelves.map(s=>'<div class="shelf-title-print">'+esc(s.label)+'</div><div class="sep-grid">'+s.items.map(i=>'<div class="sep-card"><img src="'+esc(i.image_url||'/img/logoantonia5.png')+'" alt=""><div class="sep-name">'+esc(i.name)+'</div>'+(i.gtin?'<div class="sep-ean">EAN '+esc(i.gtin)+'</div>':'<div class="sep-ean missing">SEM EAN</div>')+'<div class="sep-qty">'+esc(fmtQty(i.quantity))+'×</div></div>').join('')+'</div>').join('')).join('');
    const units=items.reduce((sum,i)=>sum+Number(i.quantity||0),0),kitUnits=kitRefs.reduce((sum,x)=>sum+Number(x.quantity||0),0);
    return '<div class="ticket-head"><strong>DONA ANTÔNIA</strong><span>SEPARAÇÃO · Pedido #'+esc(orderDisplayCode(o))+'</span><small>'+esc(dateTime(o.created_at))+'</small></div>'+kitBlock+sections+'<div class="foot">'+kitRefs.length+' referência(s) pronta(s) · '+items.length+' produto(s) avulso(s) · '+esc(fmtQty(kitUnits+units))+' unidades/volumes</div>';
  }
  async function markPickingPresented(orderId){
    try{await api('ops_print_presented',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:orderId})})}catch(error){console.warn('ops_print_presented_failed',String(error?.message||error))}
  }
  function printSeparationOnly(detail,existingWindow=null){
    const o=detail.order,w=existingWindow||window.open('','_blank','width=420,height=700');
    if(!w){toast('Libere pop-ups para imprimir');return false}
    openPrint('Separação #'+orderDisplayCode(o),separationTicketBody(detail),'separation',w);
    markPickingPresented(o.id);
    return true;
  }
  function printDelivery(detail){
    const o=detail.order,c=detail.customer||{},a=o.delivery_address_snapshot||c.address||{},payment=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'—';
    const products=separationItems(detail).map(i=>'<div class="delivery-item"><b>'+esc(fmtQty(i.quantity))+'×</b><span>'+esc(i.name)+'</span></div>').join('');
    const address=[a.street,a.number,a.complement,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||'NÃO INFORMADO';
    const body='<div class="ticket-head"><strong>DONA ANTÔNIA</strong><span>ENTREGA · Pedido #'+esc(orderDisplayCode(o))+'</span><small>'+esc(dateTime(o.created_at))+'</small></div>'+
      '<div class="block"><b>CLIENTE</b><div>'+esc(c.display_name||a.recipient_name||'NÃO VINCULADO')+'</div>'+(c.phone?'<div>Tel: '+esc(formatPhone(c.phone))+'</div>':'')+(c.cpf?'<div>CPF: '+esc(formatCpf(c.cpf))+'</div>':'')+(c.email?'<div>E-mail: '+esc(c.email)+'</div>':'')+'</div>'+
      '<div class="block"><b>ENDEREÇO</b><div>'+esc(address)+'</div>'+(a.postal_code?'<div>CEP: '+esc(a.postal_code)+'</div>':'')+'</div>'+
      '<div class="block"><b>PAGAMENTO</b><div>'+esc(payment)+'</div><div>Status: '+esc(o.status||'')+'</div><div class="big-total">TOTAL: '+money(o.total_cents)+'</div></div>'+
      '<div class="block"><b>PRODUTOS</b>'+products+'</div>'+
      '<div class="block lines"><div>Observações:</div><br><br><div>Recebido por: __________________</div></div>';
    openPrint('Entrega #'+orderDisplayCode(o),body,'delivery');
  }

    return Object.freeze({openDanfeForOrder,printSeparationOnly,printDelivery,separationTicketBody});
  }
  global.DonaAntoniaAdminOrderDocuments=Object.freeze({create});
})(window);
