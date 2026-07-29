(() => {
  'use strict';

  const scriptUrl = document.currentScript?.src || location.href;
  const DATA_URL = new URL('../data/frases.json?v=20260729-5', scriptUrl).href;
  const DELETED_KEY = 'canecasCatalogoArtesApagadasV1';
  const PAGE_SIZE = 30;

  let catalogData = null;
  let activeSlot = 1;
  let phrasePage = 1;
  let scanTimer = null;

  function $(selector, parent=document){ return parent.querySelector(selector); }
  function $$(selector, parent=document){ return [...parent.querySelectorAll(selector)]; }

  function notify(message, type='ok'){
    const area = $('#toastArea');
    if(area){
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.textContent = message;
      area.appendChild(el);
      setTimeout(() => el.remove(), 4300);
      return;
    }
    console.log(message);
  }

  function normalizeUrl(value=''){
    try{
      const url = new URL(value, location.href);
      url.search = '';
      url.hash = '';
      return decodeURIComponent(url.href).toLowerCase();
    }catch{
      return String(value).split(/[?#]/)[0].toLowerCase();
    }
  }

  function getDeletedSet(){
    try{ return new Set(JSON.parse(localStorage.getItem(DELETED_KEY) || '[]')); }
    catch{ return new Set(); }
  }

  function saveDeletedSet(set){
    localStorage.setItem(DELETED_KEY, JSON.stringify([...set].slice(-2000)));
  }

  function dispatchValue(element, value){
    if(!element) return;
    element.value = value;
    element.dispatchEvent(new Event('input', {bubbles:true}));
    element.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function injectStyles(){
    if($('#canecasEnhancementStyles')) return;
    const style = document.createElement('style');
    style.id = 'canecasEnhancementStyles';
    style.textContent = `
      .phrase-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
      .phrase-tools .btn{min-height:36px;padding:7px 11px}
      .phrase-help{font-size:11px;color:var(--muted)}
      .element-picker{margin-bottom:8px}
      .phrase-dialog{width:min(980px,calc(100vw - 24px));max-width:980px}
      .phrase-dialog .dialog-body{max-height:76vh}
      .phrase-filter-grid{display:grid;grid-template-columns:minmax(220px,1.6fr) repeat(2,minmax(150px,1fr));gap:10px}
      .phrase-filter-grid input[type=search]{width:100%;border:1px solid #dcd1c7;background:#fff;color:var(--ink);border-radius:11px;padding:10px 11px}
      .phrase-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
      .phrase-option{border:1px solid var(--line);border-radius:12px;background:#fff;padding:12px;text-align:left;cursor:pointer;transition:.15s}
      .phrase-option:hover{border-color:#b88770;box-shadow:0 7px 18px rgba(60,40,25,.08);transform:translateY(-1px)}
      .phrase-option strong{display:block;font-size:14px;line-height:1.35}
      .phrase-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
      .phrase-tag{font-size:10px;font-weight:750;border-radius:999px;background:#f0e8e2;color:var(--brand);padding:4px 7px}
      .phrase-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}
      .archive-delete{background:#fff0ef!important;color:var(--danger)!important;border:1px solid #f2c8c5!important}
      .archive-actions.has-delete{grid-template-columns:1fr 1fr auto}
      @media(max-width:680px){
        .phrase-filter-grid,.phrase-list{grid-template-columns:1fr}
        .phrase-footer{align-items:stretch;flex-direction:column}
        .archive-actions.has-delete{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  async function loadCatalogData(){
    if(catalogData) return catalogData;
    const response = await fetch(DATA_URL, {cache:'no-store'});
    if(!response.ok) throw new Error(`Não foi possível carregar as frases: HTTP ${response.status}`);
    const raw = await response.json();
    if(Array.isArray(raw.temas) && raw.temas.length && Array.isArray(raw.temas[0]?.frases)){
      let id = 1;
      const styles = raw.estilos || [];
      const expanded = [];
      raw.temas.forEach((group, themeIndex) => {
        (group.frases || []).forEach((phrase, phraseIndex) => {
          expanded.push({
            id:id++,
            frase:phrase,
            tema:group.tema,
            estilo:styles[(themeIndex * 3 + phraseIndex) % Math.max(1, styles.length)] || 'Estilo livre',
            elementoSugerido:group.elementoSugerido || ''
          });
        });
      });
      catalogData = {
        ...raw,
        temas:raw.temas.map(group => group.tema),
        frases:expanded
      };
    }else{
      catalogData = raw;
    }
    return catalogData;
  }

  function ensurePhraseDialog(){
    let dialog = $('#phraseLibraryDialog');
    if(dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'phraseLibraryDialog';
    dialog.className = 'phrase-dialog';
    dialog.innerHTML = `
      <div class="dialog-head">
        <div>
          <h2>Escolher frase principal</h2>
          <div class="muted-small">300 sugestões organizadas por tema e estilo. Clique em uma frase para aplicá-la.</div>
        </div>
        <button class="close-x" type="button" data-close-phrase>×</button>
      </div>
      <div class="dialog-body">
        <div class="phrase-filter-grid">
          <label class="field">Pesquisar
            <input id="phraseSearch" type="search" placeholder="Digite uma palavra da frase...">
          </label>
          <label class="field">Tema
            <select id="phraseTheme"><option value="">Todos os temas</option></select>
          </label>
          <label class="field">Estilo
            <select id="phraseStyle"><option value="">Todos os estilos</option></select>
          </label>
        </div>
        <div id="phraseResultCount" class="muted-small" style="margin-top:11px"></div>
        <div id="phraseList" class="phrase-list"></div>
        <div class="phrase-footer">
          <button class="btn" id="phrasePrev" type="button">← Anterior</button>
          <span id="phrasePageInfo" class="muted-small"></span>
          <button class="btn" id="phraseNext" type="button">Próxima →</button>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn" type="button" data-close-phrase>Fechar</button>
      </div>
    `;
    document.body.appendChild(dialog);
    $$('[data-close-phrase]', dialog).forEach(button => button.onclick = () => dialog.close());
    ['phraseSearch','phraseTheme','phraseStyle'].forEach(id => {
      $(`#${id}`, dialog).addEventListener('input', () => { phrasePage = 1; renderPhraseList(); });
    });
    $('#phrasePrev', dialog).onclick = () => { if(phrasePage > 1){ phrasePage--; renderPhraseList(); } };
    $('#phraseNext', dialog).onclick = () => { phrasePage++; renderPhraseList(); };
    return dialog;
  }

  async function openPhraseLibrary(slot){
    activeSlot = slot;
    phrasePage = 1;
    const data = await loadCatalogData();
    const dialog = ensurePhraseDialog();
    const theme = $('#phraseTheme', dialog);
    const style = $('#phraseStyle', dialog);
    if(theme.options.length === 1){
      data.temas.forEach(value => theme.add(new Option(value, value)));
      data.estilos.forEach(value => style.add(new Option(value, value)));
    }
    const currentTheme = $(`#a${slot}Theme`)?.value || '';
    const currentStyle = $(`#a${slot}Style`)?.value || '';
    theme.value = data.temas.includes(currentTheme) ? currentTheme : '';
    style.value = data.estilos.includes(currentStyle) ? currentStyle : '';
    $('#phraseSearch', dialog).value = '';
    renderPhraseList();
    dialog.showModal();
  }

  function filteredPhrases(){
    const dialog = ensurePhraseDialog();
    const search = ($('#phraseSearch', dialog).value || '').trim().toLocaleLowerCase('pt-BR');
    const theme = $('#phraseTheme', dialog).value;
    const style = $('#phraseStyle', dialog).value;
    return (catalogData?.frases || []).filter(item => {
      if(theme && item.tema !== theme) return false;
      if(style && item.estilo !== style) return false;
      if(search){
        const haystack = `${item.frase} ${item.tema} ${item.estilo} ${item.elementoSugerido || ''}`.toLocaleLowerCase('pt-BR');
        if(!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function renderPhraseList(){
    const dialog = ensurePhraseDialog();
    const items = filteredPhrases();
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    phrasePage = Math.min(Math.max(1, phrasePage), pages);
    const start = (phrasePage - 1) * PAGE_SIZE;
    const pageItems = items.slice(start, start + PAGE_SIZE);
    $('#phraseResultCount', dialog).textContent = `${items.length} frase(s) encontrada(s)`;
    $('#phrasePageInfo', dialog).textContent = `Página ${phrasePage} de ${pages}`;
    $('#phrasePrev', dialog).disabled = phrasePage <= 1;
    $('#phraseNext', dialog).disabled = phrasePage >= pages;
    const list = $('#phraseList', dialog);
    list.innerHTML = pageItems.map(item => `
      <button class="phrase-option" type="button" data-phrase-id="${item.id}">
        <strong>${escapeHtml(item.frase)}</strong>
        <div class="phrase-tags">
          <span class="phrase-tag">${escapeHtml(item.tema)}</span>
          <span class="phrase-tag">${escapeHtml(item.estilo)}</span>
        </div>
      </button>
    `).join('') || '<div class="archive-empty" style="grid-column:1/-1">Nenhuma frase encontrada.</div>';
    $$('[data-phrase-id]', list).forEach(button => {
      button.onclick = () => {
        const item = catalogData.frases.find(value => String(value.id) === button.dataset.phraseId);
        if(!item) return;
        dispatchValue($(`#a${activeSlot}Phrase`), item.frase);
        const themeSelect = $(`#a${activeSlot}Theme`);
        const styleSelect = $(`#a${activeSlot}Style`);
        if(themeSelect && [...themeSelect.options].some(o => o.value === item.tema)) dispatchValue(themeSelect, item.tema);
        if(styleSelect && [...styleSelect.options].some(o => o.value === item.estilo)) dispatchValue(styleSelect, item.estilo);
        const elementInput = $(`#a${activeSlot}Element`);
        if(elementInput && !elementInput.value.trim()) dispatchValue(elementInput, item.elementoSugerido || '');
        dialog.close();
        notify('Frase aplicada à arte.', 'ok');
      };
    });
  }

  async function enhancePromptFields(){
    const data = await loadCatalogData();
    for(const slot of [1,2]){
      const phrase = $(`#a${slot}Phrase`);
      if(phrase && !phrase.dataset.phraseEnhanced){
        phrase.dataset.phraseEnhanced = '1';
        const tools = document.createElement('div');
        tools.className = 'phrase-tools';
        tools.innerHTML = `
          <button class="btn secondary small" type="button">📚 Escolher entre 300 frases</button>
          <span class="phrase-help">Você também pode escrever ou editar livremente no campo acima.</span>
        `;
        tools.querySelector('button').onclick = () => openPhraseLibrary(slot).catch(error => notify(error.message, 'error'));
        phrase.insertAdjacentElement('afterend', tools);
      }

      const element = $(`#a${slot}Element`);
      if(element && !element.dataset.elementEnhanced){
        element.dataset.elementEnhanced = '1';
        element.placeholder = 'Escolha acima ou escreva seu próprio elemento';
        const select = document.createElement('select');
        select.className = 'element-picker';
        select.id = `a${slot}ElementPicker`;
        select.innerHTML = '<option value="">Escolher elemento principal...</option>' +
          data.elementosPrincipais.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join('') +
          '<option value="__custom__">Escrever outro elemento...</option>';
        select.onchange = () => {
          if(select.value === '__custom__'){
            element.focus();
            element.select();
          }else if(select.value){
            dispatchValue(element, select.value);
          }
        };
        element.insertAdjacentElement('beforebegin', select);
        element.addEventListener('input', () => {
          const exact = data.elementosPrincipais.find(value => value.toLocaleLowerCase('pt-BR') === element.value.trim().toLocaleLowerCase('pt-BR'));
          select.value = exact || (element.value.trim() ? '__custom__' : '');
        });
      }
    }
  }

  function escapeHtml(value=''){
    return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function escapeAttr(value=''){ return escapeHtml(value); }

  async function initPhraseEnhancements(){
    injectStyles();
    await loadCatalogData();
    const started = Date.now();
    const timer = setInterval(() => {
      enhancePromptFields().catch(error => console.warn(error));
      if(Date.now() - started > 90000) clearInterval(timer);
    }, 700);
    const observer = new MutationObserver(() => enhancePromptFields().catch(() => {}));
    observer.observe(document.documentElement, {childList:true, subtree:true});
  }

  initPhraseEnhancements().catch(error => notify(error.message, 'error'));
})();
