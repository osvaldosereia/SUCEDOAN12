const STOPWORDS=new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','ou','pra','para','por','com','sem','que','qual','quais','quanto','quantos','quanta','quantas',
  'voce','voces','você','vocês','tem','têm','tenho','ter','vende','vendem','quero','queria','preciso','me','mostra','mostrar','mostre','veja','ver','ai','aí','hoje',
  'mais','menos','barato','barata','baratos','baratas','caro','cara','caros','caras','maior','menor','grande','pequeno','pequena','simples','opcao','opção','produto','produtos',
  'cesta','cestas','basica','básica','basicas','básicas','reais','real','r','preco','preço','valor','disponivel','disponível','disponiveis','disponíveis','algum','alguma','alguns','algumas'
]);

const CLEANING_PHRASES=['material de limpeza','produto de limpeza','produtos de limpeza','limpeza','lavanderia','material limpeza'];
const GENERIC_PRODUCT_TERMS=new Set(['material','coisa','coisas','item','itens','opcao','opção','tipo','tipos']);

export function dqNorm(value){
  return String(value??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9%.,/+\-\s]/g,' ').replace(/\s+/g,' ').trim();
}

function singularWord(word){
  const w=dqNorm(word);
  if(w==='cafes')return 'cafe';
  if(w==='cestas')return 'cesta';
  if(w==='litros')return 'litro';
  if(w==='produtos')return 'produto';
  if(w==='amaciantes')return 'amaciante';
  if(w==='detergentes')return 'detergente';
  if(w==='desinfetantes')return 'desinfetante';
  if(w==='fraldas')return 'fralda';
  if(w==='sabonetes')return 'sabonete';
  if(w==='shampoos')return 'shampoo';
  if(w==='cafés')return 'cafe';
  return w;
}

function canonicalPhrase(value){return dqNorm(value).split(/\s+/).map(singularWord).filter(Boolean).join(' ')}
function uniq(values){return [...new Set(values.filter(Boolean))]}

function normalizePackage(value,unit){
  const n=String(value).replace(',','.');
  const u=dqNorm(unit);
  if(u==='litro'||u==='litros')return `${n}l`;
  return `${n}${u}`;
}

function packageTermsFrom(s){
  const out=[];
  const re=/\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|litro|litros)\b/g;
  let m;while((m=re.exec(s)))out.push(normalizePackage(m[1],m[2]));
  const size=s.match(/\btamanho\s+([a-z0-9]+)\b/);if(size)out.push(`tamanho ${size[1]}`);
  return uniq(out);
}

function trimEntity(value){
  return canonicalPhrase(value)
    .replace(/\b(?:e|ou|sem|com|ate|por|mais|menos|barato|barata|caro|cara|reais|real|r)\b.*$/,' ')
    .split(/\s+/)
    .filter(x=>x&&!STOPWORDS.has(x)&&!GENERIC_PRODUCT_TERMS.has(x)&&!/^\d+(?:[.,]\d+)?$/.test(x))
    .slice(0,4)
    .join(' ')
    .trim();
}

function productTermsFrom(s,domain){
  let work=s
    .replace(/\b(?:qual|quais|quanto custa|quanto ta|quanto esta|tem|vende|vendem|quero|queria|preciso|me mostra|mostra|mostre|ver|veja)\b/g,' ')
    .replace(/\b(?:mais barato|mais barata|mais caro|mais cara|menor preco|menor valor|maior preco|maior valor)\b/g,' ')
    .replace(/\b(?:de|da|do|das|dos)\s+\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|litro|litros)\b/g,' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|ml|l|litro|litros)\b/g,' ')
    .replace(/\btamanho\s+[a-z0-9]+\b/g,' ');
  if(domain==='baskets')work=work.replace(/\b(?:cesta|cestas|basica|basicas|bonini|koblenz|economica)\b/g,' ');
  return uniq(work.split(/\s+/).map(singularWord).filter(x=>x&&x.length>=3&&!STOPWORDS.has(x)&&!GENERIC_PRODUCT_TERMS.has(x)&&!/^\d/.test(x))).slice(0,5);
}

