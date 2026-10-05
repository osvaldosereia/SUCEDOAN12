import {attendanceAuthorizedFetch,attendanceJsonApi} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const TEMPLATE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-templates-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const TEMPLATE_TYPES=[
  {key:'quick_reply',title:'Resposta rápida',text:'Mensagem curta para usar durante o atendimento.'},
  {key:'attendance',title:'Atendimento',text:'Template utilitário para iniciar ou retomar uma conversa.'},
  {key:'campaign',title:'Campanha',text:'Mensagem promocional aprovada pela Meta.'},
  {key:'carousel',title:'Carrossel',text:'Campanha com cartões de produtos, imagens e botões.'}
];
let accountsCache=null;
let observerStarted=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const channelByPhone=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.endsWith('0975')?'0975':digits.endsWith('1018')?'1018':'Outro'};

async function adminPost(action,body){
  const url=new URL(TEMPLATE_API);url.searchParams.set('action',action);
  const response=await attendanceAuthorizedFetch(url,{method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`template_${response.status}`);error.payload=data;throw error}
  return data;
}

async function loadAccounts(){
  if(accountsCache)return accountsCache;
  const data=await attendanceJsonApi('accounts',{},'GET');
  accountsCache=(data.items||[]).filter(item=>item?.id&&['0975','1018'].includes(channelByPhone(item.phone_e164)));
  return accountsCache;
}

function closeDialog(dialog){try{dialog.close()}catch{}dialog.remove()}

function shellDialog(title,body){
  const dialog=document.createElement('dialog');
  dialog.className='marketing-template-dialog marketing-simple-dialog';
  dialog.innerHTML=`<div class="marketing-template-dialog-head"><strong>${esc(title)}</strong><button type="button" aria-label="Fechar" data-simple-close>×</button></div><div class="marketing-template-dialog-body">${body}</div>`;
  dialog.querySelector('[data-simple-close]')?.addEventListener('click',()=>closeDialog(dialog));
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog)});
  document.body.appendChild(dialog);dialog.showModal();return dialog;
}

function typePickerHtml(){
  return `<div class="marketing-template-type-picker"><p>Escolha o tipo de mensagem que deseja criar.</p><div class="marketing-template-type-grid">${TEMPLATE_TYPES.map(type=>`<button type="button" data-template-type="${type.key}"><strong>${type.title}</strong><span>${type.text}</span></button>`).join('')}</div></div>`;
}

function openTemplateTypePicker(){
  const dialog=shellDialog('Novo modelo de mensagem',typePickerHtml());
  dialog.querySelectorAll('[data-template-type]').forEach(button=>button.addEventListener('click',()=>{
    const type=String(button.dataset.templateType||'');
    closeDialog(dialog);
    if(type==='quick_reply'){
      const info=shellDialog('Resposta rápida','<p>As respostas rápidas ficam disponíveis no Atendimento. Esta opção não cria template Meta.</p><div class="marketing-template-dialog-actions"><button type="button" class="primary" data-simple-close-action>Entendi</button></div>');
      info.querySelector('[data-simple-close-action]')?.addEventListener('click',()=>closeDialog(info));
      return;
    }
    if(type==='carousel'){
      if(window.DAMarketingCarouselEditor?.open)return window.DAMarketingCarouselEditor.open();
      const info=shellDialog('Carrossel','<p>O editor visual de Carrossel usa de 2 a 10 cartões. Ele será aberto aqui quando o módulo estiver disponível.</p><div class="marketing-template-dialog-actions"><button type="button" class="primary" data-simple-close-action>Fechar</button></div>');
      info.querySelector('[data-simple-close-action]')?.addEventListener('click',()=>closeDialog(info));
      return;
    }
    openSimpleTemplateEditor(type);
  }));
  return dialog;
}

function simpleEditorHtml(type){
  const category=type==='attendance'?'UTILITY':'MARKETING';
  return `<form data-template-simple-form data-template-kind="${type}">
    <div class="marketing-template-form-grid">
      <label><span>Nome</span><input name="name" required maxlength="512" placeholder="ex.: ofertas_outubro"></label>
      <label><span>Canal</span><select name="account_id" required><option value="">Carregando…</option></select></label>
      <label><span>Categoria</span><select name="category" required><option value="${category}">${category==='UTILITY'?'Utilidade':'Marketing'}</option></select></label>
      <label><span>Idioma</span><select name="language"><option value="pt_BR">Português (Brasil)</option></select></label>
      <label class="wide"><span>Mensagem</span><textarea name="body" required maxlength="1024" placeholder="Digite a mensagem que será aprovada pela Meta"></textarea></label>
      <label class="wide"><span>Rodapé</span><input name="footer" maxlength="60" placeholder="Opcional"></label>
      <label><span>Botão</span><input name="button_text" maxlength="25" placeholder="Opcional"></label>
      <label><span>Link do botão</span><input name="button_url" type="url" placeholder="https://..."></label>
    </div>
    <details data-template-advanced class="marketing-template-simple-advanced"><summary>Opções avançadas</summary>
      <div class="marketing-template-form-grid">
        <label class="wide"><span>Exemplos das variáveis</span><input name="body_examples" placeholder="Valor 1 | Valor 2"></label>
        <label class="wide"><span>Respostas rápidas</span><textarea name="quick_replies" placeholder="Uma resposta por linha"></textarea></label>
      </div>
    </details>
    <div data-template-simple-status class="marketing-template-status" role="status" aria-live="polite"></div>
    <div class="marketing-template-dialog-actions"><button type="button" data-simple-cancel>Cancelar</button><button type="submit" class="primary" data-template-simple-submit>Salvar modelo</button></div>
  </form>`;
}

