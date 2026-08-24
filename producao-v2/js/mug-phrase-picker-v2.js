const BUILD='20260824-mug-phrase-catalogs-v4';
const PAGE_SIZE = 20;
const CONFIG_URL=new URL('../data/canecas/catalogos/catalogos-frases-v1.json',import.meta.url).href;
const LEGACY_URL = new URL('../data/canecas/frases-canecas-v1.json', import.meta.url).href;
const T=Object.freeze(["{a}: {v1}, {v2} e boas histórias.","Meu combo favorito: {a}, {v1} e {v2}.","{a} com uma dose extra de {v1}.","Se tem {a}, tem {v1} por perto.","{a}: onde {v1} encontra {v2}.","Entre {v1} e {v2}, eu fico com {a}.","Que nunca falte {v1} quando houver {a}.","{a}: feito de {v1} e {v2}.","Mais {a}. Mais {v1}. Menos complicação.","Minha rotina combina com {a} e {v1}.","{a}, {v1} e uma boa história.","Meu plano: {a}, {v1} e {v2}.","Hoje eu escolho {a} com {v1}.","A vida pede {a}, {v1} e um pouco de {v2}.","Se for para viver, que tenha {a} e {v1}.","{a} combina muito bem com {v1} e {v2}.","Tem dias em que tudo que preciso é {a} e {v1}.","Colecionando {a}, {v1} e bons momentos.","{a} primeiro; depois, {v1}. O resto a gente resolve.","Minha versão favorita do dia inclui {a} e {v1}."]);
let configPromise=null,legacyPromise=null;
const catalogCache=new Map();

const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const cap=v=>{v=String(v||'');return v?v[0].toUpperCase()+v.slice(1):v;};
const slug=v=>norm(v).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

async function fetchJson(url){
  const r=await fetch(url,{ cache: 'force-cache', headers: { Accept: 'application/json' } });
  if(!r.ok)throw new Error(`Frases indisponíveis (HTTP ${r.status}).`);
  return r.json();
}
async function getConfig(){
  if(!configPromise)configPromise=fetchJson(CONFIG_URL).catch(e=>{configPromise=null;throw e;});
  return configPromise;
}
async function getLegacy(){
  if(!legacyPromise)legacyPromise=fetchJson(LEGACY_URL).catch(e=>{legacyPromise=null;throw e;});
  return legacyPromise;
}
function validateConfig(d){
  if(!d||d.v!==1||d.tc!==24||d.tf!==4800||!Array.isArray(d.c)||d.c.length!==24)throw new Error('Catálogos compactos inválidos.');
  return d;
}
function metas(d){
  const base=[
    {id:'religiosas',nome:'Religiosas',grupo:'Fé e inspiração',total:200,legacy:'religiosas'},
    {id:'motivacionais',nome:'Motivacionais',grupo:'Fé e inspiração',total:200,legacy:'motivacionais'}
  ];
  return base.concat(d.c.map(c=>({id:c[0],nome:c[1],grupo:c[2],total:200,compact:c})));
}
function renderTemplate(t,a,v1,v2){
  return cap(t.replaceAll('{a}',a).replaceAll('{v1}',v1).replaceAll('{v2}',v2));
}
function expand(meta){
  if(catalogCache.has(meta.id))return catalogCache.get(meta.id);
  const c=meta.compact,anchors=c?.[3],values=c?.[4];
  if(!Array.isArray(anchors)||anchors.length!==10||!Array.isArray(values)||values.length<8)throw new Error(`Catálogo ${meta.nome} incompleto.`);
  const frases=[],categorias=[];
  anchors.forEach((a,j)=>{
    const inicio=frases.length+1;
    T.forEach((t,k)=>{
      const v1=values[(j*3+k)%values.length];
      let x=(j*5+k*2+1)%values.length,v2=values[x];
      if(v2===v1)v2=values[(x+1)%values.length];
      frases.push(renderTemplate(t,a,v1,v2));
    });
    categorias.push({id:slug(a),nome:cap(a),inicio,fim:frases.length});
  });
  const out={id:meta.id,nome:meta.nome,total:frases.length,categorias,frases};
  if(out.total!==200||new Set(frases).size!==200)throw new Error(`Catálogo ${meta.nome} inválido.`);
  catalogCache.set(meta.id,out);return out;
}
async function getCatalog(meta){
  if(meta.compact)return expand(meta);
  if(catalogCache.has(meta.id))return catalogCache.get(meta.id);
  const d=await getLegacy(),s=d?.listas?.find(x=>x?.id===meta.legacy);
  if(!s||!Array.isArray(s.frases)||s.frases.length!==200)throw new Error(`Catálogo ${meta.nome} inválido.`);
  const out={id:meta.id,nome:meta.nome,total:200,categorias:s.categorias||[],frases:s.frases};
  catalogCache.set(meta.id,out);return out;
}
function catFor(c,i){
  const n=i+1;return c.categorias.find(x=>n>=Number(x.inicio)&&n<=Number(x.fim))?.id||'';
}

