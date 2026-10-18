// Contatos de pedidos, solicitação de dados e mapa: funções originais.
(function(global){
  function createOrderContactActions(orderProblemReasons,whatsappHref,whatsappMessageHref,orderDisplayCode,esc){
    function orderMissingDataRequest(o){
      const problems=orderProblemReasons(o);
      const needName=problems.includes('Cliente não identificado');
      const needAddress=problems.includes('Endereço incompleto');
      if(!needName&&!needAddress)return null;
      const a=o?.delivery_address_snapshot||{};
      const phone=o?.whatsapp_phone_e164||a.phone||'';
      if(!whatsappHref(phone))return null;
      const rawName=String(o?.customer_name||a.customer_name||a.recipient_name||'').trim();
      const firstName=rawName?rawName.split(/\s+/)[0]:'';
      const greeting=firstName?'Olá, '+firstName+'!':'Olá!';
      let label='Pedir dados',request='';
      if(needName&&needAddress){
        label='Pedir dados';
        request='pode me enviar seu nome completo e seu endereço completo (rua, número, bairro e uma referência)?';
      }else if(needName){
        label='Pedir nome';
        request='pode me informar seu nome completo?';
      }else{
        label='Pedir endereço';
        request='pode me enviar seu endereço completo (rua, número, bairro e uma referência)?';
      }
      const message=greeting+' Para concluirmos seu pedido #'+orderDisplayCode(o)+' da Dona Antônia, '+request+(needAddress?' Se preferir, envie sua localização pelo WhatsApp.':'');
      return {href:whatsappMessageHref(phone,message),label};
    }
    function orderAddressRequestHref(o){
      const request=orderMissingDataRequest(o);
      return request&&orderProblemReasons(o).includes('Endereço incompleto')?request.href:'';
    }
    function mapsHrefFromAddress(a){
      const data=a&&typeof a==='object'?a:{};
      const provided=String(data.google_maps_url||'').trim();
      if(/^https:\/\/(?:www\.)?google\.(?:com|com\.br)\/maps/i.test(provided)||/^https:\/\/maps\.app\.goo\.gl\//i.test(provided))return provided;
      const parts=[data.street,data.number,data.district,data.city,data.state].filter(Boolean);
      return parts.length>=3?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(parts.join(', ')):'';
    }
    function orderContactActionsHtml(o,c={}){
      const a=o?.delivery_address_snapshot||c?.address||{};
      const phone=c?.phone||o?.whatsapp_phone_e164||a.phone||'';
      const wa=whatsappHref(phone),maps=mapsHrefFromAddress(a),dataRequest=orderMissingDataRequest(o);
      if(!wa&&!maps&&!dataRequest)return '';
      return '<div class="dispatch-actions" style="justify-content:flex-start;margin-top:10px">'+
        (dataRequest?'<a class="quick-link primary-link" href="'+esc(dataRequest.href)+'" target="_blank" rel="noopener">'+esc(dataRequest.label)+'</a>':'')+
        (wa?'<a class="quick-link" href="'+esc(wa)+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
        (maps?'<a class="quick-link" href="'+esc(maps)+'" target="_blank" rel="noopener">Abrir no Maps</a>':'')+
      '</div>';
    }
  
    return {orderMissingDataRequest,orderAddressRequestHref,mapsHrefFromAddress,orderContactActionsHtml};
  }
  global.DonaAntoniaAdminOrderContactActions=Object.freeze({createOrderContactActions});
})(window);