async function openSimpleTemplateEditor(type='campaign'){
  const title=type==='attendance'?'Novo template de Atendimento':'Novo template de Campanha';
  const dialog=shellDialog(title,simpleEditorHtml(type));
  const form=dialog.querySelector('[data-template-simple-form]');
  const accounts=await loadAccounts().catch(()=>[]);
  const select=form.elements.account_id;
  select.innerHTML='<option value="">Selecione</option>'+accounts.map(account=>`<option value="${esc(account.id)}">${esc(channelByPhone(account.phone_e164))} · ${esc(account.display_name||'WhatsApp')}</option>`).join('');
  form.querySelector('[data-simple-cancel]')?.addEventListener('click',()=>closeDialog(dialog));
  form.addEventListener('submit',event=>submitSimpleTemplate(event,dialog));
  return dialog;
}

function buildDraft(form){
  const body=String(form.elements.body?.value||'').trim();
  const footer=String(form.elements.footer?.value||'').trim();
  const buttonText=String(form.elements.button_text?.value||'').trim();
  const buttonUrl=String(form.elements.button_url?.value||'').trim();
  const examples=String(form.elements.body_examples?.value||'').split('|').map(value=>value.trim()).filter(Boolean);
  const quickReplies=String(form.elements.quick_replies?.value||'').split('\n').map(value=>value.trim()).filter(Boolean).slice(0,5);
  const components=[];
  const bodyComponent={type:'BODY',text:body};
  if(/\{\{\d+\}\}/.test(body)&&examples.length)bodyComponent.example={body_text:[examples]};
  components.push(bodyComponent);
  if(footer)components.push({type:'FOOTER',text:footer});
  const buttons=[];
  if(buttonText&&buttonUrl)buttons.push({type:'URL',text:buttonText,url:buttonUrl});
  for(const text of quickReplies)buttons.push({type:'QUICK_REPLY',text});
  if(buttons.length)components.push({type:'BUTTONS',buttons});
  return {name:String(form.elements.name?.value||'').trim(),language:String(form.elements.language?.value||'pt_BR'),category:String(form.elements.category?.value||'MARKETING'),components};
}

async function submitSimpleTemplate(event,dialog){
  event.preventDefault();
  const form=event.currentTarget;
  const button=form.querySelector('[data-template-simple-submit]');
  const status=form.querySelector('[data-template-simple-status]');
  const accountId=String(form.elements.account_id?.value||'').trim();
  if(!accountId){status.textContent='Selecione o canal.';return}
  const draft=buildDraft(form);
  if(!draft.name||!draft.components[0]?.text){status.textContent='Informe nome e mensagem.';return}
  button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Salvando…';status.textContent='Enviando o modelo para a Meta…';
  try{
    await adminPost('create',{account_id:accountId,draft});
    status.textContent='Modelo salvo. Atualizando a lista…';
    closeDialog(dialog);
    await window.DAMarketingTemplateCenter?.mountTemplateView?.(document.querySelector('#content'));
  }catch(error){status.textContent=`Não foi possível salvar: ${String(error?.message||error)}`}
  finally{if(button.isConnected){button.disabled=false;button.setAttribute('aria-busy','false');button.textContent='Salvar modelo'}}
}

function simplifyToolbar(center){
  const toolbar=center.querySelector('.marketing-template-toolbar');if(!toolbar)return;
  const language=toolbar.querySelector('[data-template-filter="language"]')?.closest('label');if(language)language.hidden=true;
  const category=toolbar.querySelector('[data-template-filter="category"]')?.closest('label');if(category)category.querySelector('span').textContent='Tipo';
  const search=toolbar.querySelector('[data-template-filter="search"]')?.closest('label');if(search)search.querySelector('span').textContent='Pesquisar';
}

function updateCount(center){
  const head=center.querySelector('.marketing-template-head');if(!head)return;
  const count=center.querySelectorAll('.marketing-template-row').length;
  const title=head.querySelector('h2');if(title)title.textContent='Modelos de mensagem';
  const subtitle=head.querySelector('p');if(subtitle)subtitle.textContent=`${count} modelo(s) encontrado(s)`;
}

function enhanceTemplateCenter(root=document.querySelector('#content')){
  const center=root?.querySelector?.('.marketing-template-center');if(!center)return;
  simplifyToolbar(center);updateCount(center);
  const original=center.querySelector('[data-template-create]');
  if(original&&!original.dataset.simpleBound){
    const replacement=original.cloneNode(true);replacement.dataset.simpleBound='1';replacement.textContent='+ Novo';
    original.replaceWith(replacement);
    replacement.addEventListener('click',()=>openTemplateTypePicker());
  }
  const sync=center.querySelector('[data-template-sync]');if(sync)sync.textContent=sync.dataset.syncState==='syncing'?sync.textContent:'Sincronizar';
}

function observe(){
  if(observerStarted)return;observerStarted=true;
  const observer=new MutationObserver(()=>enhanceTemplateCenter());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  enhanceTemplateCenter();
}

observe();
window.DAMarketingTemplateSimple={openTemplateTypePicker,openSimpleTemplateEditor,submitSimpleTemplate,enhanceTemplateCenter};
export {openTemplateTypePicker,openSimpleTemplateEditor,submitSimpleTemplate,enhanceTemplateCenter};
