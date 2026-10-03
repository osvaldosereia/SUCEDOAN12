from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'expected fragment missing: {label}')
    return text.replace(old, new, 1)

# HTML: troca filtros soltos + select nativo por dropdown customizado único.
html_path=Path('vitrine/admin/atendimento/index.html')
html=html_path.read_text(encoding='utf-8')
old='''          <div class="queue-quick-filters" id="queueQuickFilters" aria-label="Filtros rápidos">\n            <button type="button" data-queue-filter="unread">Não lidas</button>\n            <button type="button" data-queue-filter="order">Pedidos</button>\n            <button type="button" data-queue-filter="pending">Cadastro pendente</button>\n          </div>'''
new='''          <div class="queue-filter-wrap" id="queueFilterWrap">\n            <button type="button" class="queue-filter-trigger" id="queueFilterMenuBtn" aria-haspopup="menu" aria-expanded="false">\n              <span id="queueFilterMenuLabel">RECENTE</span><span class="queue-filter-chevron" aria-hidden="true">⌄</span>\n            </button>\n            <div class="queue-filter-menu" id="queueFilterMenu" role="menu" hidden>\n              <div class="queue-filter-primary" aria-label="Filtros operacionais">\n                <button type="button" data-queue-filter="recent" role="menuitem">RECENTE</button>\n                <button type="button" data-queue-filter="order" role="menuitem">PEDIDOS</button>\n                <button type="button" data-queue-filter="pending" role="menuitem">CADASTRO</button>\n              </div>\n              <div class="queue-filter-divider"></div>\n              <div class="queue-filter-caption">ETIQUETAS</div>\n              <div class="queue-filter-labels" id="queueLabelFilters"></div>\n              <div class="queue-filter-footer"><button type="button" id="manageLabelsBtn">Gerenciar etiquetas</button></div>\n            </div>\n          </div>'''
html=replace_once(html,old,new,'quick filters')
old='<div class="queue-organizer"><select id="labelFilter" aria-label="Filtrar por etiqueta"><option value="">Todas as etiquetas</option></select><button type="button" id="manageLabelsBtn">Etiquetas</button></div>'
html=replace_once(html,old,'','native label filter')
html_path.write_text(html,encoding='utf-8')

