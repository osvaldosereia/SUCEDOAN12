(() => {
  'use strict';

  const BUILD='20260902-personalizer-correction-policy-v1';
  const FIREBASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const CREATIONS_NODE='canecas/personalizadas';
  const PRODUCTS_NODE='produtos';
  const params=new URLSearchParams(location.search);
  const text=value=>String(value??'').trim();
  const safeKey=value=>text(value).replace(/[.#$\[\]/]/g,'_');

  if(window.__CF_CORRECTION_POLICY__===BUILD)return;
  window.__CF_CORRECTION_POLICY__=BUILD;

  async function get(path){
    const response=await fetch(`${FIREBASE}/${path}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Firebase ${response.status}`);
    return response.json();
  }

  async function resolveModel(){
    const direct=text(params.get('model'));
    if(direct)return direct;
    const creation=text(params.get('creation'));
    if(!creation)return'';
    const record=await get(`${CREATIONS_NODE}/${safeKey(creation)}`).catch(()=>null);
    return text(record?.modelo_key||record?.produto_key||record?.model_id);
  }

  async function apply(){
    const button=document.getElementById('editCreation');
    if(!button)return;
    button.textContent='CORRIGIR DADOS';
    button.hidden=true;
    const model=await resolveModel();
    if(!model)return;
    const product=await get(`${PRODUCTS_NODE}/${safeKey(model)}`).catch(()=>null);
    if(!product)return;
    const cfg=product.personalizacao&&typeof product.personalizacao==='object'?product.personalizacao:{};
    const allowed=cfg.permitir_correcao_pos_geracao===true||product.personalizacao_permitir_correcao===true;
    button.hidden=!allowed;
    button.dataset.cfCorrectionAllowed=allowed?'1':'0';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply().catch(console.error),{once:true});
  else apply().catch(console.error);

  console.info(`CanecaFácil · política de correção ${BUILD}`);
})();
