from pathlib import Path
import re

# HTML
p=Path('vitrine/admin/atendimento/index.html'); s=p.read_text()
s=s.replace('''        <header class="queue-head">
          <div><strong>Conversas</strong><small id="activeChannelStatus">Conectando 0975…</small></div>
          <span class="attention-count" id="activeChannelCount">0</span>
        </header>
        <div class="queue-list" id="queueList"></div>''','''        <header class="queue-head">
          <div><strong>Conversas</strong><small id="activeChannelStatus">Conectando 0975…</small></div>
          <span class="attention-count" id="activeChannelCount">0</span>
        </header>
        <div class="queue-organizer">
          <select id="labelFilter" aria-label="Filtrar por etiqueta"><option value="">Todas as etiquetas</option></select>
          <button type="button" id="manageLabelsBtn">Etiquetas</button>
        </div>
        <div class="queue-list" id="queueList"></div>''')
s=s.replace('''        <header class="conversation-head" id="conversationHead">
          <div><strong>Selecione uma conversa</strong><small>0975 e 1018 permanecem separados.</small></div>
          <button type="button" class="context-open" id="openContextBtn" disabled>Cliente</button>
        </header>''','''        <header class="conversation-head" id="conversationHead">
          <div><strong>Selecione uma conversa</strong><small>0975 e 1018 permanecem separados.</small></div>
          <div class="conversation-head-actions">
            <button type="button" id="conversationLabelsBtn" disabled>Etiquetas</button>
            <button type="button" class="context-open" id="openContextBtn" disabled>Cliente</button>
          </div>
        </header>''')
s=s.replace('''          <div class="quick-tools" aria-label="Ferramentas rápidas">
            <button type="button" id="catalogBtn" disabled title="Gera o link no rascunho; não envia automaticamente">Enviar catálogo</button>
            <button type="button" id="quickRepliesBtn" disabled>Respostas rápidas</button>
            <button type="button" id="quoteBtn" disabled>Criar orçamento</button>
            <button type="button" id="saleBtn" disabled>Nova venda</button>
            <button type="button" id="followUpBtn" disabled>Marcar retorno</button>
            <button type="button" id="optOutBtn" disabled title="Desativa ofertas para o cliente vinculado">Não receber ofertas</button>
          </div>

          <div class="composer-panel" id="quickRepliesMenu" hidden aria-label="Respostas rápidas"></div>''','''          <div class="quick-tools" aria-label="Ferramentas rápidas">
            <button type="button" id="catalogBtn" disabled title="Gera o link no rascunho; não envia automaticamente">Catálogo</button>
            <button type="button" id="quickRepliesBtn" disabled>Respostas</button>
            <button type="button" id="productsBtn" disabled>Produtos</button>
            <button type="button" id="moreToolsBtn" disabled>Mais ⋯</button>
          </div>

          <div class="composer-panel" id="quickRepliesMenu" hidden aria-label="Respostas rápidas">
            <div id="quickRepliesList" class="quick-replies-list"></div>
            <button type="button" id="manageQuickRepliesBtn" class="panel-manage">Gerenciar respostas</button>
          </div>
          <div class="composer-panel more-tools-menu" id="moreToolsMenu" hidden>
            <button type="button" id="quoteBtn" disabled>Criar orçamento</button>
            <button type="button" id="saleBtn" disabled>Nova venda</button>
            <button type="button" id="followUpBtn" disabled>Marcar retorno</button>
            <button type="button" id="optOutBtn" disabled title="Desativa ofertas para o cliente vinculado">Não receber ofertas</button>
          </div>
          <div class="composer-panel conversation-labels" id="conversationLabelsMenu" hidden>
            <strong>Etiquetas desta conversa</strong>
            <div id="conversationLabelsList"></div>
            <button type="button" id="saveConversationLabelsBtn">Salvar etiquetas</button>
          </div>''')