export function parseDeterministicQuery(message,context={}){
  const s=canonicalPhrase(message);
  const ctxTopic=dqNorm(context?.topic||'');
  const hasBasketWord=/\b(cesta|bonini|koblenz|economica)\b/.test(s);
  const elliptical=/^(?:e\s+)?(?:qual|quais)?\s*(?:a|o)?\s*(?:mais|maior|menor|tem|de)\b/.test(s)||/\b(mais cara|mais caro|mais barata|mais barato|maior|menor)\b/.test(s);
  let domain=hasBasketWord?'baskets':null;
  if(!domain&&ctxTopic==='baskets'&&elliptical)domain='baskets';
  if(!domain&&ctxTopic==='products'&&elliptical)domain='products';
  const productish=/\b(qual|quais|tem|vende|vendem|quero|preciso|produto|marca|kg|ml|litro|tamanho)\b/.test(s);
  if(!domain&&productish)domain='products';

  let operation='lookup';
  const mostOf=s.match(/\b(?:qual|quais)?\s*cesta\s+(?:tem|com)\s+mais\s+([a-z][a-z0-9 ]{1,40})/);
  if(domain==='baskets'&&mostOf)operation='most_of_item';
  else if(/\bmais\s+car[oa]\b|\bmaior\s+(?:preco|valor)\b/.test(s))operation='most_expensive';
  else if(/\bmais\s+barat[oa]\b|\bmais\s+em\s+conta\b|\bmenor\s+(?:preco|valor)\b/.test(s))operation='cheapest';
  else if(domain==='baskets'&&/\b(maior cesta|cesta maior|mais completa|mais itens|mais produtos)\b/.test(s))operation='largest';
  else if(domain==='baskets'&&/\b(menor cesta|cesta menor|menos itens|menos produtos)\b/.test(s))operation='smallest';
  else if(domain==='products'&&/\b(qual|quais|tem|vende|vendem|quero|mostra|mostre)\b/.test(s))operation='list_products';

  const budgetMatch=s.match(/\b(?:ate|tenho|orcamento|por ate|no maximo)\s*(?:r\$?\s*)?(\d{2,5}(?:[.,]\d{1,2})?)/);
  const budget=budgetMatch?Number(budgetMatch[1].replace(',','.')):null;

  let quantity=null;
  let qm=s.match(/\bpelo menos\s+(\d+)\s+(?:de\s+)?([a-z][a-z0-9 ]{1,45})/);
  if(qm){const term=trimEntity(qm[2]);if(term)quantity={value:Number(qm[1]),mode:'min',term};}
  if(!quantity){qm=s.match(/\b(?:com|tenha|tem)\s+(?:exatamente\s+)?(\d+)\s+(?:de\s+)?([a-z][a-z0-9 ]{1,45})/);if(qm){const term=trimEntity(qm[2]);if(term)quantity={value:Number(qm[1]),mode:/exatamente/.test(qm[0])?'exact':'exact',term};}}

  const excludeCategories=[];const excludeTerms=[];
  if(CLEANING_PHRASES.some(x=>s.includes(`sem ${canonicalPhrase(x)}`)))excludeCategories.push('limpeza_lavanderia');
  const ex=s.match(/\bsem\s+([a-z][a-z0-9 ]{1,45})/);if(ex&&!excludeCategories.length){const term=trimEntity(ex[1]);if(term)excludeTerms.push(term);}

  const includeTerms=[];
  if(quantity?.term)includeTerms.push(quantity.term);
  if(mostOf){const term=trimEntity(mostOf[1]);if(term&&!includeTerms.includes(term))includeTerms.push(term);}
  if(domain==='baskets'&&!quantity){const inc=s.match(/\b(?:com|que tenha|que tem)\s+([a-z][a-z0-9 ]{1,45})/);if(inc){const term=trimEntity(inc[1]);if(term&&!includeTerms.includes(term))includeTerms.push(term);}}

  const packageTerms=packageTermsFrom(s);
  let productTerms=productTermsFrom(s,domain);
  if(domain==='products'&&productTerms.length===0&&ctxTopic==='products'&&Array.isArray(context?.productTerms))productTerms=context.productTerms.map(singularWord).filter(Boolean).slice(0,5);
  if(domain==='baskets'&&includeTerms.length)productTerms=uniq([...productTerms,...includeTerms]);

  return {raw:String(message??''),normalized:s,domain,operation,budget,quantity,includeTerms:uniq(includeTerms),excludeTerms:uniq(excludeTerms),excludeCategories:uniq(excludeCategories),productTerms:uniq(productTerms),brandTerms:[],packageTerms,topic:domain};
}

