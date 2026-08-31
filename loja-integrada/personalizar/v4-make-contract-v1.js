const BUILD='20260831-personalizador-v4-make-contract-v1';
const nativeFetch=window.fetch.bind(window);
const text=value=>String(value??'').trim();

function parseImages(value){
  try{
    const list=Array.isArray(value)?value:JSON.parse(text(value)||'[]');
    return Array.isArray(list)?list:[];
  }catch{return[];}
}

window.fetch=async function(input,init){
  if(String(init?.method||'GET').toUpperCase()!=='POST'||typeof init?.body!=='string')return nativeFetch(input,init);
  let outer,payload;
  try{
    outer=JSON.parse(init.body);
    payload=typeof outer?.payload==='string'?JSON.parse(outer.payload):outer?.payload;
  }catch{return nativeFetch(input,init);}
  if(payload?.action!=='personalize_mug_model'||payload?.mode!=='loja_integrada_v4_staging')return nativeFetch(input,init);

  const officialArt=text(payload.image_base64);
  const images=parseImages(payload.images_json);
  const firstCustomerImage=text(images.find(item=>/^data:image\//i.test(text(item?.image_base64)))?.image_base64);

  const next={
    ...payload,
    model_art_base64:officialArt,
    reference_image_base64:officialArt,
    official_model_art_base64:officialArt,
    image_base64:firstCustomerImage||officialArt,
    v4_contract:BUILD
  };
  const nextOuter={...outer,payload:typeof outer?.payload==='string'?JSON.stringify(next):next};
  return nativeFetch(input,{...init,body:JSON.stringify(nextOuter)});
};

document.documentElement.dataset.cfPersonalizerV4MakeContract=BUILD;
