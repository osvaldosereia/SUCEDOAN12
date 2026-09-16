const money=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const positive=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;

export function buildCommercialClose(product={},config={}){
  const regular=positive(product.price);
  const offer=product.is_offer===true?positive(product.offer_price):null;
  const validOffer=offer!==null&&regular!==null&&offer<regular;
  const price=validOffer?offer:regular;
  return {
    brandName:String(config.brandName||'Dona Antônia'),
    productName:String(product.name||'Produto').trim(),
    price,
    priceText:price===null?'':money(price),
    compareAt:validOffer?regular:null,
    compareAtText:validOffer?money(regular):'',
    badge:validOffer?'OFERTA':null,
    cta:String(config.cta||'Peça pelo WhatsApp'),
    serviceArea:String(config.serviceArea||'Cuiabá e Várzea Grande')
  };
}
