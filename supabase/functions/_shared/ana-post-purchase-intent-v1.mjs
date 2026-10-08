// ANA V3: classificação determinística e resposta reativa para acréscimo pós-checkout.
// Este módulo não consulta dados pessoais, não emite credenciais e não altera pedidos.
const normalize=value=>String(value??'').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim().slice(0,500);

export function classifyAnaPostPurchaseRequest(message=''){
  const text=normalize(message);
  if(!text||text.length<7)return null;
  if(/\b(nao quero|nao precisa|desisti|deixa pra la|cancelar|cancela|cancelamento|estornar|devolver)\b/.test(text))return null;
  if(/\b(esqueci|esqueceu)\b.*\b(senha|cpf|endereco|pagamento|pagar|pix|numero|codigo|chave|documento|comprovante)\b/.test(text))return null;
  if(/\b(adicionar|acrescentar|colocar|botar|por)\b.*\b(carrinho|lista de compras)\b/.test(text)
     && !/\b(pedido|ja comprei|ja fiz a compra|compra feita)\b/.test(text))return null;

  const forgot=/\b(esqueci|esqueceu|faltou|deixei de colocar)\b/.test(text)
    && /\b(produto|item|coisa|arroz|feijao|oleo|cafe|acucar|sabao|detergente|leite|macarrao|papel|sabonete|cesta|pedido|compra)\b/.test(text);
  const explicit=/\b(adicionar|adicione|acrescentar|acrescente|colocar|coloque|botar|bota|por|incluir|inclua)\b/.test(text)
    && /\b(pedido|compra|cesta|ja pedi|ja comprei|ja fiz)\b/.test(text);
  const more=/\b(mais um|mais uma|mais alguns|mais alguma|outro produto|outra coisa)\b/.test(text)
    && /\b(pedido|compra|cesta|ja pedi|ja comprei|ja fiz)\b/.test(text);
  if(!forgot&&!explicit&&!more)return null;

  return {
    intent:'order_addon_request',
    source:'deterministic',
    needs_order_lookup:true,
    may_mutate_order:false,
    should_send_marketing:false,
    reason:forgot?'forgot_item':explicit?'explicit_addon':'extra_item'
  };
}

const allowedUrl=url=>/^https:\/\/(?:www\.)?donaantonia\.com\.br\/adicionar\/#t=[A-Za-z0-9_-]{32,96}$/.test(String(url||''));
const validOrderNumber=value=>/^[A-Za-z0-9-]{1,48}$/.test(String(value||''));

export function buildAnaPostPurchaseReply({status='unknown',addonUrl='',orderNumber=''}={}){
  if(status==='eligible'&&allowedUrl(addonUrl)){
    const suffix=validOrderNumber(orderNumber)?` ${orderNumber}`:'';
    return {
      decision:'suggest',
      reason:'addon_link_verified',
      response_text:`Pode sim! Você pode acrescentar produtos ao mesmo pedido${suffix} por este link: ${addonUrl}\nSe a separação começar antes, o link será fechado.`
    };
  }
  if(status==='closed'){
    return {
      decision:'handoff',
      reason:'addon_window_closed',
      response_text:'Esse pedido não está mais disponível para acréscimos pelo site. Posso encaminhar você para nossa equipe verificar as opções.'
    };
  }
  return {
    decision:'handoff',
    reason:'addon_order_context_unverified',
    response_text:'Vou encaminhar para nossa equipe verificar seu pedido e como podemos ajudar.'
  };
}
