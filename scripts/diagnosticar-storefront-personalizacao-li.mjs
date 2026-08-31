const FIREBASE=(process.env.FIREBASE_BASE_URL||'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/$/,'');
const PRODUCT_KEY=process.env.PRODUCT_KEY||'mug-1788112886597-dl6wvv';
const CREATION_ID=`CF-DIAG-${Date.now().toString(36).toUpperCase()}`;
const text=v=>String(v??'').trim();
async function getJson(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json();}
const p=await getJson(`${FIREBASE}/produtos/${encodeURIComponent(PRODUCT_KEY)}.json`);
if(!p)throw new Error('Produto de referência não encontrado no Firebase.');
const rawUrl=text(p?.loja_integrada?.url||p?.canecafacil_url)||(text(p?.loja_integrada_alias||p?.loja_integrada?.alias)?`https://canecafacil.com.br/${text(p.loja_integrada_alias||p.loja_integrada.alias).replace(/^\/+/, '')}`:'');
if(!rawUrl)throw new Error('Produto não possui URL da Loja Integrada.');
const url=new URL(rawUrl,'https://canecafacil.com.br/');
url.searchParams.set('utm_source','canecafacil');
url.searchParams.set('utm_medium','personalizador');
url.searchParams.set('utm_campaign',CREATION_ID);
url.searchParams.set('utm_content',CREATION_ID);
const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':'CanecaFacil-UX-Diagnostic/1.0',Accept:'text/html'}});
const html=await r.text();
const setCookie=typeof r.headers.getSetCookie==='function'?r.headers.getSetCookie():[];
const cookieNames=setCookie.map(v=>v.split('=',1)[0]).filter(Boolean);
const patterns={
  favorito_add:/favorit[^"'\s<]*(adicionar|add)|conta\/favorito|wishlist|lista[-_ ]?desejos/i,
  favorito_remove:/favorit[^"'\s<]*(remover|remove)|conta\/favorito/i,
  login:/\/conta\/login|entrar|login/i,
  carrinho:/carrinho|adicionar[^<]{0,40}carrinho|comprar/i,
  utm_campaign:new RegExp(CREATION_ID.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),
};
const snippets=[];
for(const [name,re] of Object.entries(patterns)){
  const m=html.match(re); snippets.push([name,Boolean(m),m?m[0].slice(0,120):'']);
}
function extractMatches(re,limit=8){const out=[];let m;while((m=re.exec(html))&&out.length<limit){out.push(m[0].slice(0,220));if(!re.global)break;}return out;}
const hrefs=extractMatches(/href=["'][^"']*(?:favorit|wishlist|conta\/login|carrinho)[^"']*["']/gi,12);
const forms=extractMatches(/<form[^>]+action=["'][^"']+["'][^>]*>/gi,12).filter(x=>/carrinho|compr|produto/i.test(x));
console.log(`PRODUTO ${PRODUCT_KEY}`);
console.log(`URL BASE ${rawUrl}`);
console.log(`URL TESTE ${url.href}`);
console.log(`HTTP ${r.status} FINAL ${r.url}`);
console.log(`COOKIES ${cookieNames.join(',')||'nenhum Set-Cookie visível'}`);
for(const [name,ok,snip] of snippets) console.log(`HTML ${name}=${ok}${snip?` · ${snip}`:''}`);
console.log('HREFS '+JSON.stringify(hrefs));
console.log('FORMS '+JSON.stringify(forms));
console.log(`CREATION_ID ${CREATION_ID}`);