# insert managers before closing main
s=s.replace('''    </section>
  </main>
  <script type="module" src="./attendance.js"></script>''','''    </section>

    <div class="admin-dialog" id="labelManager" hidden>
      <section class="admin-dialog-card">
        <header><strong>Gerenciar etiquetas</strong><button type="button" id="closeLabelManagerBtn">×</button></header>
        <form id="labelForm">
          <input type="hidden" id="labelEditId">
          <label>Nome <input id="labelName" maxlength="60" required></label>
          <label>Cor <input id="labelColor" type="color" value="#5f6368"></label>
          <label>Ordem <input id="labelSortOrder" type="number" value="0"></label>
          <button type="submit">Salvar etiqueta</button>
        </form>
        <div id="labelManagerList" class="manager-list"></div>
      </section>
    </div>

    <div class="admin-dialog quick-replies-manager" id="quickRepliesManager" hidden>
      <section class="admin-dialog-card">
        <header><strong>Gerenciar respostas rápidas</strong><button type="button" id="closeQuickRepliesManagerBtn">×</button></header>
        <form id="quickReplyForm">
          <input type="hidden" id="quickReplyEditId">
          <label>Título <input id="quickReplyTitle" maxlength="80" required></label>
          <label>Resposta <textarea id="quickReplyContent" rows="4" maxlength="4000" required></textarea></label>
          <label class="inline-check"><input id="quickReplyFavorite" type="checkbox" checked> Mostrar nos favoritos</label>
          <label>Ordem <input id="quickReplySortOrder" type="number" value="0"></label>
          <button type="submit">Salvar resposta</button>
        </form>
        <div id="quickRepliesManagerList" class="manager-list"></div>
      </section>
    </div>
  </main>
  <script type="module" src="./attendance.js"></script>''')
p.write_text(s)

# CSS append
p=Path('vitrine/admin/atendimento/attendance.css'); css=p.read_text()
css += r'''

/* Central v2 · Fase 2 organização */
.attendance-app{overflow-x:hidden}
.queue-organizer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:8px 10px;border-bottom:1px solid #e8eaed}
.queue-organizer select,.queue-organizer button{min-width:0}
.conversation-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.label-chip{display:inline-flex;align-items:center;max-width:100%;border-radius:999px;padding:2px 7px;font-size:11px;font-weight:650;border:1px solid color-mix(in srgb,var(--label-color,#5f6368) 35%,transparent);background:color-mix(in srgb,var(--label-color,#5f6368) 10%,white);color:#3c4043;overflow-wrap:anywhere}
.quick-tools{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;overflow-x:hidden!important}
.quick-tools button{min-width:0;white-space:normal}
.more-tools-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.quick-replies-list{display:flex;gap:7px;flex-wrap:wrap}
.panel-manage{margin-top:8px}
.conversation-labels #conversationLabelsList{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.conversation-label-choice{display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #dadce0;border-radius:999px}
.admin-dialog[hidden]{display:none!important}
.admin-dialog{position:fixed;inset:0;z-index:1000;background:rgba(32,33,36,.32);display:grid;place-items:center;padding:20px}
.admin-dialog-card{width:min(560px,100%);max-height:min(720px,90vh);overflow:auto;background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(60,64,67,.24);padding:16px}
.admin-dialog-card>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.admin-dialog-card>header button{font-size:22px;border:0;background:transparent}
.admin-dialog-card form{display:grid;gap:10px;padding-bottom:14px;border-bottom:1px solid #e8eaed}
.admin-dialog-card label{display:grid;gap:4px;font-size:12px;color:#5f6368}
.admin-dialog-card input,.admin-dialog-card textarea{width:100%;box-sizing:border-box}
.admin-dialog-card .inline-check{display:flex;grid-template-columns:auto 1fr;align-items:center}.admin-dialog-card .inline-check input{width:auto}
.manager-list{display:grid;gap:8px;margin-top:12px}
.manager-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:9px;border:1px solid #e8eaed;border-radius:10px}
.manager-item.inactive{opacity:.55}.manager-item-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
@media(max-width:760px){.quick-tools{grid-template-columns:repeat(2,minmax(0,1fr))}.more-tools-menu{grid-template-columns:1fr}.queue-organizer{grid-template-columns:1fr auto}}
'''
p.write_text(css)