function itemText(item){return dqNorm([item?.name,item?.brand,item?.category,item?.sales_category,item?.packaging].filter(Boolean).join(' '))}
function itemQtyForTerm(items,term){const t=dqNorm(term);return items.reduce((sum,item)=>itemText(item).includes(t)?sum+Number(item?.quantity||0):sum,0)}
function basketTotal(items){return items.reduce((sum,item)=>sum+Number(item?.quantity||0),0)}

export function filterAndRankBaskets(input,parsed){
  let rows=(Array.isArray(input)?input:[]).map(b=>({...b,_total:basketTotal(Array.isArray(b.items)?b.items:[])}));
  if(Number.isFinite(parsed?.budget))rows=rows.filter(b=>Number(b.base_price||0)<=Number(parsed.budget));
  for(const cat of parsed?.excludeCategories||[])rows=rows.filter(b=>!(b.items||[]).some(item=>dqNorm(item?.sales_category)===dqNorm(cat)));
  for(const term of parsed?.excludeTerms||[])rows=rows.filter(b=>!(b.items||[]).some(item=>itemText(item).includes(dqNorm(term))));
  for(const term of parsed?.includeTerms||[])rows=rows.filter(b=>itemQtyForTerm(b.items||[],term)>0);
  if(parsed?.quantity?.term){rows=rows.filter(b=>{const q=itemQtyForTerm(b.items||[],parsed.quantity.term);return parsed.quantity.mode==='min'?q>=Number(parsed.quantity.value):q===Number(parsed.quantity.value)});}
  const mainTerm=parsed?.includeTerms?.[0]||parsed?.quantity?.term||null;
  rows.sort((a,b)=>{
    if(parsed?.operation==='most_expensive')return Number(b.base_price||0)-Number(a.base_price||0)||b._total-a._total;
    if(parsed?.operation==='cheapest')return Number(a.base_price||0)-Number(b.base_price||0)||b._total-a._total;
    if(parsed?.operation==='largest')return b._total-a._total||Number(b.base_price||0)-Number(a.base_price||0)||Number(a.sort_order||0)-Number(b.sort_order||0);
    if(parsed?.operation==='smallest')return a._total-b._total||Number(a.base_price||0)-Number(b.base_price||0)||Number(a.sort_order||0)-Number(b.sort_order||0);
    if(parsed?.operation==='most_of_item'&&mainTerm){const d=itemQtyForTerm(b.items||[],mainTerm)-itemQtyForTerm(a.items||[],mainTerm);if(d)return d;}
    return b._total-a._total||Number(a.base_price||0)-Number(b.base_price||0);
  });
  return rows;
}

function productPrimaryText(p){return dqNorm([p?.name,p?.brand].filter(Boolean).join(' '))}
function packageText(p){return dqNorm([p?.packaging,p?.name].filter(Boolean).join(' ')).replace(/\s+/g,'')}
function productScore(p,parsed){
  const name=dqNorm(p?.name),brand=dqNorm(p?.brand),category=dqNorm(p?.category),sales=dqNorm(p?.sales_category),pack=packageText(p);let score=0;
  for(const term0 of parsed?.productTerms||[]){const term=dqNorm(term0);if(name.includes(term))score+=8;else if(brand.includes(term))score+=7;else if(category.includes(term)||sales.includes(term))score+=2;}
  for(const pkg0 of parsed?.packageTerms||[]){const pkg=dqNorm(pkg0).replace(/\s+/g,'');if(pack.includes(pkg))score+=6;}
  return score;
}

export function rankProducts(input,parsed){
  let rows=(Array.isArray(input)?input:[]).filter(p=>Number(p?.stock??1)>0);
  const terms=parsed?.productTerms||[];
  if(terms.length)rows=rows.filter(p=>terms.every(term=>productPrimaryText(p).includes(dqNorm(term))));
  for(const pkg0 of parsed?.packageTerms||[]){const pkg=dqNorm(pkg0).replace(/\s+/g,'');rows=rows.filter(p=>packageText(p).includes(pkg));}
  rows=rows.map(p=>({...p,_score:productScore(p,parsed)}));
  rows.sort((a,b)=>{
    if(parsed?.operation==='cheapest')return Number(a.price||0)-Number(b.price||0)||b._score-a._score;
    if(parsed?.operation==='most_expensive')return Number(b.price||0)-Number(a.price||0)||b._score-a._score;
    return b._score-a._score||Number(a.price||0)-Number(b.price||0)||String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
  });
  return rows;
}

export function productLookupQuery(parsed){return (parsed?.productTerms||[]).join(' ').trim()}
