(() => {
  'use strict';
  const ENDPOINT='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-basket-configuration-v1';
  const bridge=()=>window.DonaAntoniaAdminBridge||{};
  async function request(action,payload={}) {
    if(typeof bridge().token!=='function')throw new Error('Sessão administrativa indisponível.');
    const token=await bridge().token();
    const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload}),cache:'no-store'});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.ok===false)throw new Error(result.message||result.error||'Falha ao salvar a configuração.');
    return action==='products'?result:result.configuration||result;
  }
  const api={
    list:()=>request('list'),
    saveTypes:types=>request('types_save',{types}),
    saveQuantities:quantities=>request('quantities_save',{quantities}),
    saveProductType:product_type=>request('product_type_save',{product_type}),
    searchProducts:q=>request('products',{q,limit:40}),
    toast(message){const b=bridge();if(typeof b.toast==='function')b.toast(message);else console.warn(message)}
  };
  window.DonaAntoniaBasketAdminApi=api;
})();
