(() => {
  'use strict';

  const BUILD='20260901-li-personalizador-inline-v2.2';
  const TEST_PARAM='cf_personalizador';
  const TEST_VALUE='teste';
  const INLINE_V1='https://donaantonia.com.br/loja-integrada/personalizador-inline-v1.js?v=20260901-5';
  const CONTRACT='20260831-personalizador-v4-make-contract-v1';
  const text=value=>String(value??'').trim();

  if(new URLSearchParams(location.search).get(TEST_PARAM)!==TEST_VALUE)return;
  if(window.__CF_LI_PERSONALIZADOR_INLINE_V2__===BUILD)return;
  window.__CF_LI_PERSONALIZADOR_INLINE_V2__=BUILD;

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const method=String(init?.method||'GET').toUpperCase();
    if(method!=='POST'||typeof init?.body!=='string')return nativeFetch(input,init);

    let outer,payload;
    try{
      outer=JSON.parse(init.body);
      payload=typeof outer?.payload==='string'?JSON.parse(outer.payload):outer?.payload;
    }catch{
      return nativeFetch(input,init);
    }

    if(payload?.action!=='personalize_mug_model'||payload?.mode!=='loja_integrada_inline')return nativeFetch(input,init);

    let images=[];
    try{
      images=Array.isArray(payload.images_json)?payload.images_json:JSON.parse(text(payload.images_json)||'[]');
      if(!Array.isArray(images))images=[];
    }catch{images=[];}

    const officialArt=text(payload.image_base64);
    const normalizedImages=images
      .filter(item=>/^data:image\//i.test(text(item?.image_base64)))
      .map(item=>({
        field_id:text(item?.field_id),
        role:text(item?.field_id||item?.role),
        image_base64:text(item?.image_base64)
      }));
    const firstCustomerImage=text(normalizedImages[0]?.image_base64);

    const next={
      ...payload,
      mode:'loja_integrada_v4_staging',
      images_json:JSON.stringify(normalizedImages),
      model_art_base64:officialArt,
      reference_image_base64:officialArt,
      official_model_art_base64:officialArt,
      image_base64:firstCustomerImage||officialArt,
      v4_contract:CONTRACT,
      inline_contract:BUILD
    };
    const nextOuter={...outer,payload:typeof outer?.payload==='string'?JSON.stringify(next):next};
    return nativeFetch(input,{...init,body:JSON.stringify(nextOuter)});
  };

  const script=document.createElement('script');
  script.src=INLINE_V1;
  script.async=true;
  script.onerror=()=>console.error('[CanecaFácil] Falha ao carregar interface inline V1.');
  document.head.appendChild(script);

  console.info(`CanecaFácil · personalizador inline ${BUILD}`);
})();