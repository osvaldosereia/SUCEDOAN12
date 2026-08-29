// CanecaFácil runtime guard v4: isolate mug catalog, expired offers, stable custom routes and visible coupon totals.
const BUILD='20260828-canecafacil-runtime-v4';
const priorFetch=window.fetch.bind(window);const products=new Map();
const text=v=>String(v??'').trim();
function norm(v){return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function isMug(p={}){const hay=norm([p.tipo_produto,p.categoria,p.subcategoria,p.subsubcategoria,p.nome].join(' '));return hay.includes('caneca')}
function activeMug(p={}){if(!isMug(p))return false;if(p.canecafacil_ativo===false||p.canecafacil_ativo==='false')return false;if(p.ativo===true)return true;if(p.ativo===false)return false;const s=norm(p.situacao||p.status);return['a','ativo','ativa','active','1','true'].includes(s)||(!s&&p.visivel!==false)}
function offerValid(p={}){const offer=Number(p.preco_oferta||0);if(!(offer>0))return false;const raw=text(p.validade_oferta||p.oferta_validade||'');if(!raw)return true;let d;if(/^\d{2}\/\d{2}\/\d{4}$/.test(raw))d=new Date(raw.split('/').reverse().join('-')+'T23:59:59');else d=new Date(raw.length===10?raw+'T23:59:59':raw);return Number.isNaN(d.getTime())||d.getTime()>=Date.now()}
function brl(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
window.fetch=async function(input,init={}){
  const url=String(input?.url||input||''),method=String(init?.method||input?.method||'GET').toUpperCase();
  const res=await priorFetch(input,init);
  if(method==='GET'&&url.includes('/produtos.json')){
    const data=await res.clone().json().catch(()=>null);
    if(data&&typeof data==='object'){
      const filtered={};
      for(const [key,p] of Object.entries(data)){
        if(!p||typeof p!=='object'||!activeMug(p))continue;
        if(Number(p.preco_oferta||0)>0&&!offerValid(p))p.preco_oferta=0;
        products.set(key,p);filtered[key]=p;
      }
      return new Response(JSON.stringify(filtered),{status:res.status,statusText:res.statusText,headers:{'Content-Type':'application/json; charset=utf-8'}})
    }
  }
  return res
};
function restoreQueryRoute(){const q=new URLSearchParams(location.search);if(location.hash)return;if(q.get('view')==='ofertas')history.replaceState(null,'',`${location.pathname}#/ofertas`);else if(q.get('view')==='temas')history.replaceState(null,'',`${location.pathname}#/temas`);else if(q.get('tema'))history.replaceState(null,'',`${location.pathname}#/temas/${encodeURIComponent(q.get('tema'))}`)}
function stabilizeCustomRoute(){const app=document.querySelector('#app');if(!app)return;const route=app.dataset.cfCustomRoute||'';const hash=location.hash;if(route==='themes'&&hash.startsWith('#/temas'))history.replaceState(null,'',`${location.pathname}?view=temas`);else if(route.startsWith('offers:')&&hash==='#/ofertas')history.replaceState(null,'',`${location.pathname}?view=ofertas`);else if(route.startsWith('theme:')&&hash.startsWith('#/temas/')){const value=decodeURIComponent(hash.slice('#/temas/'.length));history.replaceState(null,'',`${location.pathname}?tema=${encodeURIComponent(value)}`)}}
function couponTotal(){const status=document.querySelector('#cfCouponStatus.good');if(!status||status.dataset.totalized==='1')return;const m=status.textContent.match(/-\s*R\$\s*([\d.]+,\d{2})/);const key=(location.hash.match(/^#\/produto\/([^/?#]+)/)||[])[1];const p=key?products.get(decodeURIComponent(key)):null;if(!m||!p)return;const discount=Number(m[1].replace(/\./g,'').replace(',','.'))||0;const unit=Number(p.preco_oferta||p.preco||0),qty=Math.max(1,Number(document.querySelector('#qtyValue')?.textContent||1)),final=Math.max(0,unit*qty-discount);status.textContent+=` · produto com desconto: ${brl(final)}`;status.dataset.totalized='1'}
restoreQueryRoute();const observer=new MutationObserver(()=>{stabilizeCustomRoute();couponTotal()});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});document.documentElement.dataset.cfRuntime=BUILD;