# Frontend core.
app_path=Path('vitrine/admin/atendimento/attendance-app.js')
app=app_path.read_text(encoding='utf-8')
app=replace_once(app,"quickFilter:'',labelFilter:''","quickFilter:'recent',labelFilter:''",'default recent filter')
app=replace_once(app,"function filtered(item){return state.quickFilter==='unread'?Number(item.unread_count||0)>0:state.quickFilter==='order'?Boolean(item.has_order):state.quickFilter==='pending'?Boolean(item.registration_incomplete):true}","function filtered(item){return state.quickFilter==='recent'?true:state.quickFilter==='order'?Boolean(item.has_recent_order):state.quickFilter==='pending'?Boolean(item.has_recent_order&&item.registration_incomplete):state.quickFilter==='label'?true:true}",'filter semantics')
app=replace_once(app,"if(item.has_order)chips.append(chip('Pedido','order'));if(item.registration_incomplete)chips.append(chip('Cadastro pendente','pending'));","if(item.has_recent_order)chips.append(chip('Pedido','order'));if(item.has_recent_order&&item.registration_incomplete)chips.append(chip('Cadastro pendente','pending'));",'queue chips')
old="function quickCounts(items){const c={unread:items.filter(x=>Number(x.unread_count||0)>0).length,order:items.filter(x=>x.has_order).length,pending:items.filter(x=>x.registration_incomplete).length},labels={unread:'Não lidas',order:'Pedidos',pending:'Cadastro pendente'};$$('[data-queue-filter]').forEach(b=>{const k=b.dataset.queueFilter;b.classList.toggle('active',state.quickFilter===k);b.textContent=`${labels[k]}${c[k]?` ${c[k]}`:''}`})}"
new="""function queueFilterTitle(){if(state.quickFilter==='order')return 'PEDIDOS';if(state.quickFilter==='pending')return 'CADASTRO';if(state.quickFilter==='label'){const l=state.labels.find(x=>x.id===state.labelFilter);return l?.name||'ETIQUETA'}return 'RECENTE'}
function syncQueueFilterMenu(){const title=$('#queueFilterMenuLabel');if(title)title.textContent=queueFilterTitle();$$('[data-queue-filter]').forEach(b=>b.classList.toggle('active',state.quickFilter===b.dataset.queueFilter));$$('#queueLabelFilters [data-label-id]').forEach(b=>b.classList.toggle('active',state.quickFilter==='label'&&state.labelFilter===b.dataset.labelId))}
async function applyQueueFilter(kind,labelId=''){state.quickFilter=kind||'recent';state.labelFilter=kind==='label'?labelId:'';syncQueueFilterMenu();const menu=$('#queueFilterMenu');if(menu)menu.hidden=true;const trigger=$('#queueFilterMenuBtn');if(trigger)trigger.setAttribute('aria-expanded','false');await loadQueue()}
function renderQueueLabelFilters(){const box=$('#queueLabelFilters');if(!box)return;box.replaceChildren();for(const l of state.labels){const b=document.createElement('button');b.type='button';b.className='queue-filter-label';b.dataset.labelId=l.id;b.setAttribute('role','menuitem');const dot=document.createElement('span');dot.className='queue-filter-label-dot';dot.style.background=l.color||'#5f6368';const name=document.createElement('span');name.textContent=l.name;b.append(dot,name);b.onclick=()=>applyQueueFilter('label',l.id).catch(()=>{});box.append(b)}if(!box.children.length){const e=document.createElement('span');e.className='queue-filter-empty';e.textContent='Nenhuma etiqueta criada.';box.append(e)}syncQueueFilterMenu()}
function toggleQueueFilterMenu(){const menu=$('#queueFilterMenu'),trigger=$('#queueFilterMenuBtn');if(!menu||!trigger)return;menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)syncQueueFilterMenu()}"""
app=replace_once(app,old,new,'quick count replacement')
app=replace_once(app,";quickCounts(state.queue);const visible=state.queue.filter(filtered)",";syncQueueFilterMenu();const visible=state.queue.filter(filtered)",'queue sync')
app=replace_once(app,"$('#activeChannelCount').textContent=String(state.queue.filter(x=>Number(x.unread_count||0)>0).length);","$('#activeChannelCount').textContent=String(visible.length);",'queue visible count')
old="function renderLabelFilter(){const s=$('#labelFilter'),current=state.labelFilter;s.replaceChildren(new Option('Todas as etiquetas',''));for(const l of state.labels)s.append(new Option(l.name,l.id));s.value=state.labels.some(x=>x.id===current)?current:'';state.labelFilter=s.value}\nasync function loadLabels(){const data=await api('labels');state.labels=data.items||[];renderLabelFilter();renderConversationLabels()}"
new="""function renderLabelManager(){const box=$('#labelManagerList');if(!box)return;box.replaceChildren();for(const l of state.labels){const row=document.createElement('div');row.className='manager-item label-manager-item';const info=document.createElement('div');const title=document.createElement('strong');const dot=document.createElement('span');dot.className='label-manager-dot';dot.style.background=l.color||'#5f6368';title.append(dot,document.createTextNode(l.name));const sub=document.createElement('small');sub.textContent=`Ordem ${Number(l.sort_order||0)}`;info.append(title,sub);const actions=document.createElement('div');actions.className='manager-item-actions';const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.onclick=()=>{const form=$('#labelForm');$('#labelEditId').value=l.id;$('#labelName').value=l.name;$('#labelColor').value=l.color||'#5f6368';$('#labelSortOrder').value=String(Number(l.sort_order||0));form?.querySelector('#labelName')?.focus()};const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='Apagar';remove.onclick=()=>deactivateLabel(l.id).catch(()=>showNote('Não consegui apagar etiqueta','error'));actions.append(edit,remove);row.append(info,actions);box.append(row)}if(!box.children.length)box.innerHTML='<span class="context-empty">Nenhuma etiqueta criada.</span>'}
function resetLabelForm(){const form=$('#labelForm');if(form)form.reset();$('#labelEditId').value='';$('#labelColor').value='#5f6368';$('#labelSortOrder').value='0'}
function openLabelManager(){renderLabelManager();$('#labelManager').hidden=false;setTimeout(()=>$('#labelName')?.focus(),0)}
function closeLabelManager(){const d=$('#labelManager');if(d)d.hidden=true;resetLabelForm()}
async function saveLabelForm(event){event?.preventDefault();const id=$('#labelEditId').value.trim(),name=$('#labelName').value.trim(),color=$('#labelColor').value,sort_order=Number($('#labelSortOrder').value||0);if(!name)return;await api('label_save',{id:id||null,name,color,sort_order},'POST');resetLabelForm();await loadLabels();await loadQueue({silent:true});renderLabelManager()}
async function deactivateLabel(id){if(!id||!confirm('Apagar esta etiqueta?'))return;await api('label_deactivate',{id},'POST');if(state.labelFilter===id){state.quickFilter='recent';state.labelFilter=''}await loadLabels();await loadQueue({silent:true});renderLabelManager()}
async function loadLabels(){const data=await api('labels');state.labels=data.items||[];if(state.labelFilter&&!state.labels.some(x=>x.id===state.labelFilter)){state.quickFilter='recent';state.labelFilter=''}renderQueueLabelFilters();renderConversationLabels();renderLabelManager()}"""
app=replace_once(app,old,new,'label filter/manager')
old="$$('[data-queue-filter]').forEach(b=>b.onclick=()=>{state.quickFilter=state.quickFilter===b.dataset.queueFilter?'':b.dataset.queueFilter;loadQueue().catch(()=>{})});\n  $('#labelFilter').onchange=e=>{state.labelFilter=e.target.value;loadQueue().catch(()=>{})};"
new="""$$('[data-queue-filter]').forEach(b=>b.onclick=()=>applyQueueFilter(b.dataset.queueFilter).catch(()=>{}));
  $('#queueFilterMenuBtn').onclick=e=>{e.stopPropagation();toggleQueueFilterMenu()};
  $('#queueFilterMenu').onclick=e=>e.stopPropagation();"""
