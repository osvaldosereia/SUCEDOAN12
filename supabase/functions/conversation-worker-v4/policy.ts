export const norm=(v:unknown)=>String(v??"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/\s+/g," ").trim();
export const arr=(v:unknown)=>Array.isArray(v)?v:[];

const policyTerms=["entrega","frete","pagamento","pix","cartao","cartão","boleto","alelo","sodexo","puxee","cajur","flash","ifood","horario","horário","devolucao","devolução","troca","privacidade","lgpd","pedido minimo","pedido mínimo"];
const basketTerms=["cesta","cestas","cesta basica","cesta básica"];
const productQuestionPrefixes=["tem ","vocês tem ","voces tem ","vocês têm ","voces têm ","vende ","vocês vendem ","voces vendem ","trabalha com ","trabalham com ","quanto custa ","qual o preco ","qual o preço ","qual valor ","preco do ","preço do ","preco da ","preço da "];

export function isGreetingOnly(text:string){const n=norm(text).replace(/[!?.]+$/g,"");return /^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa|alo)$/.test(n)}
export function containsAny(text:string,values:string[]){const n=norm(text);return values.some(v=>n.includes(norm(v)))}
export function isBasketInfoQuestion(text:string){const n=norm(text);return containsAny(n,basketTerms)&&(n.includes("preco")||n.includes("valor")||n.includes("quanto")||n.includes("quais")||n.includes("tem")||n.includes("composicao")||n.includes("foto"))}
export function isProductInfoQuestion(text:string){const n=norm(text);if(containsAny(n,policyTerms)||containsAny(n,basketTerms))return false;return productQuestionPrefixes.some(p=>n.startsWith(norm(p)))||/\b(tem|vende|vendem)\b/.test(n)&&n.length<=140}
export function wantsStockCount(text:string){const n=norm(text);return n.includes("quantas")||n.includes("quantos")||n.includes("estoque")||n.includes("unidades tem")}
export function extractProductQuery(text:string){
  let q=norm(text).replace(/[?!.;,]+/g," ");
  const removals=["por favor","ai","aí","hoje","agora","vocês","voces","tem","têm","vende","vendem","trabalha com","trabalham com","quanto custa","qual o preco","qual o preço","qual valor","preco do","preço do","preco da","preço da","pra mim","para mim"];
  for(const r of removals)q=q.replace(new RegExp(`(^|\\s)${norm(r).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}(?=\\s|$)`,`g`)," ");
  return q.replace(/\s+/g," ").trim().slice(0,120);
}
export function likelyBusinessPolicy(text:string){return containsAny(text,policyTerms)}
export function likelyBasketTopic(text:string){return containsAny(text,basketTerms)}
export function likelyTransaction(text:string){
  const n=norm(text);
  if(n.includes("quero saber")||n.includes("queria saber")||n.includes("preciso saber")||n.includes("quanto custa")||n.includes("qual o preco")||n.includes("qual o preço")||n.includes("so queria saber")||n.includes("só queria saber"))return false;
  return /(^| )(quero comprar|quero encomendar|quero pedir|vou querer|me manda|manda pra mim|pode mandar|coloca|coloque|adiciona|adicione|separa|separe|preciso de|montar pedido|fazer pedido|personalizar|quero uma cesta|quero a cesta)( |$)/.test(n);
}
export function trimIntelligence(bundle:any){
  if(!bundle||bundle.enabled===false)return {enabled:false,knowledge:[],guidance:[],procedures:[]};
  return {enabled:true,knowledge:arr(bundle.knowledge).slice(0,4),guidance:arr(bundle.guidance).slice(0,5),procedures:arr(bundle.procedures).slice(0,2)};
}
