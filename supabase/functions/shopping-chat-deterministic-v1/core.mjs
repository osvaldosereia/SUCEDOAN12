export function normalizeDeterministicText(value=''){
  return String(value??'').replace(/\s+/g,' ').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

export function routeDeterministicText(value=''){
  const s=normalizeDeterministicText(value);
  if(/\b(atendente|humano|pessoa|falar com alguem|falar com atendente)\b/.test(s))return {type:'human',state:'HUMAN_SERVICE'};
  if(/\b(finalizar|fechar|concluir|confirmar pedido|terminar compra|meu pedido|carrinho)\b/.test(s))return {type:'checkout',state:'CHECKOUT'};
  if(/\b(pagamento|pagar|pix|cartao|dinheiro|refeicao|alimentacao)\b/.test(s))return {type:'payment',state:'INFO_PAYMENT'};
  if(/\b(entrega|entregam|frete|cuiaba|varzea grande)\b/.test(s))return {type:'delivery',state:'INFO_DELIVERY'};
  if(/\b(cesta|cestas|cesta basica|cestas basicas)\b/.test(s))return {type:'baskets',state:'VIEWING_BASKETS'};
  if(/\b(oferta|ofertas|promocao|promocoes)\b/.test(s))return {type:'products',offers:true,state:'VIEWING_PRODUCTS'};
  if(/\b(limpeza|lavanderia|sabao|amaciante|desinfetante)\b/.test(s))return {type:'products',category:'limpeza_lavanderia',state:'VIEWING_PRODUCTS'};
  if(/\b(higiene|beleza|shampoo|sabonete|desodorante|creme)\b/.test(s))return {type:'products',category:'higiene_beleza',state:'VIEWING_PRODUCTS'};
  if(/\b(pet|cachorro|gato|vassoura|rodo|balde)\b/.test(s))return {type:'products',category:'casa_pet',state:'VIEWING_PRODUCTS'};
  if(/\b(mercearia|arroz|feijao|cafe|macarrao|molho|tempero|produto|produtos|comprar)\b/.test(s))return {type:'products',category:'mercearia',state:'VIEWING_PRODUCTS'};
  return {type:'menu',state:'MENU'};
}

export function mergeDeterministicMetadata(currentMetadata={},state='',patch={}){
  const current=currentMetadata&&typeof currentMetadata==='object'&&!Array.isArray(currentMetadata)?currentMetadata:{};
  const extra=patch&&typeof patch==='object'&&!Array.isArray(patch)?patch:{};
  return {...current,...extra,...(state?{state}: {})};
}

export function extractPapoAIIdentity(payload={}){
  const source=payload&&typeof payload==='object'?payload:{};
  const pick=(...values)=>values.map(v=>String(v??'').replace(/\s+/g,' ').trim()).find(Boolean)||'';
  return {
    name:pick(source.name,source.nome,source.contact_name,source.lead_name,source.customer_name),
    phone:pick(source.phone,source.telefone,source.whatsapp,source.whatsapp_phone,source.wa_id,source.contact_phone)
  };
}
