const clean=(v,max=8000)=>String(v??'')
  .replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ')
  .trim()
  .slice(0,max);

export const normalizePt=(v='')=>clean(v,4000)
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase();

export const moneyBR=(value)=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

const FRIENDLY_NAME=(name='')=>String(name)
  .replace(/\bUnidade\b/gi,'')
  .replace(/\s{2,}/g,' ')
  .trim();

function categoryGroup(item={}){
  const c=normalizePt(item.category);
  if(/higiene|sabonete|beleza|cuidado/.test(c)) return 'Higiene';
  if(/limpeza|lavanderia|amaciante|detergente/.test(c)) return 'Limpeza e lavanderia';
  if(/pet|animal/.test(c)) return 'Casa e pet';
  return 'Alimentos';
}

const GROUP_ORDER=['Alimentos','Higiene','Limpeza e lavanderia','Casa e pet'];

export function formatBasketCatalog(baskets=[]){
  const list=Array.isArray(baskets)?baskets:[];
  if(!list.length) return 'Neste momento não encontrei cestas disponíveis.';
  const lines=['*Nossas cestas:*',''];
  for(const b of list){
    lines.push(`• *${clean(b.display_name||b.name,100)}* — ${moneyBR(b.commercial_price)}`);
  }
  lines.push('','Se quiser, me diga o nome de uma delas e eu mando a lista completa do que vem.');
  return lines.join('\n');
}

export function formatBasketDetail(detail={}){
  const basket=detail?.basket||{};
  const items=Array.isArray(detail?.items)?detail.items:[];
  if(!detail?.found||!basket?.name) return 'Não encontrei essa cesta.';
  const grouped=new Map();
  for(const item of items){
    const group=categoryGroup(item);
    if(!grouped.has(group)) grouped.set(group,[]);
    grouped.get(group).push(item);
  }
  const lines=[`*${clean(basket.display_name||basket.name,120)} — ${moneyBR(basket.commercial_price)}*`];
  for(const group of GROUP_ORDER){
    const rows=grouped.get(group)||[];
    if(!rows.length) continue;
    lines.push('',`*${group}*`);
    for(const item of rows){
      const qty=Number(item.quantity||0);
      lines.push(`${Number.isInteger(qty)?qty:qty.toLocaleString('pt-BR')}× ${FRIENDLY_NAME(item.name)}`);
    }
  }
  lines.push('','Quer trocar, retirar ou aumentar algum item?');
  return lines.join('\n');
}

export function formatCartState(state={}){
  if(!state?.has_cart) return 'Você ainda não escolheu uma cesta.';
  const basket=state.basket||{};
  const items=Array.isArray(state.items)?state.items:[];
  const changed=items.filter(x=>x.changed||x.source==='addon'||x.source==='substitution');
  const lines=[`*${clean(basket.display_name||basket.name||'Sua cesta',120)}*`,`Total agora: *${moneyBR(state.total)}*`];
  if(changed.length){
    lines.push('','*Alterações:*');
    for(const item of changed){
      if(item.source==='addon') lines.push(`+ ${item.quantity}× ${FRIENDLY_NAME(item.name)}`);
      else if(item.source==='substitution') lines.push(`↔ ${item.quantity}× ${FRIENDLY_NAME(item.name)}`);
      else lines.push(`• ${item.quantity}× ${FRIENDLY_NAME(item.name)}`);
    }
  }
  lines.push('','Posso continuar ajustando ou fechar o pedido.');
  return lines.join('\n');
}

export function formatProductResults(products=[],opts={}){
  const list=Array.isArray(products)?products:[];
  if(!list.length) return {text:'Não encontrei esse produto disponível agora.',media_url:null};
  const price=(p)=>{
    const regular=Number(p.price||0),offer=Number(p.offer_price||0);
    return p.is_offer&&offer>0&&offer<=regular?offer:regular;
  };
  if(list.length===1||opts.spotlight===true){
    const p=list[0];
    const current=price(p);
    const regular=Number(p.price||0);
    const offer=p.is_offer&&Number(p.offer_price||0)>0&&Number(p.offer_price)<=regular;
    const text=offer
      ? `*${FRIENDLY_NAME(p.name)}*\nDe ~${moneyBR(regular)}~ por *${moneyBR(current)}*\nQuer adicionar na sua cesta?`
      : `*${FRIENDLY_NAME(p.name)}* — *${moneyBR(current)}*\nQuer adicionar na sua cesta?`;
    return {text,media_url:clean(p.image_url,1800)||null};
  }
  const lines=[opts.offers?'*Ofertas disponíveis:*':'*Encontrei estas opções:*',''];
  for(const p of list.slice(0,8)){
    lines.push(`• ${FRIENDLY_NAME(p.name)} — *${moneyBR(price(p))}*`);
  }
  lines.push('','Me diga qual você quer ver ou adicionar.');
  return {text:lines.join('\n'),media_url:null};
}

