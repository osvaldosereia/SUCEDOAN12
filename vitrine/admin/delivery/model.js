// Pure delivery contracts: fiscal gate, payment parsing and route targets.
(function(global){
  function expeditionFiscalState(o,f){
    if(o?.status==='ready'&&o?.delivery_return?.dispatch_blocked===true)return {authorized:false,title:'Retorno em revisão',detail:'Inspecionar mercadoria antes de nova saída',kind:'warn'};
    if(o?.status!=='ready')return {authorized:true,title:'',detail:'',kind:'ok'};
    if(!f)return {authorized:false,title:'Fiscal carregando',detail:'Aguardando conferência',kind:'warn'};
    if(f.error)return {authorized:false,title:'Fiscal indisponível',detail:'Abra o pedido para revisar',kind:'warn'};
    const gate=f.dispatch_gate||{};
    if(gate.authorized===true&&gate.allowed===true){
      return {
        authorized:true,
        title:'Fiscal autorizado',
        detail:(gate.bling_invoice_number?'NF-e '+gate.bling_invoice_number:'Liberado para saída'),
        kind:'ok'
      };
    }
    return {
      authorized:false,
      title:'Fiscal pendente',
      detail:'Emitir NF-e antes da saída',
      kind:'warn'
    };
  }
  function deliveryPaymentMethodOptions(selected=''){
    const rows=[['pix','PIX'],['cash','Dinheiro'],['credit_card','Cartão de crédito'],['food_card','Cartão alimentação'],['meal_card','Cartão refeição'],['other','Outro']];
    return rows.map(([v,l])=>'<option value="'+v+'" '+(v===selected?'selected':'')+'>'+l+'</option>').join('');
  }
  function deliveryPaymentDefaultMethod(o){
    const raw=String(o?.payment_method_snapshot?.method||'').toLowerCase();
    const map={pix:'pix',cash:'cash',dinheiro:'cash',credit:'credit_card',credit_card:'credit_card',card:'credit_card',food_card:'food_card',meal_card:'meal_card'};
    return map[raw]||'pix';
  }
  function paymentAmountInput(cents){return (Number(cents||0)/100).toFixed(2).replace('.',',')}
  function parsePaymentAmountCents(value){
    let s=String(value||'').trim().replace(/R\$/gi,'').replace(/\s+/g,'');
    if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
    const n=Number(s);return Number.isFinite(n)?Math.round(n*100):0;
  }
  function dispatchPaymentSummary(rows){
    const map=new Map();
    for(const o of rows||[]){
      const label=String(o?.payment_method_snapshot?.label||o?.payment_method_snapshot?.method||'Não informado').trim()||'Não informado';
      map.set(label,(map.get(label)||0)+Number(o?.total_cents||0));
    }
    return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
  }
  function deliveryStopAddress(stop){const a=stop?.address||{};return [a.street,a.number,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||''}
  function deliveryStopTarget(stop){
    const rawLat=stop?.destination_latitude,rawLng=stop?.destination_longitude;
    const hasCoordinates=rawLat!=null&&rawLng!=null&&String(rawLat).trim()!==''&&String(rawLng).trim()!=='';
    const lat=Number(rawLat),lng=Number(rawLng);
    if(hasCoordinates&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&stop?.destination_confidence)return lat.toFixed(7)+','+lng.toFixed(7);
    return deliveryStopAddress(stop);
  }
  function deliveryStopMapsHref(stop){
    const target=deliveryStopTarget(stop);
    return target?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(target):String(stop?.maps_url||'');
  }
  function runMapsHref(run){
    const stops=(run?.stops||[]).filter(s=>!['delivered','failed','cancelled'].includes(s.status)).slice(0,9);if(!stops.length)return '';
    if(stops.length===1)return deliveryStopMapsHref(stops[0]);
    const destination=deliveryStopTarget(stops[stops.length-1]);if(!destination)return '';
    const waypoints=stops.slice(0,-1).map(deliveryStopTarget).filter(Boolean);let url='https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(destination);
    if(waypoints.length)url+='&waypoints='+encodeURIComponent(waypoints.join('|'));return url;
  }
  global.DonaAntoniaAdminDeliveryModel=Object.freeze({expeditionFiscalState,deliveryPaymentMethodOptions,deliveryPaymentDefaultMethod,paymentAmountInput,parsePaymentAmountCents,dispatchPaymentSummary,deliveryStopAddress,deliveryStopTarget,deliveryStopMapsHref,runMapsHref});
})(window);
