const HOST_ID='adminInventoryV2';
const LINKS=[
  {href:'../contagem/',title:'Balanço rápido',detail:'Leitura direta ou leitura + quantidade. As gravações continuam no fluxo atual do balanço.'},
  {href:'./gondolas.html',title:'Gôndolas',detail:'Organize produtos por gôndola usando o leitor EAN já existente.'},
  {href:'#products',title:'Estoque e validade',detail:'Revise estoque, validade, gôndola e prateleira na ficha do produto.'}
];
function markup(){return `<section id="${HOST_ID}" class="da-inventory-hub panel" aria-labelledby="adminInventoryTitle"><div class="da-inventory-head"><div><span class="da-eyebrow">OPERAÇÃO DE ESTOQUE</span><h2 id="adminInventoryTitle">Conferência física</h2><p>Escolha a ferramenta certa. Nenhuma ação é executada ao abrir estes atalhos.</p></div><span class="da-inventory-badge">3 fluxos</span></div><div class="da-inventory-links">${LINKS.map(x=>`<a class="da-inventory-link" href="${x.href}"><strong>${x.title}</strong><span>${x.detail}</span><b>Abrir →</b></a>`).join('')}</div><p class="da-inventory-note">Alterações de estoque só acontecem dentro do fluxo escolhido e continuam usando as confirmações e contratos existentes.</p></section>`}
function enhance(){const app=document.getElementById('app');if(!app||location.hash!=='#products')return;if(document.getElementById(HOST_ID))return;const head=app.querySelector('.page-head');if(!head)return;head.insertAdjacentHTML('afterend',markup())}
const observer=new MutationObserver(enhance);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>queueMicrotask(enhance));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
