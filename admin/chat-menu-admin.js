(function(){
  'use strict';
  const C=window.DA_ADMIN_V3_CONFIG||{};
  const AUTH_KEY='da_admin_v3_auth';
  const $=id=>document.getElementById(id);
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const builtins=new Set(['baskets','offers','products','payment','delivery','profile']);
  const kindLabel={baskets:'Cestas',offers:'Ofertas',products:'Produtos',payment:'Pagamento',delivery:'Entregas',profile:'Cadastro',text:'Resposta de texto'};
  let config=null,canWrite=false,loaded=false,loading=false;

  function token(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')?.access_token||''}catch{return ''}}
  async function api(action,payload={}){const access=token();if(!access)throw new Error('Faça login para editar o menu.');const fn=C.chatMenuEdgeFunction||'admin-chat-menu-v1';const r=await fetch(`${C.supabaseUrl}/functions/v1/${fn}`,{method:'POST',headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});const data=await r.json().catch(()=>({}));if(!r.ok||data.ok===false)throw new Error(data.detail||data.error||`Erro ${r.status}`);return data}
  function toast(message,kind=''){const region=$('toastRegion');if(!region)return;const n=document.createElement('div');n.className=`toast ${kind}`.trim();n.textContent=message;region.appendChild(n);setTimeout(()=>n.remove(),kind==='error'?6500:3300)}
  function view(){return document.querySelector('.view[data-view="chat-menu"]')}
  function active(){return view()?.classList.contains('active')===true}
  function safeAvatar(url){const v=txt(url);return /^https:\/\//i.test(v)||/^\/?[a-z0-9_./-]+$/i.test(v)?v:''}

  function ensureBase(){const v=view();if(!v||$('chatMenuAdminRoot'))return;v.innerHTML=`<div id="chatMenuAdminRoot" class="chat-menu-admin"><section class="panel"><div class="panel-head"><div><div class="eyebrow">Atalho flutuante da Dona Antônia</div><h2>Menu do Chat</h2><p>Edite o botão “Quer ajuda?”, a personagem, a ordem das opções e as respostas rápidas. Cestas, ofertas e produtos usam os dados reais do catálogo.</p></div></div><div id="chatMenuAdminBody"><div class="empty">Abra esta seção para carregar as configurações.</div></div></section></div>`}

  function normalizeItems(items){return (Array.isArray(items)?items:[]).map((x,i)=>({id:txt(x.id)||`item-${i+1}`,label:txt(x.label)||'Opção',kind:txt(x.kind)||'text',enabled:x.enabled!==false,sort_order:Number.isFinite(Number(x.sort_order))?Number(x.sort_order):(i+1)*10,response_text:txt(x.response_text)})).sort((a,b)=>a.sort_order-b.sort_order)}

  function itemHtml(item,index){const editableText=!['baskets','offers','products'].includes(item.kind);const removable=!builtins.has(item.kind);return `<article class="chat-menu-item" data-menu-item data-id="${esc(item.id)}" data-kind="${esc(item.kind)}">
    <div class="chat-menu-item-head">
      <label class="chat-menu-switch"><input type="checkbox" data-field="enabled" ${item.enabled?'checked':''}><span>Ativo</span></label>
      <input type="text" maxlength="80" data-field="label" value="${esc(item.label)}" aria-label="Nome da opção">
      <input type="number" min="0" max="9999" step="1" data-field="sort_order" value="${Number(item.sort_order||((index+1)*10))}" aria-label="Ordem">
      <div class="chat-menu-item-actions"><button type="button" data-move="up" title="Subir">↑</button><button type="button" data-move="down" title="Descer">↓</button>${removable?'<button type="button" class="danger" data-remove title="Excluir">×</button>':''}</div>
      <span class="chat-menu-kind">${esc(kindLabel[item.kind]||item.kind)}</span>
    </div>
    ${editableText?`<label class="chat-menu-response"><span>Resposta no chat</span><textarea maxlength="600" data-field="response_text" placeholder="Texto que aparecerá diretamente na conversa">${esc(item.response_text||'')}</textarea></label>`:`<div class="chat-menu-note">Esta opção é dinâmica: o conteúdo vem automaticamente das cestas/produtos reais do Supabase.</div>`}
  </article>`}

  function render(){ensureBase();const body=$('chatMenuAdminBody');if(!body||!config)return;const items=normalizeItems(config.menu_items);body.innerHTML=`<div class="chat-menu-grid"><div class="chat-menu-form">
    <div class="chat-menu-basics"><label class="chat-menu-switch"><input id="chatMenuEnabled" type="checkbox" ${config.enabled!==false?'checked':''}><span>Mostrar botão flutuante no chat</span></label><label class="chat-menu-field"><span>Frase acima da personagem</span><input id="chatMenuPrompt" maxlength="60" value="${esc(config.prompt_text||'Quer ajuda?')}" placeholder="Quer ajuda?"></label></div>
    <div class="chat-menu-avatar-row"><div id="chatMenuAvatarPreview" class="chat-menu-avatar-preview">DA</div><label class="chat-menu-field"><span>Imagem/personagem da Dona Antônia</span><input id="chatMenuAvatar" maxlength="500" value="${esc(config.avatar_url||'')}" placeholder="https://.../dona-antonia.webp"><small class="chat-menu-note">Use uma imagem quadrada. Sem URL, aparece o círculo DA.</small></label></div>
    <div class="chat-menu-toolbar"><div><strong>Opções do menu</strong><div class="chat-menu-note">Você pode mudar nome, ordem, ativar/desativar e editar as respostas.</div></div><button id="chatMenuAddText" class="button secondary small" type="button">+ Nova resposta</button></div>
    <div id="chatMenuItems" class="chat-menu-items">${items.map(itemHtml).join('')||'<div class="chat-menu-empty">Nenhuma opção.</div>'}</div>
    <div class="chat-menu-savebar"><small id="chatMenuSavedAt">${config.updated_at?'Última alteração: '+new Date(config.updated_at).toLocaleString('pt-BR'):''}</small><button id="chatMenuReload" class="button secondary" type="button">Recarregar</button><button id="chatMenuSave" class="button primary" type="button" ${canWrite?'':'disabled'}>Salvar Menu do Chat</button></div>
  </div><aside class="chat-menu-preview-card"><div class="eyebrow">Prévia</div><h3>Como aparece no chat</h3><div class="chat-menu-preview-phone"><div class="chat-menu-preview-title">Conversa com Dona Antônia</div><div class="chat-menu-preview-list" id="chatMenuPreviewList"></div><div class="chat-menu-preview-helper"><div class="chat-menu-preview-prompt" id="chatMenuPreviewPrompt"></div><div class="chat-menu-preview-avatar" id="chatMenuPreviewAvatar">DA</div></div></div></aside></div>`;
    bindEditor();updatePreview();
  }

  function readItems(){return [...document.querySelectorAll('#chatMenuItems [data-menu-item]')].map((row,index)=>({id:row.dataset.id||`item-${index+1}`,kind:row.dataset.kind||'text',enabled:row.querySelector('[data-field="enabled"]')?.checked!==false,label:txt(row.querySelector('[data-field="label"]')?.value)||'Opção',sort_order:Number(row.querySelector('[data-field="sort_order"]')?.value||((index+1)*10)),response_text:txt(row.querySelector('[data-field="response_text"]')?.value)}))}
  function renumber(){[...document.querySelectorAll('#chatMenuItems [data-menu-item]')].forEach((row,i)=>{const order=row.querySelector('[data-field="sort_order"]');if(order)order.value=String((i+1)*10)});updatePreview()}
  function updatePreview(){const prompt=$('chatMenuPreviewPrompt'),avatar=$('chatMenuPreviewAvatar'),list=$('chatMenuPreviewList');if(prompt)prompt.textContent=txt($('chatMenuPrompt')?.value)||'Quer ajuda?';if(avatar){const url=safeAvatar($('chatMenuAvatar')?.value);avatar.innerHTML=url?`<img src="${esc(url)}" alt="Dona Antônia" onerror="this.parentElement.textContent='DA'">`:'DA'}if(list){const items=readItems().filter(x=>x.enabled).sort((a,b)=>a.sort_order-b.sort_order);list.innerHTML=items.map(x=>`<div>${esc(x.label)}</div>`).join('')||'<div>Menu oculto</div>'}const preview=$('chatMenuAvatarPreview');if(preview){const url=safeAvatar($('chatMenuAvatar')?.value);preview.innerHTML=url?`<img src="${esc(url)}" alt="Dona Antônia" onerror="this.parentElement.textContent='DA'">`:'DA'}}

  function bindEditor(){
    ['chatMenuEnabled','chatMenuPrompt','chatMenuAvatar'].forEach(id=>{const el=$(id);if(el){el.addEventListener('input',updatePreview);el.addEventListener('change',updatePreview)}});
    $('chatMenuItems')?.addEventListener('input',updatePreview);$('chatMenuItems')?.addEventListener('change',updatePreview);
    $('chatMenuItems')?.addEventListener('click',e=>{const row=e.target.closest('[data-menu-item]');if(!row)return;if(e.target.closest('[data-remove]')){row.remove();renumber();return}const move=e.target.closest('[data-move]');if(!move)return;if(move.dataset.move==='up'&&row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);if(move.dataset.move==='down'&&row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);renumber()});
    $('chatMenuAddText').onclick=()=>{const host=$('chatMenuItems');const i=host.querySelectorAll('[data-menu-item]').length;host.insertAdjacentHTML('beforeend',itemHtml({id:`custom-${Date.now()}`,label:'Nova opção',kind:'text',enabled:true,sort_order:(i+1)*10,response_text:'Escreva aqui a resposta que aparecerá no chat.'},i));renumber()};
    $('chatMenuReload').onclick=()=>load(true);$('chatMenuSave').onclick=save;
  }

  async function save(){const button=$('chatMenuSave');button.disabled=true;try{const payload={enabled:$('chatMenuEnabled')?.checked!==false,prompt_text:txt($('chatMenuPrompt')?.value),avatar_url:txt($('chatMenuAvatar')?.value),menu_items:readItems()};const d=await api('save',payload);config=d.config;toast('Menu do Chat salvo.','success');render()}catch(e){toast(e.message,'error')}finally{if($('chatMenuSave'))$('chatMenuSave').disabled=!canWrite}}
  async function load(force=false){if(loading||(!force&&loaded))return;loading=true;ensureBase();const body=$('chatMenuAdminBody');if(body)body.innerHTML='<div class="empty">Carregando Menu do Chat…</div>';try{const d=await api('get');config=d.config||{};canWrite=d.can_write!==false;loaded=true;render()}catch(e){if(body)body.innerHTML=`<div class="empty">${esc(e.message)}</div>`}finally{loading=false}}
  function bind(){ensureBase();const v=view();if(v)new MutationObserver(()=>{if(active())load(false)}).observe(v,{attributes:true,attributeFilter:['class']});document.querySelector('[data-route="chat-menu"]')?.addEventListener('click',()=>setTimeout(()=>load(false),0));if(active())load(false)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
