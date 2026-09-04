(() => {
  'use strict';

  const BUILD='20260904-canecafacil-generator-parity-v2.1';
  const FIREBASE_BASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const COMMANDS_NODE='canecas/comandos_criacao';
  const STORAGE_KEY='cf_preview_selected_commands_v2';
  const DEFAULT_WEBHOOK='https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
  const $=(s,r=document)=>r.querySelector(s);
  const text=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeKey=v=>text(v).replace(/[.#$\[\]/]/g,'_');
  const state={commands:[],selected:new Set(loadSelected()),editingId:''};

  function loadSelected(){try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(raw)?raw.map(String):[]}catch{return[]}}
  function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...state.selected]))}catch{}}
  function toast(message,error=false){const el=$('#toast');if(!el)return;el.textContent=message;el.className=`toast${error?' error':''}`;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,error?5000:2600)}
  async function fb(path,options={}){const r=await fetch(`${FIREBASE_BASE}/${path}.json${options.bust?`?_=${Date.now()}`:''}`,{method:options.method||'GET',cache:options.bust?'no-store':'default',headers:{Accept:'application/json',...(options.body!==undefined?{'Content-Type':'application/json'}:{})},...(options.body!==undefined?{body:JSON.stringify(options.body)}:{})});if(!r.ok)throw new Error(`Firebase ${r.status}`);return r.json().catch(()=>null)}
  const fbGet=path=>fb(path,{bust:true});
  const fbPut=(path,body)=>fb(path,{method:'PUT',body});
  const fbDelete=path=>fb(path,{method:'DELETE'});

  function resolveWebhook(){
    let saved='',current={},legacy={};
    try{saved=text(localStorage.getItem('canecafacil_make_webhook'))}catch{}
    try{current=JSON.parse(localStorage.getItem('da_admin_v2_config')||'{}')||{}}catch{}
    try{legacy=JSON.parse(localStorage.getItem('da_admin_settings_v4')||'{}')||{}}catch{}
    const valid=v=>/^https:\/\/hook\.[a-z0-9-]+\.make\.com\/[A-Za-z0-9_-]+$/i.test(text(v));
    const candidates=[saved,current.makeAiWebhookUrl,current.makeImageWebhookUrl,current.makeTextWebhookUrl,legacy.makeAiWebhookUrl,legacy.makeImageWebhookUrl,legacy.makeTextWebhookUrl,DEFAULT_WEBHOOK].map(text);
    return candidates.find(valid)||DEFAULT_WEBHOOK;
  }
  function syncWebhook(){const hook=resolveWebhook();try{localStorage.setItem('canecafacil_make_webhook',hook)}catch{}return hook}

  function installUi(){
    const form=$('#generatorForm');
    if(!form||$('#cfCommandLibrary'))return;
    const instruction=form.querySelector('textarea[name="instrucao"]')?.closest('label');
    if(!instruction)return;
    const section=document.createElement('section');
    section.id='cfCommandLibrary';
    section.className='cf-command-library';
    section.innerHTML=`
      <div class="cf-command-head"><div><strong>Comandos padrão</strong><small>Mesma biblioteca do Gerador do Admin Canecas. Selecione um ou vários para somar à próxima criação.</small></div><button type="button" class="mini-button" id="cfCommandRefresh">Atualizar</button></div>
      <div id="cfCommandForm" class="cf-command-form">
        <input id="cfCommandName" maxlength="60" placeholder="Nome do comando · Ex.: Sem texto extra">
        <textarea id="cfCommandText" maxlength="1000" rows="3" placeholder="Escreva a instrução reutilizável"></textarea>
        <div><button type="button" class="mini-button" id="cfCommandSave">Salvar comando</button><button type="button" class="mini-button" id="cfCommandCancel" hidden>Cancelar</button></div>
      </div>
      <div class="cf-command-toolbar"><span id="cfCommandSelected">0 selecionados</span><button type="button" class="mini-button" id="cfCommandClear">Limpar seleção</button></div>
      <div id="cfCommandEffective" class="cf-command-effective">Selecione comandos para somá-los automaticamente à instrução.</div>
      <div id="cfCommandList" class="cf-command-list"><small>Carregando comandos…</small></div>`;
    instruction.insertAdjacentElement('afterend',section);

    const note=document.createElement('div');
    note.className='cf-automation-note';
    const hook=syncWebhook();
    note.innerHTML=`<strong>Automação conectada ao Gerador Canecas</strong><small>Webhook em uso: <code>${esc(hook)}</code></small><small>Mesmo endpoint utilizado pelo Admin Canecas. Saída nova: arte horizontal 2400×960 + 1 mockup mestre vertical 1200×1600 com duas vistas.</small>`;
    form.querySelector('.strong-hint')?.insertAdjacentElement('afterend',note);

    const positioning=document.createElement('div');
    positioning.className='cf-position-note';
    positioning.innerHTML='<strong>Posicionamento correto para a caneca</strong><span>Manter personagens, rostos e palavras principais na faixa segura central. Não usar os 10% extremos de cada lateral para informação essencial. A leitura deve continuar natural quando a arte envolver a caneca; no mockup, uma vista revela um lado e a segunda revela o lado complementar.</span>';
    section.insertAdjacentElement('afterend',positioning);
    bindUi();
  }

  function normalizeCommands(map={}){return Object.entries(map||{}).filter(([,v])=>v&&typeof v==='object'&&!Array.isArray(v)).map(([id,v])=>({id:text(v.id||id),nome:text(v.nome||v.name),texto:text(v.texto||v.prompt||v.comando),criado_em:text(v.criado_em)})).filter(x=>x.id&&x.nome&&x.texto).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{sensitivity:'base'}))}
  async function loadCommands(force=false){if(state.commands.length&&!force)return render();try{state.commands=normalizeCommands(await fbGet(COMMANDS_NODE));state.selected=new Set([...state.selected].filter(id=>state.commands.some(c=>c.id===id)));persist();render()}catch(e){const root=$('#cfCommandList');if(root)root.innerHTML=`<small>Erro ao carregar: ${esc(e.message||e)}</small>`}}
  function render(){const root=$('#cfCommandList');if(!root)return;const count=state.selected.size;$('#cfCommandSelected').textContent=`${count} selecionado${count===1?'':'s'}`;$('#cfCommandEffective').textContent=count?`Os ${count} comando${count===1?'':'s'} serão somados à instrução complementar antes do envio ao Make.`:'Selecione comandos para somá-los automaticamente à instrução.';root.innerHTML=state.commands.length?state.commands.map(c=>`<article class="cf-command-item"><label><input type="checkbox" data-cf-command-select="${esc(c.id)}" ${state.selected.has(c.id)?'checked':''}></label><div><strong>${esc(c.nome)}</strong><p>${esc(c.texto)}</p><div class="cf-command-actions"><button type="button" class="mini-button" data-cf-command-edit="${esc(c.id)}">Editar</button><button type="button" class="mini-button danger" data-cf-command-delete="${esc(c.id)}">Excluir</button></div></div></article>`).join(''):'<small>Nenhum comando salvo. Crie o primeiro acima.</small>'}
  function resetForm(){state.editingId='';const name=$('#cfCommandName'),body=$('#cfCommandText');if(name)name.value='';if(body)body.value='';$('#cfCommandSave').textContent='Salvar comando';$('#cfCommandCancel').hidden=true}
  function editCommand(id){const c=state.commands.find(x=>x.id===id);if(!c)return;state.editingId=id;$('#cfCommandName').value=c.nome;$('#cfCommandText').value=c.texto;$('#cfCommandSave').textContent='Salvar alteração';$('#cfCommandCancel').hidden=false;$('#cfCommandName').focus()}
  async function saveCommand(){const nome=text($('#cfCommandName').value),texto=text($('#cfCommandText').value);if(!nome||!texto)return toast('Preencha nome e texto do comando.',true);const current=state.commands.find(c=>c.id===state.editingId),id=current?.id||safeKey(`cmd-${Date.now()}-${Math.random().toString(36).slice(2,8)}`),now=new Date().toISOString();try{await fbPut(`${COMMANDS_NODE}/${safeKey(id)}`,{id,nome,texto,ativo:true,criado_em:current?.criado_em||now,atualizado_em:now});resetForm();await loadCommands(true);toast('Comando salvo')}catch(err){toast(err.message||'Falha ao salvar comando',true)}}
  async function deleteCommand(id){const c=state.commands.find(x=>x.id===id);if(!c||!confirm(`Excluir o comando “${c.nome}”?`))return;try{await fbDelete(`${COMMANDS_NODE}/${safeKey(id)}`);state.selected.delete(id);persist();await loadCommands(true);toast('Comando excluído')}catch(e){toast(e.message||'Falha ao excluir comando',true)}}
  function selectedInstruction(){return state.commands.filter(c=>state.selected.has(c.id)).map((c,i)=>`COMANDO PADRÃO ${i+1} — ${c.nome}:\n${c.texto}`).join('\n\n')}

  function injectCommandsBeforeGeneration(){
    syncWebhook();
    const form=$('#generatorForm'),field=form?.elements?.instrucao;
    if(!field)return;
    const commands=selectedInstruction();
    const marker='\n\n--- COMANDOS PADRÃO DO ADMIN ---\n';
    let current=String(field.value||'');
    if(current.includes(marker))current=current.split(marker)[0].trimEnd();
    field.value=commands?`${current}${marker}${commands}`:current;
  }

  function bindUi(){
    $('#cfCommandRefresh').onclick=()=>loadCommands(true);
    $('#cfCommandSave').onclick=saveCommand;
    $('#cfCommandCancel').onclick=resetForm;
    $('#cfCommandClear').onclick=()=>{state.selected.clear();persist();render()};
    $('#cfCommandList').addEventListener('change',e=>{const input=e.target.closest('[data-cf-command-select]');if(!input)return;if(input.checked)state.selected.add(input.dataset.cfCommandSelect);else state.selected.delete(input.dataset.cfCommandSelect);persist();render()});
    $('#cfCommandList').addEventListener('click',e=>{const edit=e.target.closest('[data-cf-command-edit]'),del=e.target.closest('[data-cf-command-delete]');if(edit)editCommand(edit.dataset.cfCommandEdit);if(del)deleteCommand(del.dataset.cfCommandDelete)});
    $('#generatorForm').addEventListener('submit',injectCommandsBeforeGeneration,true);
  }

  function installStyles(){if($('#cfGeneratorParityStyles'))return;const style=document.createElement('style');style.id='cfGeneratorParityStyles';style.textContent=`
    .cf-command-library{grid-column:1/-1;border:1px solid #e2e2e2;border-radius:18px;padding:16px;background:#fafafa;display:grid;gap:12px}
    .cf-command-head,.cf-command-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.cf-command-head small{display:block;color:#777;margin-top:3px;max-width:620px}
    .cf-command-form{display:grid;grid-template-columns:minmax(160px,.7fr) minmax(260px,1.6fr) auto;gap:8px;align-items:start}.cf-command-form input,.cf-command-form textarea{width:100%}.cf-command-form>div{display:flex;gap:6px;flex-wrap:wrap}
    .cf-command-effective,.cf-automation-note,.cf-position-note{font-size:12px;color:#656565}.cf-command-list{display:grid;gap:8px;max-height:310px;overflow:auto;padding-right:3px}.cf-command-item{display:grid;grid-template-columns:24px 1fr;gap:8px;padding:11px;border:1px solid #e6e6e6;border-radius:14px;background:#fff}.cf-command-item p{margin:4px 0 8px;font-size:12px;color:#666;white-space:pre-wrap}.cf-command-actions{display:flex;gap:6px}.cf-command-item input[type=checkbox]{width:17px;height:17px}
    .cf-automation-note{display:grid;gap:3px;padding:10px 12px;border:1px solid #dfe8df;border-radius:13px;background:#f7fbf7;margin:10px 0}.cf-automation-note strong{color:#1f4b2b}.cf-automation-note code{word-break:break-all;font-size:10px}.cf-position-note{grid-column:1/-1;padding:10px 12px;border-left:3px solid #111;background:#fff}.cf-position-note strong{display:block;color:#111;margin-bottom:3px}.cf-position-note span{display:block;line-height:1.45}
    @media(max-width:760px){.cf-command-form{grid-template-columns:1fr}.cf-command-head{align-items:flex-start}.cf-command-toolbar{align-items:flex-start;flex-direction:column}}
  `;document.head.appendChild(style)}

  function boot(){syncWebhook();installStyles();installUi();loadCommands();document.documentElement.dataset.generatorParity=BUILD}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})();
