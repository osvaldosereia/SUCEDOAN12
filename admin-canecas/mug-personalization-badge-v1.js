import { text } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { loadMugs } from './mug-store-v2.js?v=20260829-1';

const BUILD='20260831-admin-canecas-mug-personalization-badge-v1';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const productKey=p=>text(p?.firebaseKey||p?.id||p?.__key);

function fieldLabels(product={}){
  const cfg=product.personalizacao&&typeof product.personalizacao==='object'?product.personalizacao:{};
  const raw=cfg.campos&&typeof cfg.campos==='object'?cfg.campos:{};
  const labels=[];
  const defaults={nome:'Nome',foto:'Foto',logo:'Logo',endereco:'Endereço',telefone:'Telefone',site:'Site'};
  for(const id of Object.keys(defaults)){
    const item=raw[id];
    if(item?.ativo===true)labels.push(text(item.rotulo||item.label)||defaults[id]);
  }
  if(labels.length)return labels;
  const legacy=Array.isArray(product.personalizacao_campos)?product.personalizacao_campos:[];
  return legacy.filter(x=>x&&['nome','foto','logo','endereco','telefone','site'].includes(text(x.id).toLowerCase())).map(x=>text(x.rotulo||x.label)||defaults[text(x.id).toLowerCase()]).filter(Boolean);
}

function active(product={}){
  const cfg=product.personalizacao&&typeof product.personalizacao==='object'?product.personalizacao:{};
  if(typeof cfg.ativa==='boolean')return cfg.ativa;
  return product.personalizavel===true||product.loja_integrada_personalizavel===true||product.canecafacil_personalizavel===true||product.personalizacao_publica===true;
}

function summary(product={}){
  if(!active(product))return{label:'Não configurada',kind:'off'};
  const labels=fieldLabels(product);
  if(!labels.length)return{label:'Configuração incompleta',kind:'warn'};
  return{label:labels.join(' + '),kind:'on'};
}

function installStyles(){
  if($('#cfMugPersonalizationBadgeStyles'))return;
  const style=document.createElement('style');
  style.id='cfMugPersonalizationBadgeStyles';
  style.textContent=`.cf-mug-personalization{display:flex;align-items:center;gap:6px;min-height:28px;padding:6px 8px;border:1px solid #e4e6df;border-radius:9px;background:#fafbf8;color:#5f655e;font-size:10.5px;line-height:1.25}.cf-mug-personalization b{color:#30342f;font-size:10px;white-space:nowrap}.cf-mug-personalization[data-kind="on"]{border-color:#cfe4d4;background:#f5fbf6}.cf-mug-personalization[data-kind="warn"]{border-color:#ead9b5;background:#fffaf0}`;
  document.head.appendChild(style);
}

async function apply(){
  if(!location.hash.includes('mugs'))return;
  const root=$('#mugs');
  if(!root)return;
  const cards=$$('[data-grid-mug]',root);
  if(!cards.length)return;
  const products=await loadMugs();
  const byKey=new Map(products.map(p=>[productKey(p),p]));
  for(const card of cards){
    const product=byKey.get(text(card.dataset.gridMug));
    if(!product)continue;
    const info=summary(product);
    let badge=$('.cf-mug-personalization',card);
    if(!badge){
      badge=document.createElement('div');
      badge.className='cf-mug-personalization';
      const actions=$('.cf-mug-card-actions',card);
      if(actions)card.insertBefore(badge,actions);else card.appendChild(badge);
    }
    badge.dataset.kind=info.kind;
    badge.innerHTML=`<b>Personaliza:</b><span>${esc(info.label)}</span>`;
  }
}

window.addEventListener('admin-canecas:mugs-stable-rendered',()=>apply().catch(console.error));
window.addEventListener('admin-canecas:route',event=>{if(event.detail?.route==='mugs')queueMicrotask(()=>apply().catch(console.error));});
installStyles();
apply().catch(()=>{});
document.documentElement.dataset.cfMugPersonalizationBadge=BUILD;