# JS
p=Path('vitrine/admin/atendimento/attendance.js'); js=p.read_text()
js=re.sub(r"const QUICK_REPLIES=\[[\s\S]*?\];\n\n",'',js,count=1)
js=js.replace("contextTab:'customer',conversationOpen:false,loadingOlder:false,refreshing:false}","contextTab:'customer',conversationOpen:false,loadingOlder:false,refreshing:false,labels:[],labelFilter:'',conversationLabelIds:[],quickReplies:[]}")
js=js.replace("api('queue',{account_id:account.id,limit:QUEUE_PAGE_SIZE,search:state.search})","api('queue',{account_id:account.id,limit:QUEUE_PAGE_SIZE,search:state.search,label_id:state.labelFilter})")
# add label chips after business chips creation line
old="""  btn.append(title,preview,chips);btn.addEventListener('click',()=>selectConversation(item.conversation_id,channel));return btn;"""
new="""  for(const label of item.labels||[]){const c=document.createElement('span');c.className='label-chip';c.textContent=label.name;c.style.setProperty('--label-color',label.color||'#5f6368');chips.append(c)}
  btn.append(title,preview,chips);btn.addEventListener('click',()=>selectConversation(item.conversation_id,channel));return btn;"""
if old not in js: raise SystemExit('queue card marker missing')
js=js.replace(old,new,1)
# reset/enable tool ids
js=js.replace("['catalogBtn','quickRepliesBtn','quoteBtn','saleBtn','followUpBtn','optOutBtn']","['catalogBtn','quickRepliesBtn','productsBtn','moreToolsBtn','conversationLabelsBtn','quoteBtn','saleBtn','followUpBtn','optOutBtn']",1)
js=js.replace("function enableConversationTools(){for(const id of ['catalogBtn','quickRepliesBtn','followUpBtn'])","function enableConversationTools(){for(const id of ['catalogBtn','quickRepliesBtn','productsBtn','moreToolsBtn','conversationLabelsBtn','followUpBtn'])",1)
# select conversation loads labels
old="""try{const [conversation,context]=await Promise.all([api('conversation',{conversation_id:id,limit:MESSAGE_PAGE_SIZE}),api('context',{conversation_id:id})]);state.conversation=conversation;state.context=context;state.selected={id,channel,display_name:context?.customer?.name||conversation?.conversation?.phone_e164};"""
new="""try{const [conversation,context,labelData]=await Promise.all([api('conversation',{conversation_id:id,limit:MESSAGE_PAGE_SIZE}),api('context',{conversation_id:id}),api('conversation_labels',{conversation_id:id})]);state.conversation=conversation;state.context=context;state.conversationLabelIds=labelData.label_ids||[];state.selected={id,channel,display_name:context?.customer?.name||conversation?.conversation?.phone_e164};"""
if old not in js: raise SystemExit('select marker missing')
js=js.replace(old,new,1)
# close + quick replies functions replacement
old=re.search(r"function closeComposerPanels\(\)\{[^\n]*\}\nfunction renderQuickReplies\(\)\{[^\n]*\}\n",js)
if not old: raise SystemExit('quick replies block missing')
replacement=r'''function closeComposerPanels(){for(const id of ['quickRepliesMenu','followUpPanel','moreToolsMenu','conversationLabelsMenu']){const el=$(`#${id}`);if(el)el.hidden=true}}
function renderQuickReplies(){const box=$('#quickRepliesList');if(!box)return;box.replaceChildren();for(const item of state.quickReplies.filter(x=>x.is_active!==false&&x.is_favorite!==false)){const b=document.createElement('button');b.type='button';b.className='quick-reply';b.textContent=item.title;b.addEventListener('click',()=>{setDraft(item.content);$('#quickRepliesMenu').hidden=true;showNote('Resposta rápida preparada · copie para enviar no PapoAI')});box.append(b)}if(!box.children.length){const e=document.createElement('span');e.className='context-empty';e.textContent='Nenhuma resposta favorita.';box.append(e)}}
async function loadQuickReplies({includeInactive=false}={}){const data=await api('quick_replies',includeInactive?{include_inactive:1}:{});if(!includeInactive){state.quickReplies=data.items||[];renderQuickReplies()}return data.items||[]}
function renderLabelFilter(){const select=$('#labelFilter');if(!select)return;const current=state.labelFilter;select.replaceChildren(new Option('Todas as etiquetas',''));for(const l of state.labels){const o=new Option(l.name,l.id);select.append(o)}select.value=state.labels.some(x=>x.id===current)?current:'';if(select.value!==current)state.labelFilter=select.value}
async function loadLabels(){const data=await api('labels');state.labels=data.items||[];renderLabelFilter();renderConversationLabelsMenu()}
function renderConversationLabelsMenu(){const box=$('#conversationLabelsList');if(!box)return;box.replaceChildren();for(const l of state.labels){const label=document.createElement('label');label.className='conversation-label-choice';const input=document.createElement('input');input.type='checkbox';input.value=l.id;input.checked=state.conversationLabelIds.includes(l.id);const dot=document.createElement('span');dot.className='label-chip';dot.textContent=l.name;dot.style.setProperty('--label-color',l.color||'#5f6368');label.append(input,dot);box.append(label)}}
async function saveConversationLabels(){if(!state.selected?.id)return;const ids=$$('#conversationLabelsList input:checked').map(x=>x.value);const data=await api('conversation_labels_set',{conversation_id:state.selected.id,label_ids:ids},'POST');state.conversationLabelIds=(data.labels||[]).map(x=>x.id);$('#conversationLabelsMenu').hidden=true;showNote('Etiquetas atualizadas','success');await loadQueue()}
function openConversationLabels(){renderConversationLabelsMenu();const box=$('#conversationLabelsMenu');closeComposerPanels();box.hidden=false}
function resetLabelForm(){for(const id of ['labelEditId','labelName'])$(`#${id}`).value='';$('#labelColor').value='#5f6368';$('#labelSortOrder').value='0'}
async function renderLabelManager(){const all=await api('labels',{include_inactive:1});const box=$('#labelManagerList');box.replaceChildren();for(const l of all.items||[]){const row=document.createElement('div');row.className=`manager-item${l.is_active?'':' inactive'}`;const info=document.createElement('div');const chip=document.createElement('span');chip.className='label-chip';chip.textContent=l.name;chip.style.setProperty('--label-color',l.color);info.append(chip);const actions=document.createElement('div');actions.className='manager-item-actions';if(l.is_active){const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.addEventListener('click',()=>{$('#labelEditId').value=l.id;$('#labelName').value=l.name;$('#labelColor').value=l.color;$('#labelSortOrder').value=l.sort_order||0;$('#labelName').focus()});const del=document.createElement('button');del.type='button';del.textContent='Desativar';del.addEventListener('click',async()=>{await api('label_deactivate',{id:l.id},'POST');await loadLabels();await renderLabelManager();await loadQueue()});actions.append(edit,del)}else{const off=document.createElement('span');off.textContent='Inativa';actions.append(off)}row.append(info,actions);box.append(row)}}
async function saveLabelForm(e){e.preventDefault();const payload={id:$('#labelEditId').value||undefined,name:$('#labelName').value.trim(),color:$('#labelColor').value,sort_order:Number($('#labelSortOrder').value||0)};await api('label_save',payload,'POST');resetLabelForm();await loadLabels();await renderLabelManager();await loadQueue()}
function resetQuickReplyForm(){for(const id of ['quickReplyEditId','quickReplyTitle','quickReplyContent'])$(`#${id}`).value='';$('#quickReplyFavorite').checked=true;$('#quickReplySortOrder').value='0'}
async function renderQuickRepliesManager(){const items=await loadQuickReplies({includeInactive:true});const box=$('#quickRepliesManagerList');box.replaceChildren();for(const q of items){const row=document.createElement('div');row.className=`manager-item${q.is_active?'':' inactive'}`;const info=document.createElement('div');const strong=document.createElement('strong');strong.textContent=q.title;const small=document.createElement('div');small.textContent=q.content;info.append(strong,small);const actions=document.createElement('div');actions.className='manager-item-actions';if(q.is_active){const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.addEventListener('click',()=>{$('#quickReplyEditId').value=q.id;$('#quickReplyTitle').value=q.title;$('#quickReplyContent').value=q.content;$('#quickReplyFavorite').checked=q.is_favorite!==false;$('#quickReplySortOrder').value=q.sort_order||0;$('#quickReplyTitle').focus()});const del=document.createElement('button');del.type='button';del.textContent='Desativar';del.addEventListener('click',async()=>{await api('quick_reply_deactivate',{id:q.id},'POST');await loadQuickReplies();await renderQuickRepliesManager()});actions.append(edit,del)}else actions.append(document.createTextNode('Inativa'));row.append(info,actions);box.append(row)}}
async function saveQuickReplyForm(e){e.preventDefault();const payload={id:$('#quickReplyEditId').value||undefined,title:$('#quickReplyTitle').value.trim(),content:$('#quickReplyContent').value.trim(),is_favorite:$('#quickReplyFavorite').checked,sort_order:Number($('#quickReplySortOrder').value||0)};await api('quick_reply_save',payload,'POST');resetQuickReplyForm();await loadQuickReplies();await renderQuickRepliesManager()}
'''
js=js[:old.start()]+replacement+js[old.end():]
# bind: replace quick btn block with enhanced listeners
js=js.replace("$('#quickRepliesBtn').addEventListener('click',()=>{const box=$('#quickRepliesMenu');$('#followUpPanel').hidden=true;box.hidden=!box.hidden});","$('#quickRepliesBtn').addEventListener('click',()=>{const box=$('#quickRepliesMenu');const opening=box.hidden;closeComposerPanels();box.hidden=!opening});\n  $('#productsBtn').addEventListener('click',()=>{$$('.context-tabs [data-context-tab]').forEach(x=>x.classList.toggle('active',x.dataset.contextTab==='products'));state.contextTab='products';renderContext();$('#contextPane').classList.add('open')});\n  $('#moreToolsBtn').addEventListener('click',()=>{const box=$('#moreToolsMenu');const opening=box.hidden;closeComposerPanels();box.hidden=!opening});\n  $('#conversationLabelsBtn').addEventListener('click',openConversationLabels);\n  $('#saveConversationLabelsBtn').addEventListener('click',()=>saveConversationLabels().catch(()=>showNote('Não consegui salvar as etiquetas','error')));\n  $('#labelFilter').addEventListener('change',e=>{state.labelFilter=e.target.value;loadQueue()});\n  $('#manageLabelsBtn').addEventListener('click',()=>{$('#labelManager').hidden=false;renderLabelManager().catch(()=>{})});\n  $('#closeLabelManagerBtn').addEventListener('click',()=>$('#labelManager').hidden=true);\n  $('#labelForm').addEventListener('submit',e=>saveLabelForm(e).catch(()=>showNote('Não consegui salvar a etiqueta','error')));\n  $('#manageQuickRepliesBtn').addEventListener('click',()=>{$('#quickRepliesMenu').hidden=true;$('#quickRepliesManager').hidden=false;renderQuickRepliesManager().catch(()=>{})});\n  $('#closeQuickRepliesManagerBtn').addEventListener('click',()=>$('#quickRepliesManager').hidden=true);\n  $('#quickReplyForm').addEventListener('submit',e=>saveQuickReplyForm(e).catch(()=>showNote('Não consegui salvar a resposta rápida','error')));")
# boot loads data
js=js.replace("async function boot(){bind();renderQuickReplies();syncFallbackButtons();try{await loadAccounts();await loadQueue();startRefresh()}","async function boot(){bind();syncFallbackButtons();try{await Promise.all([loadAccounts(),loadLabels(),loadQuickReplies()]);await loadQueue();startRefresh()}")
p.write_text(js)