function styles(){
  if(document.getElementById('mugPhraseLazyStyles'))return;
  const s=document.createElement('style');s.id='mugPhraseLazyStyles';s.textContent=`
  .mug-phrase-open{width:100%;margin-top:7px!important}#mugPhraseDialog{width:min(840px,calc(100vw - 28px));max-height:min(790px,calc(100vh - 28px));padding:0;border:0;border-radius:18px;box-shadow:0 22px 70px rgba(0,0,0,.28);overflow:hidden;background:#fff;color:#20231f}#mugPhraseDialog::backdrop{background:rgba(16,18,16,.48)}.mug-phrase-shell{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;max-height:min(790px,calc(100vh - 28px))}.mug-phrase-head{display:flex;justify-content:space-between;gap:12px;padding:16px 18px 12px;border-bottom:1px solid #e7e9e4}.mug-phrase-head h3{margin:0;font-size:20px}.mug-phrase-head p{margin:4px 0 0;color:#6b7068;font-size:12px}.mug-phrase-close{border:0;background:#f0f2ed;border-radius:10px;min-width:34px;height:34px;font-size:20px;cursor:pointer}.mug-phrase-controls{display:grid;grid-template-columns:1.2fr 1fr 1.4fr;gap:8px;padding:12px 18px;border-bottom:1px solid #eef0eb}.mug-phrase-controls select,.mug-phrase-controls input{width:100%;box-sizing:border-box;border:1px solid #ccd1c8;border-radius:10px;background:#fff;padding:9px 10px;font:inherit;font-size:12px}.mug-phrase-body{min-height:260px;overflow:auto;padding:12px 18px}.mug-phrase-status{font-size:11px;color:#6c7169;margin-bottom:8px}.mug-phrase-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.mug-phrase-item{border:1px solid #e0e3dc;background:#fafbf8;border-radius:11px;padding:9px 10px;text-align:left;cursor:pointer;font:inherit;font-size:12px;line-height:1.3;color:#20231f;min-height:48px}.mug-phrase-empty{grid-column:1/-1;padding:30px 10px;text-align:center;color:#747a71;border:1px dashed #d7dbd2;border-radius:12px}.mug-phrase-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px 14px;border-top:1px solid #eef0eb}.mug-phrase-page{display:flex;align-items:center;gap:7px}.mug-phrase-page button,.mug-phrase-retry{border:1px solid #d3d7cf;background:#fff;border-radius:8px;padding:6px 9px;cursor:pointer}.mug-phrase-page button:disabled{opacity:.4}.mug-phrase-page-label,.mug-phrase-applied{font-size:10.5px;color:#666c64}@media(max-width:620px){.mug-phrase-controls,.mug-phrase-results{grid-template-columns:1fr}.mug-phrase-head,.mug-phrase-controls,.mug-phrase-foot{padding-left:12px;padding-right:12px}}`;
  document.head.appendChild(s);
}
function makeDialog(){
  let d=document.getElementById('mugPhraseDialog');if(d)return d;
  d=document.createElement('dialog');d.id='mugPhraseDialog';d.innerHTML=`<div class="mug-phrase-shell"><header class="mug-phrase-head"><div><h3>Frases para a arte</h3><p>5.200 frases em 26 catálogos. Só 20 aparecem por página.</p></div><button class="mug-phrase-close" type="button">×</button></header><div class="mug-phrase-controls" hidden><select id="mugPhraseCatalog"></select><select id="mugPhraseCategory"></select><input id="mugPhraseSearch" type="search" placeholder="Buscar neste catálogo..." autocomplete="off"></div><div class="mug-phrase-body"><div class="mug-phrase-status">Os catálogos serão carregados somente agora.</div><div class="mug-phrase-results"><div class="mug-phrase-empty">Carregando catálogos…</div></div></div><footer class="mug-phrase-foot"><span class="mug-phrase-applied">Clique em uma frase para aplicar.</span><div class="mug-phrase-page" hidden><button type="button" data-prev>←</button><span class="mug-phrase-page-label">1/1</span><button type="button" data-next>→</button></div></footer></div>`;
  d._s={config:null,metas:[],catalog:null,catalogId:'religiosas',category:'all',query:'',page:0,filtered:[],panel:null,token:0,timer:null};
  d.querySelector('.mug-phrase-close').onclick=()=>d.close();
  d.addEventListener('cancel',e=>{e.preventDefault();d.close();});
  d.querySelector('#mugPhraseCatalog').onchange=e=>{const s=d._s;s.catalogId=e.target.value;s.category='all';s.query='';s.page=0;d.querySelector('#mugPhraseSearch').value='';loadSelected(d);};
  d.querySelector('#mugPhraseCategory').onchange=e=>{d._s.category=e.target.value;d._s.page=0;render(d);};
  d.querySelector('#mugPhraseSearch').oninput=e=>{clearTimeout(d._s.timer);d._s.timer=setTimeout(()=>{d._s.query=e.target.value;d._s.page=0;render(d);},120);};
  d.querySelector('[data-prev]').onclick=()=>{d._s.page=Math.max(0,d._s.page-1);render(d);};
  d.querySelector('[data-next]').onclick=()=>{d._s.page++;render(d);};
  d.querySelector('.mug-phrase-results').onclick=e=>{const b=e.target.closest('[data-result]');if(!b)return;const it=d._s.filtered[Number(b.dataset.result)],f=d._s.panel?.querySelector('#mugv7Instruction');if(!it||!f)return;f.value=it.phrase;f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));d.querySelector('.mug-phrase-applied').textContent=`Aplicada: ${it.phrase}`;d.close();};
  document.body.appendChild(d);return d;
}
function renderMeta(d){
  const s=d._s,sel=d.querySelector('#mugPhraseCatalog'),groups=new Map();
  s.metas.forEach(m=>{if(!groups.has(m.grupo))groups.set(m.grupo,[]);groups.get(m.grupo).push(m);});
  sel.innerHTML=[...groups].map(([g,a])=>`<optgroup label="${esc(g)}">${a.map(m=>`<option value="${esc(m.id)}">${esc(m.nome)} · 200</option>`).join('')}</optgroup>`).join('');sel.value=s.catalogId;
}
function renderCats(d){
  const s=d._s,sel=d.querySelector('#mugPhraseCategory');sel.innerHTML='<option value="all">Todas as categorias</option>'+s.catalog.categorias.map(c=>`<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');sel.value=s.category;
}
function render(d){
  const s=d._s,c=s.catalog;if(!c)return;const q=norm(s.query);
  s.filtered=c.frases.map((phrase,index)=>({phrase,index})).filter(x=>s.category==='all'||catFor(c,x.index)===s.category).filter(x=>!q||norm(x.phrase).includes(q));
  const pages=Math.max(1,Math.ceil(s.filtered.length/PAGE_SIZE));s.page=Math.min(Math.max(0,s.page),pages-1);const start=s.page*PAGE_SIZE,current=s.filtered.slice(start, start + PAGE_SIZE);
  d.querySelector('.mug-phrase-status').textContent=`${c.nome} · ${s.filtered.length} frases · máximo ${PAGE_SIZE} por página.`;
  d.querySelector('.mug-phrase-results').innerHTML=current.length?current.map((x,o)=>`<button class="mug-phrase-item" type="button" data-result="${start+o}"><strong>${String(x.index+1).padStart(3,'0')} ·</strong> ${esc(x.phrase)}</button>`).join(''):'<div class="mug-phrase-empty">Nenhuma frase encontrada.</div>';
  const p=d.querySelector('.mug-phrase-page');p.hidden=s.filtered.length<=PAGE_SIZE;p.querySelector('.mug-phrase-page-label').textContent=`${s.page+1}/${pages}`;p.querySelector('[data-prev]').disabled=s.page===0;p.querySelector('[data-next]').disabled=s.page>=pages-1;
}
async function loadSelected(d){
  const s=d._s,m=s.metas.find(x=>x.id===s.catalogId)||s.metas[0],token=++s.token,r=d.querySelector('.mug-phrase-results');s.catalog=null;r.innerHTML='<div class="mug-phrase-empty">Preparando 200 frases…</div>';
  try{const c=await getCatalog(m);if(token!==s.token)return;s.catalog=c;s.category='all';s.page=0;renderCats(d);render(d);}catch(e){r.innerHTML=`<div class="mug-phrase-empty">${esc(e.message||e)}<br><br><button class="mug-phrase-retry">Tentar novamente</button></div>`;r.querySelector('.mug-phrase-retry')?.addEventListener('click',()=>loadSelected(d),{once:true});}
}
async function load(d){
  const s=d._s;if(!s.config){try{s.config=validateConfig(await getConfig());s.metas=metas(s.config);renderMeta(d);d.querySelector('.mug-phrase-controls').hidden=false;}catch(e){d.querySelector('.mug-phrase-results').innerHTML=`<div class="mug-phrase-empty">${esc(e.message||e)}</div>`;return;}}await loadSelected(d);
}
function openLibrary(panel){const dialog=makeDialog();dialog._s.panel=panel;if(!dialog.open)dialog.showModal();load(dialog);}
function install(panel){
  if(!panel?.classList.contains('mugv7')||panel.dataset.phraseLazyBuild===BUILD)return false;const box=panel.querySelector('.mugv7-instruction');if(!box)return false;styles();panel.dataset.phraseLazyBuild=BUILD;const openButton=document.createElement('button');openButton.type='button';openButton.className='button secondary compact mug-phrase-open';openButton.textContent='Frases para a arte · 5.200';openButton.title='Abrir 26 catálogos de 200 frases';openButton.addEventListener('click', () => openLibrary(panel));box.appendChild(openButton);return true;
}
function activate(n=0){if(window.adminV2CurrentRoute?.()!=='mug-studio')return;const p=document.getElementById('mugAutomationPanel');if(install(p))return;if(n<20)setTimeout(()=>activate(n+1),100);}
window.addEventListener('admin-v2-route-ready',e=>{if(e.detail?.route==='mug-studio')setTimeout(()=>activate(),0);});
window.addEventListener('admin-v2-route',e=>{if(e.detail?.route==='mug-studio')setTimeout(()=>activate(),0);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>activate(),0),{once:true});else setTimeout(()=>activate(),0);
export{install,openLibrary,getCatalog,expand};
