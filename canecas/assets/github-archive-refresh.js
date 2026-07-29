(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const CACHE_KEY = 'canecasGitHubArchiveCacheV1';
  const DELETED_KEY = 'canecasCatalogoArtesApagadasV1';
  let items = [];
  let page = 1;
  let busy = false;

  function $(selector,parent=document){return parent.querySelector(selector)}
  function $$(selector,parent=document){return [...parent.querySelectorAll(selector)]}
  function cleanPath(value=''){return String(value).replace(/^\/+|\/+$/g,'').replace(/\/{2,}/g,'/')}
  function settings(){
    let saved={};try{saved=JSON.parse(localStorage.getItem('canecasStudioSettings')||'{}')}catch{}
    return {owner:saved.owner||'osvaldosereia',repo:saved.repo||'SUCEDOAN12',branch:saved.branch||'main',folder:cleanPath(saved.folder||'canecas/imagens')};
  }
  function headers(){
    const token=sessionStorage.getItem('canecasGithubToken')||'';
    return {'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{'Authorization':`Bearer ${token}`}:{})};
  }
  function notify(message,type='ok'){
    const area=$('#toastArea');if(area){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;area.appendChild(el);setTimeout(()=>el.remove(),4300)}else console.log(message)
  }
  function deletedUrls(){try{return new Set(JSON.parse(localStorage.getItem(DELETED_KEY)||'[]'))}catch{return new Set()}}
  function normalizeUrl(value=''){try{const u=new URL(value,location.href);u.search='';u.hash='';return decodeURIComponent(u.href).toLowerCase()}catch{return String(value).toLowerCase()}}
  function rawUrl(item){const s=settings();return `https://raw.githubusercontent.com/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/${encodeURIComponent(s.branch)}/${item.path.split('/').map(encodeURIComponent).join('/')}`}
  function displayName(path){return path.split('/').pop().replace(/\.(png|jpe?g|webp)$/i,'').replace(/[-_]+/g,' ')}
  function mimeFromPath(path){return /\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':'image/jpeg'}

  function ensurePanel(){
    if($('#githubArchivePanel')) return true;
    const section=$('.archive-section');
    if(!section) return false;
    const head=$('.archive-head',section)||$('.card-head',section)||section.firstElementChild;
    if(head && !$('#refreshGithubArts',head)){
      const button=document.createElement('button');button.id='refreshGithubArts';button.type='button';button.className='btn secondary';button.textContent='↻ Atualizar artes criadas';button.onclick=()=>refresh(true);
      head.appendChild(button);
    }
    const panel=document.createElement('div');panel.id='githubArchivePanel';panel.className='github-archive-panel';panel.innerHTML=`
      <div class="github-archive-title"><div><strong>Artes encontradas no GitHub</strong><div class="muted-small">Carregamento paginado para não pesar o site.</div></div><span id="githubArchiveCount" class="badge">0</span></div>
      <div id="githubArchiveGrid" class="archive-grid"></div>
      <div id="githubArchiveEmpty" class="archive-empty">Clique em “Atualizar artes criadas” para buscar as imagens salvas pelo Make.</div>
      <div class="archive-pagination" id="githubArchivePagination" hidden><button class="btn small" id="githubPrev">← Anterior</button><span id="githubPageInfo"></span><button class="btn small" id="githubNext">Próxima →</button></div>`;
    const body=$('.card-body',section)||section;
    body.appendChild(panel);
    $('#githubPrev',panel).onclick=()=>{if(page>1){page--;render()}};
    $('#githubNext',panel).onclick=()=>{const pages=Math.ceil(items.length/PAGE_SIZE);if(page<pages){page++;render()}};
    loadCache();
    return true;
  }

  function loadCache(){
    try{
      const cached=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
      if(cached?.items?.length){items=cached.items;page=1;render()}
    }catch{}
  }

  async function refresh(force=false){
    if(busy)return;busy=true;
    const button=$('#refreshGithubArts');if(button){button.disabled=true;button.textContent='Atualizando...'}
    try{
      const s=settings();
      const endpoint=`https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/git/trees/${encodeURIComponent(s.branch)}?recursive=1`;
      const response=await fetch(endpoint,{headers:headers(),cache:force?'no-store':'default'});
      if(!response.ok)throw new Error(`GitHub respondeu HTTP ${response.status}`);
      const data=await response.json();
      const prefix=`${s.folder}/artes-geradas/`;
      items=(data.tree||[]).filter(entry=>entry.type==='blob'&&entry.path.startsWith(prefix)&&/\.(png|jpe?g|webp)$/i.test(entry.path)).sort((a,b)=>b.path.localeCompare(a.path));
      sessionStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),items}));
      page=1;render();notify(`${items.length} arte(s) carregada(s) do GitHub.`,'ok');
    }catch(error){notify(`Não foi possível atualizar as artes: ${error.message}`,'error')}
    finally{busy=false;if(button){button.disabled=false;button.textContent='↻ Atualizar artes criadas'}}
  }

  async function useArt(item,slot){
    const url=rawUrl(item);notify('Carregando a arte selecionada...');
    const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`Imagem respondeu HTTP ${response.status}`);
    const blob=await response.blob();const file=new File([blob],item.path.split('/').pop(),{type:blob.type||mimeFromPath(item.path)});
    const input=$(`#importArt${slot}`);if(!input)throw new Error(`O campo da arte ${slot} ainda não está disponível.`);
    const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    notify(`Arte aplicada na posição ${slot===1?'superior':'inferior'}.`,'ok');
  }

  function render(){
    const panel=$('#githubArchivePanel');if(!panel)return;
    const deleted=deletedUrls();
    const visible=items.filter(item=>!deleted.has(normalizeUrl(rawUrl(item))));
    const pages=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));page=Math.min(Math.max(1,page),pages);
    const current=visible.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
    $('#githubArchiveCount',panel).textContent=visible.length;
    $('#githubArchiveEmpty',panel).hidden=visible.length>0;
    const grid=$('#githubArchiveGrid',panel);
    grid.innerHTML=current.map((item,index)=>{
      const url=rawUrl(item);return `<article class="archive-item github-archive-item" data-path="${escapeHtml(item.path)}"><button class="archive-image-button" type="button" data-open-remote="${index}"><img loading="lazy" decoding="async" src="${escapeHtml(url)}" alt="${escapeHtml(displayName(item.path))}"></button><div class="archive-item-body"><div class="archive-item-title">${escapeHtml(displayName(item.path))}</div><div class="archive-tags"><span class="archive-tag">GitHub</span><span class="archive-tag">${escapeHtml(item.path.split('/').slice(-2,-1)[0]||'')}</span></div><div class="archive-actions"><button class="btn small" type="button" data-use-remote="${index}" data-slot="1">Usar em cima</button><button class="btn small" type="button" data-use-remote="${index}" data-slot="2">Usar embaixo</button></div></div></article>`
    }).join('');
    $$('[data-use-remote]',grid).forEach(button=>button.onclick=()=>useArt(current[Number(button.dataset.useRemote)],Number(button.dataset.slot)).catch(error=>notify(error.message,'error')));
    $$('[data-open-remote]',grid).forEach(button=>button.onclick=()=>window.open(rawUrl(current[Number(button.dataset.openRemote)]),'_blank','noopener'));
    const pagination=$('#githubArchivePagination',panel);pagination.hidden=visible.length<=PAGE_SIZE;$('#githubPageInfo',panel).textContent=`Página ${page} de ${pages}`;$('#githubPrev',panel).disabled=page<=1;$('#githubNext',panel).disabled=page>=pages;
  }

  function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}

  const observer=new MutationObserver(()=>ensurePanel());observer.observe(document.documentElement,{childList:true,subtree:true});setInterval(ensurePanel,1000);
})();
