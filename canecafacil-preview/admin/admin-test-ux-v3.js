(() => {
  'use strict';

  const BUILD='20260904-canecafacil-admin-test-ux-v3.1';
  const FIREBASE_BASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const ROOT='canecafacil_v2';
  const LOCAL_CATEGORIES_KEY='cf_preview_local_categories_v3';
  const DEFAULT_CATEGORY={id:'geral',nome:'Geral',ordem:0,subcategorias:{}};
  const COLORS=[
    '#FF6B1A','#FF7A59','#F36F61','#EF79A8','#FF9FC4','#F4CB49',
    '#FFD76A','#4F8FD6','#69A7F0','#4FC8C3','#69D8D1','#8BD4B0',
    '#A7E1C6','#B9A0E3','#C8B4F0','#F2C49D','#FFD1B3','#E66A6A',
    '#D94F70','#7D8CEB','#4AAE8A','#A9D45E','#F09D51','#8D73C9'
  ];
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const text=v=>String(v??'').trim();
  const safeKey=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||`cat-${Date.now().toString(36)}`;
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function toast(message,error=false){const el=$('#toast');if(!el)return;el.textContent=message;el.className=`toast${error?' error':''}`;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,error?5200:2800)}
  function localCategories(){try{const raw=JSON.parse(localStorage.getItem(LOCAL_CATEGORIES_KEY)||'{}');return raw&&typeof raw==='object'?raw:{}}catch{return{}}}
  function saveLocalCategories(map){try{localStorage.setItem(LOCAL_CATEGORIES_KEY,JSON.stringify(map||{}))}catch{}}
  async function firebasePut(path,value){const r=await fetch(`${FIREBASE_BASE}/${path}.json`,{method:'PUT',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(value)});if(!r.ok)throw new Error(`Firebase ${r.status}`);return r.json().catch(()=>null)}

  function categoryNamesFromDom(){const names=new Set();$$('#categoryList [data-cat-name]').forEach(i=>{if(text(i.value))names.add(text(i.value))});['#generatorCategory','#editorCategory'].forEach(sel=>$$(`${sel} option`).forEach(o=>{if(text(o.value))names.add(text(o.value))}));Object.values(localCategories()).forEach(c=>{if(text(c?.nome))names.add(text(c.nome))});return names}

  function ensureDefaultOption(select){
    if(!select)return;
    if(![...select.options].some(o=>o.value===DEFAULT_CATEGORY.nome)) select.appendChild(new Option(DEFAULT_CATEGORY.nome,DEFAULT_CATEGORY.nome));
    const hasReal=[...select.options].some(o=>text(o.value));
    if(!hasReal||!text(select.value)) select.value=DEFAULT_CATEGORY.nome;
  }

  function renderLocalCategoryCards(){
    const root=$('#categoryList');if(!root)return;
    const existing=new Set($$('[data-category-card]',root).map(c=>text(c.querySelector('[data-cat-name]')?.value)));
    const localCardNames=new Set($$('.cf-local-category',root).map(c=>text(c.dataset.localName)));
    const locals=Object.entries(localCategories()).map(([id,c])=>({id,nome:text(c?.nome)||id,ordem:Number(c?.ordem)||0}));
    if(!locals.length&&!existing.has(DEFAULT_CATEGORY.nome)&&!localCardNames.has(DEFAULT_CATEGORY.nome)) locals.push(DEFAULT_CATEGORY);
    locals.filter(c=>!existing.has(c.nome)&&!localCardNames.has(c.nome)).forEach(c=>{
      const card=document.createElement('article');card.className='category-card cf-local-category';card.dataset.localName=c.nome;
      card.innerHTML=`<div class="category-main"><label class="field-mini">Nome<input value="${esc(c.nome)}" readonly></label><label class="field-mini">Ordem<input value="${c.ordem}" readonly></label><span class="cf-local-badge">${c.id==='geral'?'PADRÃO':'LOCAL'}</span></div><div class="sub-list"><small>Disponível para testar o gerador. As categorias criadas normalmente continuam tentando salvar no Firebase.</small></div>`;
      root.prepend(card);
    });
  }

  function refreshCategoryFallback(){
    ensureDefaultOption($('#generatorCategory'));
    ensureDefaultOption($('#editorCategory'));
    renderLocalCategoryCards();
    const g=$('#generatorCategory');if(g&&!text(g.value))g.value=DEFAULT_CATEGORY.nome;
    const sub=$('#generatorSubcategory');if(sub&&!sub.options.length)sub.innerHTML='<option value="">Sem subcategoria</option>';
  }

  async function createCategoryResilient(event){
    const form=event.target;if(form?.id!=='newCategoryForm')return;
    event.preventDefault();event.stopImmediatePropagation();
    const fd=new FormData(form),nome=text(fd.get('nome')),ordem=Number(fd.get('ordem'))||0;
    if(!nome)return toast('Informe o nome da categoria.',true);
    if([...categoryNamesFromDom()].some(n=>n.toLocaleLowerCase('pt-BR')===nome.toLocaleLowerCase('pt-BR')))return toast('Essa categoria já existe.',true);
    const id=safeKey(nome),record={nome,ordem,subcategorias:{},atualizado_em:new Date().toISOString()};
    try{
      await firebasePut(`${ROOT}/categorias/${id}`,record);
      toast('Categoria criada no Firebase.');form.reset();form.elements.ordem.value=0;
      setTimeout(()=>$('#reloadBtn')?.click(),120);
    }catch(err){
      const map=localCategories();map[id]=record;saveLocalCategories(map);form.reset();form.elements.ordem.value=0;
      refreshCategoryFallback();
      [150,500,1200].forEach(ms=>setTimeout(refreshCategoryFallback,ms));
      toast('Categoria criada para teste neste navegador. O Firebase recusou a gravação; o gerador não ficará bloqueado.',false);
      console.warn('[CanecaFácil] categoria fallback local:',err);
    }
  }

  function installPaletteForForm(form){
    if(!form||form.querySelector('.cf-color-suggestions'))return;
    const field=form.elements?.fundo_text?.closest('label')||form.elements?.fundo?.closest('label');if(!field)return;
    const wrap=document.createElement('div');wrap.className='cf-color-suggestions';
    wrap.innerHTML=`<div class="cf-color-label"><strong>Cores sugeridas</strong><small>${COLORS.length} opções</small></div><div class="cf-color-grid">${COLORS.map(color=>`<button type="button" class="cf-color-swatch" data-color="${color}" title="${color}" style="--sw:${color}" aria-label="Usar ${color}"></button>`).join('')}</div>`;
    field.appendChild(wrap);
    wrap.addEventListener('click',e=>{
      const b=e.target.closest('[data-color]');if(!b)return;const color=b.dataset.color;
      if(form.elements.fundo)form.elements.fundo.value=color;
      if(form.elements.fundo_text)form.elements.fundo_text.value=color;
      form.elements.fundo?.dispatchEvent(new Event('input',{bubbles:true}));
      form.elements.fundo_text?.dispatchEvent(new Event('input',{bubbles:true}));
      $$('.cf-color-swatch',wrap).forEach(x=>x.classList.toggle('selected',x===b));
    });
  }

  function enhanceCommandText(){
    const section=$('#cfCommandLibrary');if(!section)return;
    const head=section.querySelector('.cf-command-head small');
    const desired='Crie, salve e selecione comandos reutilizáveis. Eles ficam disponíveis nas próximas gerações, como no Admin Canecas.';
    if(head&&head.textContent!==desired)head.textContent=desired;
    const save=$('#cfCommandSave');if(save&&!save.textContent.includes('alteração')&&save.textContent!=='Salvar comando para reutilizar')save.textContent='Salvar comando para reutilizar';
  }

  function installStyles(){if($('#cfAdminTestUxV3Styles'))return;const style=document.createElement('style');style.id='cfAdminTestUxV3Styles';style.textContent=`
    .cf-color-suggestions{margin-top:6px;display:grid;gap:6px}.cf-color-label{display:flex;align-items:center;justify-content:space-between;gap:10px}.cf-color-label strong{font-size:9px}.cf-color-label small{font-size:8px;color:var(--muted,#777);font-weight:600}.cf-color-grid{display:grid;grid-template-columns:repeat(12,18px);gap:5px}.cf-color-swatch{width:18px;height:18px;min-width:18px;padding:0;border-radius:5px;border:1px solid rgba(0,0,0,.12);background:var(--sw);box-shadow:0 0 0 1px rgba(255,255,255,.65) inset}.cf-color-swatch:hover{transform:scale(1.12)}.cf-color-swatch.selected{outline:2px solid #111;outline-offset:2px}.cf-local-category{border-style:dashed!important}.cf-local-badge{align-self:end;justify-self:start;font-size:8px;font-weight:900;letter-spacing:.09em;padding:6px 8px;border-radius:999px;background:#f0f0ec;color:#666}.cf-local-category .sub-list small{font-size:9px;color:var(--muted,#777)}
    @media(max-width:600px){.cf-color-grid{grid-template-columns:repeat(8,18px);gap:5px}}
  `;document.head.appendChild(style)}

  function enhanceOnce(){
    refreshCategoryFallback();
    installPaletteForForm($('#generatorForm'));
    installPaletteForForm($('#productForm'));
    enhanceCommandText();
  }

  function boot(){
    installStyles();
    document.addEventListener('submit',createCategoryResilient,true);
    enhanceOnce();
    [80,250,650,1400,2800].forEach(ms=>setTimeout(enhanceOnce,ms));
    document.documentElement.dataset.adminTestUx=BUILD;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