export function findBasketQuery(message,baskets=[]){
  const q=normalizePt(message);
  const list=[...(Array.isArray(baskets)?baskets:[])].sort((a,b)=>String(b.name||'').length-String(a.name||'').length);
  for(const b of list){
    const names=[b.name,b.display_name].filter(Boolean).map(normalizePt);
    if(names.some(n=>n&&q.includes(n))) return b.name;
  }
  const aliases=[
    ['economica','Economica Bonini'],['mini bonini','Mini Bonini'],['mini koblenz','Mini Koblenz'],
    ['pequena bonini','Pequena Bonini'],['pequena koblenz','Pequena Koblenz'],
    ['media bonini','Média Bonini'],['media koblenz','Média Koblenz'],
    ['grande bonini','Grande Bonini'],['grande koblenz','Grande Koblenz']
  ];
  for(const [alias,name] of aliases) if(q.includes(alias)) return name;
  return '';
}

function afterVerb(q,verbs){
  for(const v of verbs){
    const i=q.indexOf(v);
    if(i>=0){
      return q.slice(i+v.length).replace(/^(?:\s+o|\s+a|\s+os|\s+as|\s+um|\s+uma|\s+de|\s+do|\s+da)\s+/,' ').trim();
    }
  }
  return '';
}

export function parseDeterministicIntent(message,baskets=[],hasCart=false){
  const q=normalizePt(message);
  const basketQuery=findBasketQuery(message,baskets);
  if(!q) return {intent:'unknown'};

  if(/\b(atendente|humano|pessoa|falar com alguem|falar com uma pessoa)\b/.test(q))
    return {intent:'handoff'};

  if(/^(oi+|ola+|bom dia|boa tarde|boa noite)[!. ]*$/.test(q))
    return {intent:'greeting'};

  if(/\b(quais|qual).*\bcestas?\b|\bcestas?\b.*\b(tem|disponiveis|opcoes)\b|\bver as cestas\b/.test(q))
    return {intent:'list_baskets'};

  if(basketQuery&&(/\b(o que|que).*\b(vem|tem)\b|\b(produtos|itens)\b|\bvem na\b|\btem na\b/.test(q)))
    return {intent:'basket_contents',basketQuery};
  if(hasCart&&/\b(o que|que).*\b(vem|tem)\b.*\bcesta\b|\b(produtos|itens)\b.*\b(dessa|da minha|na)\s+cesta\b/.test(q))
    return {intent:'basket_contents',basketQuery:''};

  if(basketQuery&&/\b(quero|escolho|vou querer|pode ser|pego|levo|adiciona)\b/.test(q))
    return {intent:'choose_basket',basketQuery};

  if(/\b(quanto ficou|valor total|total agora|meu carrinho|minha cesta|resumo do pedido|como ficou)\b/.test(q))
    return {intent:'cart_summary'};

  const swap=q.match(/\b(?:troca|trocar|substitui|substituir)\s+(.+?)\s+(?:por|pelo|pela)\s+(.+)$/);
  if(swap) return {intent:'replace_item',sourceQuery:swap[1].trim(),targetQuery:swap[2].trim()};

  if(hasCart&&/\b(tira|tirar|retira|retirar|remove|remover)\b/.test(q)){
    const productQuery=afterVerb(q,['retirar','retira','remover','remove','tirar','tira']);
    return {intent:'remove_item',productQuery};
  }

  const add=q.match(/\b(?:coloca|colocar|adiciona|adicionar|acrescenta|acrescentar|quero mais)\s+(?:(\d+)\s*(?:x|un|unidades?)?\s*)?(.+)$/);
  if(add&&hasCart) return {intent:'add_or_increase',quantity:Number(add[1]||1),productQuery:add[2].trim()};

  if(/\b(oferta|ofertas|promocao|promocoes|desconto|descontos)\b/.test(q))
    return {intent:'offers'};

  const product=afterVerb(q,['tem','procura','procurar','quero','preciso de','preciso']);
  if(product&&product.length>=2&&!/\bcesta\b/.test(product))
    return {intent:'product_search',productQuery:product};

  return {intent:'unknown'};
}

export function chooseExactProduct(query,products=[]){
  const q=normalizePt(query);
  const list=Array.isArray(products)?products:[];
  if(!q||!list.length) return null;
  const scored=list.map(p=>{
    const n=normalizePt(p.name),brand=normalizePt(p.brand),pack=normalizePt(p.packaging);
    let score=0;
    if(n===q)score=1;
    else if(n.startsWith(q)||q.startsWith(n))score=.93;
    else if(n.includes(q))score=.88;
    else {
      const words=q.split(/\s+/).filter(x=>x.length>2);
      const hit=words.filter(x=>n.includes(x)||brand.includes(x)||pack.includes(x)).length;
      score=hit/Math.max(1,words.length);
    }
    return {p,score};
  }).sort((a,b)=>b.score-a.score);
  if(scored[0]?.score>=.78&&(scored.length===1||scored[0].score-scored[1].score>=.12)) return scored[0].p;
  return null;
}
