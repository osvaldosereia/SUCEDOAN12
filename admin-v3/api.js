import {CONFIG} from './config.js';

const labels={
  origin_not_allowed:'Abra o Admin pelo site oficial.',
  invalid_phone:'Confira o telefone com DDD.',
  invalid_gtin:'Confira o EAN.',
  invalid_ncm:'Confira o NCM.',
  phone_already_used:'Este telefone já está em outro cliente.',
  category_already_exists:'Essa categoria já existe.',
  category_not_found:'Categoria não encontrada.',
  invalid_google_maps_url:'Confira o link do Google Maps.'
};

export async function api(action,payload={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/${CONFIG.adminFunction}`,{
      method:'POST',headers:{apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({action,...payload}),cache:'no-store',credentials:'omit',signal:controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false){const code=String(data.error||'request_failed');const error=new Error(labels[code]||data.detail||'Não foi possível concluir.');error.code=code;throw error}
    return data;
  }catch(error){if(error?.name==='AbortError')throw new Error('A conexão demorou demais. Tente novamente.');throw error}finally{clearTimeout(timer)}
}
