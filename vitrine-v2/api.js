import {CONFIG} from './config.js';

const labels={
  invalid_phone:'Confira o telefone com DDD.',
  basket_not_ready:'Esta cesta está temporariamente indisponível.',
  basket_not_found:'Cesta não encontrada.',
  insufficient_stock:'Algum item não tem estoque suficiente.',
  product_unavailable:'Um produto ficou indisponível.',
  basket_product_unavailable:'Um item da cesta ficou indisponível.',
  basket_quantity_out_of_range:'A quantidade escolhida não está disponível.',
  item_not_removable:'Este item não pode ser retirado.',
  quantity_not_editable:'Este item não permite alteração de quantidade.',
  cart_empty:'Sua compra está vazia.',
  rate_limited:'Muitas tentativas em pouco tempo. Aguarde um instante.',
  origin_not_allowed:'A vitrine precisa ser aberta pelo site oficial.'
};

export async function api(action,payload={}){
  const endpoint=CONFIG.edgeFunction||'storefront-v2';
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${endpoint}`,{
      method:'POST',
      headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({action,...payload}),
      cache:'no-store',
      credentials:'omit',
      signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false){
      const code=String(data.error||'request_failed');
      const err=new Error(labels[code]||'Não foi possível concluir. Tente novamente.');
      err.code=code;err.status=response.status;throw err;
    }
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('A conexão demorou demais. Tente novamente.');
    throw error;
  }finally{clearTimeout(timer)}
}
