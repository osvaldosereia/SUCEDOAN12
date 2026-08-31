import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

const FIREBASE=(process.env.FIREBASE_BASE_URL||'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/,'');
const PRODUCT_KEY=process.env.PRODUCT_KEY||'mug-1788112886597-dl6wvv';
const CREATION_ID=`CF-DIAG-${Date.now().toString(36).toUpperCase()}`;
const STORE='https://canecafacil.com.br';
const text=v=>String(v??'').trim();
async function getJson(url){const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json();}
function cookieLines(headers){return typeof headers.getSetCookie==='function'?headers.getSetCookie():[];}
function cookieHeader(lines){return lines.map(v=>v.split(';',1)[0]).join('; ');}
function cookieNames(lines){return lines.map(v=>v.split('=',1)[0]).filter(Boolean);}
function containsCreation(values){return values.some(v=>v.includes(CREATION_ID));}

const p=await getJson(`${FIREBASE}/produtos/${encodeURIComponent(PRODUCT_KEY)}.json`);
if(!p)throw new Error('Produto de referência não encontrado no Firebase.');
const productId=text(p?.loja_integrada?.produto_id);
if(!productId)throw new Error('Produto de referência não possui produto_id confirmado na Loja Integrada.');
const rawUrl=text(p?.loja_integrada?.url||p?.canecafacil_url)||(text(p?.loja_integrada_alias||p?.loja_integrada?.alias)?`${STORE}/${text(p.loja_integrada_alias||p.loja_integrada.alias).replace(/^\/+/, '')}`:'');
console.log(`PRODUTO ${PRODUCT_KEY} · ID LI ${productId}`);
console.log(`CREATION_ID ${CREATION_ID}`);
if(rawUrl) console.log(`URL PRODUTO ${rawUrl}`);

const cartUrl=new URL(`/carrinho/produto/${encodeURIComponent(productId)}/adicionar`,STORE);
cartUrl.searchParams.set('utm_source','canecafacil');
cartUrl.searchParams.set('utm_medium','personalizador');
cartUrl.searchParams.set('utm_campaign',CREATION_ID);
cartUrl.searchParams.set('utm_content',CREATION_ID);
console.log(`ROTA CARRINHO ${cartUrl.href}`);

let first;
try{
  first=await fetch(cartUrl,{redirect:'manual',headers:{'User-Agent':'CanecaFacil-UX-Diagnostic/1.1',Accept:'text/html'},signal:AbortSignal.timeout(15000)});
}catch(error){console.log(`STOREFRONT_INACESSIVEL ${error?.cause?.code||error?.name||'erro'} · ${error.message}`);process.exit(2);}
const firstCookies=cookieLines(first.headers);
const location=first.headers.get('location')||'';
console.log(`ADD HTTP ${first.status} · LOCATION ${location||'(sem redirect)'}`);
console.log(`ADD COOKIES ${cookieNames(firstCookies).join(',')||'nenhum'} · creation_id_em_cookie=${containsCreation(firstCookies)}`);

const nextUrl=location?new URL(location,STORE):new URL('/carrinho/index',STORE);
const second=await fetch(nextUrl,{redirect:'follow',headers:{'User-Agent':'CanecaFacil-UX-Diagnostic/1.1',Accept:'text/html',...(firstCookies.length?{Cookie:cookieHeader(firstCookies)}:{})},signal:AbortSignal.timeout(15000)});
const html=await second.text();
const secondCookies=cookieLines(second.headers);
console.log(`CARRINHO HTTP ${second.status} · FINAL ${second.url}`);
console.log(`CARRINHO COOKIES ${cookieNames(secondCookies).join(',')||'nenhum'} · creation_id_em_cookie=${containsCreation(secondCookies)}`);
console.log(`CARRINHO contem_creation_id_html=${html.includes(CREATION_ID)} · contem_sku=${html.toLowerCase().includes(text(p.codigo||p.sku).toLowerCase())} · contem_nome=${html.toLowerCase().includes(text(p.nome).toLowerCase())}`);

const favoriteAdd=`/conta/favorito/${productId}/adicionar`;
const favoriteList='/conta/favorito/listar';
console.log(`FAVORITO ROTA_ADD ${favoriteAdd}`);
console.log(`FAVORITO ROTA_LISTA ${favoriteList}`);
console.log('RESULTADO_DIAGNOSTICO '+JSON.stringify({product_key:PRODUCT_KEY,produto_id:productId,creation_id:CREATION_ID,add_status:first.status,add_location:location,cart_status:second.status,cart_final_url:second.url,cart_has_product:html.toLowerCase().includes(text(p.nome).toLowerCase()),creation_id_visible_in_response:containsCreation([...firstCookies,...secondCookies])||html.includes(CREATION_ID),favorite_add_route:favoriteAdd,favorite_list_route:favoriteList}));