app=replace_once(app,old,new,'filter bindings')
old="$('#manageLabelsBtn').onclick=()=>showNote('Gerenciamento avançado de etiquetas permanece disponível pela conversa selecionada.');"
new="""$('#manageLabelsBtn').onclick=()=>{const menu=$('#queueFilterMenu');if(menu)menu.hidden=true;$('#queueFilterMenuBtn')?.setAttribute('aria-expanded','false');openLabelManager()};
  $('#closeLabelManagerBtn').onclick=closeLabelManager;$('#labelForm').onsubmit=e=>saveLabelForm(e).catch(()=>showNote('Não consegui salvar etiqueta','error'));
  $('#labelManager').onclick=e=>{if(e.target===$('#labelManager'))closeLabelManager()};
  document.addEventListener('click',e=>{const wrap=$('#queueFilterWrap');if(wrap&&!wrap.contains(e.target)){const menu=$('#queueFilterMenu');if(menu)menu.hidden=true;$('#queueFilterMenuBtn')?.setAttribute('aria-expanded','false')}});"""
app=replace_once(app,old,new,'label manager bindings')
app_path.write_text(app,encoding='utf-8')

# CSS: hierarquia de superfícies e menu responsivo customizado.
css_path=Path('vitrine/admin/atendimento/attendance.css')
css=css_path.read_text(encoding='utf-8')
css=replace_once(css,"--radius:14px}","--radius:14px;--queue-bg:#f4f8f5;--conversation-bg:#f7faf8;--context-bg:#f7f6f1;--composer-bg:#eef6f1}",'surface variables')
css=replace_once(css,".queue-column{min-width:0;min-height:0;border-right:1px solid var(--line);display:flex;flex-direction:column;background:#fff}",".queue-column{min-width:0;min-height:0;border-right:1px solid var(--line);display:flex;flex-direction:column;background:var(--queue-bg)}",'queue background')
css=replace_once(css,".conversation-pane{min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;background:#fbfcfb}",".conversation-pane{min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;background:var(--conversation-bg)}",'conversation background')
css=replace_once(css,".composer{flex:0 0 auto;background:#fff;", ".composer{flex:0 0 auto;background:var(--composer-bg);",'composer background')
css=replace_once(css,".context-pane{min-width:0;min-height:0;border-left:1px solid var(--line);background:#fff;", ".context-pane{min-width:0;min-height:0;border-left:1px solid var(--line);background:var(--context-bg);",'context background')
css += '''\n.queue-filter-wrap{position:relative;padding:0 10px 9px}.queue-filter-trigger{width:100%;min-height:38px;border:1px solid #d7e0d9;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 11px;color:#31483a;font-size:11px;font-weight:850;letter-spacing:.02em}.queue-filter-trigger:hover{border-color:#9db8a7}.queue-filter-chevron{font-size:15px;color:#718078}.queue-filter-menu{position:absolute;z-index:45;left:10px;right:10px;top:44px;background:#fff;border:1px solid #dbe3dd;border-radius:12px;box-shadow:0 16px 35px rgba(24,45,31,.16);padding:8px;max-height:min(430px,65dvh);overflow:auto}.queue-filter-primary{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.queue-filter-primary button{min-height:35px;border:1px solid #dfe5e1;border-radius:8px;background:#f7faf8;color:#425348;font-size:10px;font-weight:850}.queue-filter-primary button.active{background:var(--brand);border-color:var(--brand);color:#fff}.queue-filter-divider{height:1px;background:#e8ece9;margin:8px 2px}.queue-filter-caption{padding:1px 5px 5px;color:#748078;font-size:9px;font-weight:850;letter-spacing:.08em}.queue-filter-labels{display:grid;gap:3px}.queue-filter-label{width:100%;min-height:34px;border:0;border-radius:8px;background:transparent;display:flex;align-items:center;gap:8px;padding:0 7px;text-align:left;color:#405047;font-size:11px}.queue-filter-label:hover,.queue-filter-label.active{background:#edf5f0;color:var(--brand)}.queue-filter-label-dot,.label-manager-dot{width:10px;height:10px;border-radius:50%;display:inline-block;flex:0 0 auto}.queue-filter-empty{display:block;padding:8px;color:#7b857f;font-size:10px}.queue-filter-footer{border-top:1px solid #e8ece9;margin-top:7px;padding-top:7px}.queue-filter-footer button{width:100%;min-height:34px;border:1px solid #dce4de;border-radius:8px;background:#fff;color:var(--brand);font-size:10px;font-weight:850}.label-manager-item{align-items:center}.label-manager-item strong{display:flex;align-items:center;gap:7px}.manager-item-actions{display:flex;gap:5px}.manager-item-actions button{padding:0 8px}.manager-item-actions .danger{color:var(--danger);border-color:#efd9dd}.queue-card{background:rgba(255,255,255,.88)}.queue-card.selected{background:#e6f3ea}.messages{background:linear-gradient(#f7faf8,#f2f7f4)}.context-card,.context-section{background:rgba(255,255,255,.86)}\n@media(max-width:680px){.queue-filter-menu{position:fixed;left:10px;right:10px;top:auto;bottom:12px;max-height:70dvh;border-radius:16px;padding:10px;z-index:85}.queue-filter-primary button{min-height:44px}.queue-filter-label{min-height:42px}.queue-filter-footer button{min-height:44px}}\n'''
css_path.write_text(css,encoding='utf-8')

# Gateway: fila v4.
api_path=Path('supabase/functions/admin-whatsapp-ops-v1/index.ts')
api=api_path.read_text(encoding='utf-8')
api=replace_once(api,'ops2_admin_attendance_queue_v3','ops2_admin_attendance_queue_v4','queue rpc v4')
api_path.write_text(api,encoding='utf-8')

# Contrato legado da organização passa a exigir a versão atual.
test_path=Path('scripts/test-admin-attendance-organization-api-v1.mjs')
test=test_path.read_text(encoding='utf-8')
test=test.replace('ops2_admin_attendance_queue_v3','ops2_admin_attendance_queue_v4')
test_path.write_text(test,encoding='utf-8')

print('attendance filters/menu/labels patched')
