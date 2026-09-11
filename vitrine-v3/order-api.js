import {CONFIG} from './config.js';

const labels={invalid_phone:'Confira o telefone com DDD.',basket_not_ready:'Esta cesta está temporariamente indisponível.',insufficient_stock:'Algum item não tem estoque suficiente.',product_unavailable:'Um produto ficou indisponível.',basket_product_unavailable:'Um item da cesta ficou indisponível.',rate_limited:'Muitas tentativas em pouco tempo. Aguarde um instante.'};

export async function createOrder(payload){
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.orderFunction}`,{
    method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({action:'create_order',...payload}),cache:'no-store',credentials:'omit'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false){const code=String(data.error||'request_failed');const error=new Error(labels[code]||'Não foi possível salvar o pedido.');error.code=code;throw error}
  return data;
}
