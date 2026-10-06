import {attendanceAuthorizedFetch,attendanceJsonApi} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const TEMPLATE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-templates-v1';
const TEMPLATE_MEDIA_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-template-carousel-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
const TEMPLATE_TYPES=[
  {key:'standard',title:'Modelo padrão',text:'Texto, mídia e botões para utilidade ou marketing.'},
  {key:'carousel',title:'Carrossel',text:'Produtos e ofertas em cartões com imagem e botão.'},
  {key:'catalog',title:'Catálogo / Produtos',text:'Mensagem que leva o cliente ao catálogo do WhatsApp.'},
  {key:'authentication',title:'Autenticação',text:'Código OTP com botão para copiar o código.'}
];
const HEADER_LABELS={NONE:'Nenhum',TEXT:'Texto',IMAGE:'Imagem',VIDEO:'Vídeo',DOCUMENT:'Documento',LOCATION:'Localização'};
const BUTTON_LABELS={NONE:'Nenhum',QUICK_REPLY:'Resposta rápida',URL:'Abrir site',PHONE_NUMBER:'Telefonar',CATALOG:'Catálogo',OTP:'OTP'};
let accountsCache=null;
let observerStarted=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const channelByPhone=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.endsWith('0975')?'0975':digits.endsWith('1018')?'1018':'Outro'};

function ensurePickerStyles(){
  if(document.querySelector('link[data-marketing-template-picker-css]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/vitrine/admin/marketing/template-type-picker.css?v=marketing-template-picker-v2';link.dataset.marketingTemplatePickerCss='1';document.head.appendChild(link);
}

async function adminPost(action,body){
  const url=new URL(TEMPLATE_API);url.searchParams.set('action',action);
  const response=await attendanceAuthorizedFetch(url,{method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`template_${response.status}`);error.payload=data;throw error}
  return data;
}

async function uploadTemplateMedia(accountId,file){
  const url=new URL(TEMPLATE_MEDIA_API);url.searchParams.set('action','upload_media');
  const form=new FormData();form.set('account_id',accountId);form.set('file',file);
  const response=await attendanceAuthorizedFetch(url,{method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY},body:form,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`template_media_${response.status}`);error.payload=data;throw error}
  return data;
}

async function loadAccounts(){
  if(accountsCache)return accountsCache;
  const data=await attendanceJsonApi('accounts',{},'GET');
  accountsCache=(data.items||[]).filter(item=>item?.id&&['0975','1018'].includes(channelByPhone(item.phone_e164)));
  return accountsCache;
}

function closeDialog(dialog){try{dialog.close()}catch{}dialog.remove()}

function shellDialog(title,body,{wide=false}={}){
  ensurePickerStyles();
  const dialog=document.createElement('dialog');
  dialog.className=`marketing-template-dialog marketing-simple-dialog${wide?' marketing-simple-dialog-wide':''}`;
  dialog.innerHTML=`<div class="marketing-template-dialog-head"><strong>${esc(title)}</strong><button type="button" aria-label="Fechar" data-simple-close>×</button></div><div class="marketing-template-dialog-body">${body}</div>`;
  dialog.querySelector('[data-simple-close]')?.addEventListener('click',()=>closeDialog(dialog));
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog)});
  document.body.appendChild(dialog);dialog.showModal();return dialog;
}

function typePickerHtml(){
  return `<div class="marketing-template-type-picker"><p>O que você quer criar?</p><div class="marketing-template-type-grid">${TEMPLATE_TYPES.map(type=>`<button type="button" data-template-type="${type.key}"><strong>${type.title}</strong><span>${type.text}</span></button>`).join('')}</div></div>`;
}

function openTemplateTypePicker(){
  const dialog=shellDialog('Novo template',typePickerHtml());
  dialog.querySelectorAll('[data-template-type]').forEach(button=>button.addEventListener('click',()=>{
    const type=String(button.dataset.templateType||'standard');
    closeDialog(dialog);
    if(type==='carousel'){
      if(window.DAMarketingCarouselEditor?.open)return window.DAMarketingCarouselEditor.open();
      const info=shellDialog('Carrossel','<p>O editor de carrossel não foi carregado. Reabra o Marketing e tente novamente.</p><div class="marketing-template-dialog-actions"><button type="button" class="primary" data-simple-close-action>Fechar</button></div>');
      info.querySelector('[data-simple-close-action]')?.addEventListener('click',()=>closeDialog(info));
      return;
    }
    openSimpleTemplateEditor(type);
  }));
  return dialog;
}

function standardFields(type){
  const auth=type==='authentication';
  const catalog=type==='catalog';
  if(auth){
    return `<section class="template-editor-section"><h4>Autenticação</h4><label class="check"><input type="checkbox" name="security_recommendation" checked> <span>Adicionar recomendação de segurança</span></label><label><span>Validade do código (minutos)</span><input name="expiration_minutes" type="number" min="1" max="90" value="10"></label><label><span>Botões</span><select name="button_type"><option value="OTP">OTP</option></select></label><label><span>Tipo do OTP</span><select name="otp_type"><option value="COPY_CODE">Copiar código</option></select></label></section>`;
  }
  return `<section class="template-editor-section"><h4>Cabeçalho</h4><label><span>Cabeçalho</span><select name="header_type">${Object.entries(HEADER_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><div data-template-header-fields></div></section>
    <section class="template-editor-section"><div class="template-section-title"><h4>Mensagem</h4><button type="button" class="secondary small" data-template-add-variable>+ variável</button></div><label class="wide"><span>Mensagem</span><textarea name="body" required maxlength="1024" placeholder="Digite a mensagem que será enviada ao cliente"></textarea></label><div class="template-variable-examples" data-template-variable-examples></div></section>
    <section class="template-editor-section"><h4>Rodapé</h4><label class="wide"><span>Rodapé</span><input name="footer" maxlength="60" placeholder="Opcional"></label></section>
    <section class="template-editor-section"><h4>Botões</h4><label><span>Botões</span><select name="button_type">${Object.entries(BUTTON_LABELS).filter(([key])=>!['OTP'].includes(key)&&(!catalog||['NONE','CATALOG'].includes(key))).map(([value,label])=>`<option value="${value}"${catalog&&value==='CATALOG'?' selected':''}>${label}</option>`).join('')}</select></label><div data-template-button-fields></div></section>`;
}

function previewHtml(){
  return `<aside class="marketing-whatsapp-preview" aria-label="Prévia do WhatsApp"><div class="marketing-whatsapp-preview-title">Prévia do WhatsApp</div><div class="marketing-whatsapp-phone"><div class="marketing-whatsapp-bubble"><div data-template-preview-header class="preview-header" hidden></div><div data-template-preview-body class="preview-body">Sua mensagem aparecerá aqui.</div><div data-template-preview-footer class="preview-footer" hidden></div><div data-template-preview-buttons class="preview-buttons"></div><time>agora</time></div></div></aside>`;
}

function simpleEditorHtml(type){
  const category=type==='authentication'?'AUTHENTICATION':type==='catalog'?'MARKETING':'MARKETING';
  const categoryOptions=type==='standard'?'<option value="MARKETING">Marketing</option><option value="UTILITY">Utilidade</option>':`<option value="${category}">${category==='AUTHENTICATION'?'Autenticação':'Marketing'}</option>`;
  return `<div class="marketing-template-editor-layout"><form data-template-simple-form data-template-kind="${type}"><section class="template-editor-section"><h4>Informações gerais</h4><div class="marketing-template-form-grid"><label><span>Nome</span><input name="name" required maxlength="512" placeholder="ex.: ofertas_outubro"></label><label><span>Canal WhatsApp</span><select name="account_id" required><option value="">Carregando…</option></select></label><label><span>Categoria</span><select name="category" required>${categoryOptions}</select></label><label><span>Idioma</span><select name="language"><option value="pt_BR">Português (Brasil)</option></select></label></div></section>${standardFields(type)}<div data-template-simple-status class="marketing-template-status" role="status" aria-live="polite"></div><div class="marketing-template-dialog-actions"><button type="button" data-simple-cancel>Cancelar</button><button type="submit" class="primary" data-template-simple-submit>Enviar para análise</button></div></form>${previewHtml()}</div>`;
}

function headerFieldsHtml(type){
  if(type==='TEXT')return '<label class="wide"><span>Texto do cabeçalho</span><input name="header_text" maxlength="60" placeholder="Ex.: Oferta da semana"></label><label class="wide"><span>Exemplo das variáveis do cabeçalho</span><input name="header_examples" placeholder="Exemplo 1 | Exemplo 2"></label>';
  if(['IMAGE','VIDEO','DOCUMENT'].includes(type)){
    const accept=type==='IMAGE'?'image/jpeg,image/png':type==='VIDEO'?'video/mp4':'application/pdf';
    return `<label class="wide"><span>${HEADER_LABELS[type]} de exemplo</span><input type="file" data-template-media-file name="header_file" accept="${accept}" required><small>Usada somente como amostra para aprovação do template.</small></label>`;
  }
  if(type==='LOCATION')return '<p class="template-field-help">A mensagem terá um cabeçalho de localização. Os dados reais da localização são enviados no momento do disparo.</p>';
  return '<p class="template-field-help">Sem cabeçalho.</p>';
}

function buttonFieldsHtml(type){
  if(type==='QUICK_REPLY')return '<label><span>Texto do botão</span><input name="button_text" maxlength="25" value="Quero saber mais"></label>';
  if(type==='URL')return '<label><span>Texto do botão</span><input name="button_text" maxlength="25" value="Abrir site"></label><label><span>Link</span><input name="button_value" type="url" placeholder="https://..."></label>';
  if(type==='PHONE_NUMBER')return '<label><span>Texto do botão</span><input name="button_text" maxlength="25" value="Telefonar"></label><label><span>Telefone</span><input name="button_value" inputmode="tel" placeholder="5565999999999"></label>';
  if(type==='CATALOG')return '<label><span>Texto do botão</span><input name="button_text" maxlength="25" value="Ver catálogo"></label>';
  return '<p class="template-field-help">Sem botão.</p>';
}

function variableCount(textValue){
  const values=[...String(textValue||'').matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1])).filter(Number.isFinite);
  return values.length?Math.max(...values):0;
}

function renderVariableExamples(form){
  const holder=form.querySelector('[data-template-variable-examples]');if(!holder)return;
  const count=variableCount(form.elements.body?.value||'');
  const previous=[...holder.querySelectorAll('input')].map(input=>input.value);
  holder.innerHTML=count?`<strong>Exemplos das variáveis</strong><div>${Array.from({length:count},(_,index)=>`<label><span>{{${index+1}}}</span><input name="body_example_${index+1}" value="${esc(previous[index]||'')}" placeholder="Exemplo ${index+1}" required></label>`).join('')}</div>`:'';
}

function insertTemplateVariable(form){
  const input=form.elements.body;if(!input)return;
  const next=variableCount(input.value)+1;
  const token=`{{${next}}}`;
  const start=Number.isInteger(input.selectionStart)?input.selectionStart:input.value.length;
  const end=Number.isInteger(input.selectionEnd)?input.selectionEnd:start;
  input.value=`${input.value.slice(0,start)}${token}${input.value.slice(end)}`;
  input.focus();input.setSelectionRange(start+token.length,start+token.length);
  renderVariableExamples(form);updateWhatsAppPreview(form);
}

function updateWhatsAppPreview(form){
  const scope=form.closest('.marketing-template-editor-layout');if(!scope)return;
  const type=form.dataset.templateKind||'standard';
  const header=scope.querySelector('[data-template-preview-header]');
  const body=scope.querySelector('[data-template-preview-body]');
  const footer=scope.querySelector('[data-template-preview-footer]');
  const buttons=scope.querySelector('[data-template-preview-buttons]');
  if(type==='authentication'){
    header.hidden=true;body.textContent='Seu código de verificação é {{1}}.';footer.hidden=false;footer.textContent=`Este código expira em ${form.elements.expiration_minutes?.value||10} minutos.`;buttons.innerHTML='<button type="button" disabled>Copiar código</button>';return;
  }
  const headerType=String(form.elements.header_type?.value||'NONE');
  header.hidden=headerType==='NONE';
  if(headerType==='TEXT')header.textContent=String(form.elements.header_text?.value||'Cabeçalho');
  else if(headerType!=='NONE')header.textContent=`${HEADER_LABELS[headerType]||headerType} no cabeçalho`;
  body.textContent=String(form.elements.body?.value||'Sua mensagem aparecerá aqui.');
  const footerText=String(form.elements.footer?.value||'');footer.hidden=!footerText;footer.textContent=footerText;
  const buttonType=String(form.elements.button_type?.value||'NONE');
  const buttonText=String(form.elements.button_text?.value||BUTTON_LABELS[buttonType]||'');buttons.innerHTML=buttonType==='NONE'?'':`<button type="button" disabled>${esc(buttonText)}</button>`;
}

function bindDynamicFields(form){
  const headerSelect=form.elements.header_type;
  const buttonSelect=form.elements.button_type;
  const refreshHeader=()=>{const holder=form.querySelector('[data-template-header-fields]');if(holder)holder.innerHTML=headerFieldsHtml(String(headerSelect?.value||'NONE'));updateWhatsAppPreview(form)};
  const refreshButtons=()=>{const holder=form.querySelector('[data-template-button-fields]');if(holder)holder.innerHTML=buttonFieldsHtml(String(buttonSelect?.value||'NONE'));updateWhatsAppPreview(form)};
  headerSelect?.addEventListener('change',refreshHeader);buttonSelect?.addEventListener('change',refreshButtons);
  form.querySelector('[data-template-add-variable]')?.addEventListener('click',()=>insertTemplateVariable(form));
  form.addEventListener('input',event=>{if(event.target===form.elements.body)renderVariableExamples(form);updateWhatsAppPreview(form)});
  form.addEventListener('change',()=>updateWhatsAppPreview(form));
  refreshHeader();refreshButtons();renderVariableExamples(form);updateWhatsAppPreview(form);
}

async function openSimpleTemplateEditor(type='standard'){
  const titles={standard:'Novo modelo padrão',catalog:'Novo template de Catálogo',authentication:'Novo template de Autenticação'};
  const dialog=shellDialog(titles[type]||'Novo template',simpleEditorHtml(type),{wide:true});
  const form=dialog.querySelector('[data-template-simple-form]');
  const accounts=await loadAccounts().catch(()=>[]);
  const select=form.elements.account_id;
  select.innerHTML='<option value="">Selecione</option>'+accounts.map(account=>`<option value="${esc(account.id)}">${esc(channelByPhone(account.phone_e164))} · ${esc(account.display_name||'WhatsApp')}</option>`).join('');
  form.querySelector('[data-simple-cancel]')?.addEventListener('click',()=>closeDialog(dialog));
  form.addEventListener('submit',event=>submitSimpleTemplate(event,dialog));
  bindDynamicFields(form);
  return dialog;
}

function normalizePhone(value){return String(value||'').replace(/\D/g,'').slice(0,20)}

async function buildDraft(form,accountId){
  const type=form.dataset.templateKind||'standard';
  const name=String(form.elements.name?.value||'').trim();
  const language=String(form.elements.language?.value||'pt_BR');
  const category=String(form.elements.category?.value||'MARKETING');
  if(type==='authentication'){
    const expiration=Math.max(1,Math.min(90,Number(form.elements.expiration_minutes?.value||10)));
    return {name,language,category:'AUTHENTICATION',components:[{type:'BODY',add_security_recommendation:Boolean(form.elements.security_recommendation?.checked)},{type:'FOOTER',code_expiration_minutes:expiration},{type:'BUTTONS',buttons:[{type:'OTP',otp_type:String(form.elements.otp_type?.value||'COPY_CODE'),text:'Copiar código'}]}]};
  }
  const components=[];
  const headerType=String(form.elements.header_type?.value||'NONE');
  if(headerType==='TEXT'){
    const headerText=String(form.elements.header_text?.value||'').trim();
    const component={type:'HEADER',format:'TEXT',text:headerText};
    const headerExamples=String(form.elements.header_examples?.value||'').split('|').map(item=>item.trim()).filter(Boolean);
    if(variableCount(headerText)&&headerExamples.length)component.example={header_text:headerExamples};
    components.push(component);
  }else if(['IMAGE','VIDEO','DOCUMENT'].includes(headerType)){
    const file=form.querySelector('[data-template-media-file]')?.files?.[0];if(!file)throw new Error('Selecione o arquivo de exemplo do cabeçalho.');
    const uploaded=await uploadTemplateMedia(accountId,file);components.push({type:'HEADER',format:headerType,example:{header_handle:[uploaded.handle]}});
  }else if(headerType==='LOCATION')components.push({type:'HEADER',format:'LOCATION'});
  const bodyText=String(form.elements.body?.value||'').trim();
  const body={type:'BODY',text:bodyText};
  const count=variableCount(bodyText);
  if(count){
    const examples=Array.from({length:count},(_,index)=>String(form.elements[`body_example_${index+1}`]?.value||'').trim());
    if(examples.some(value=>!value))throw new Error('Preencha os exemplos de todas as variáveis.');
    body.example={body_text:[examples]};
  }
  components.push(body);
  const footer=String(form.elements.footer?.value||'').trim();if(footer)components.push({type:'FOOTER',text:footer});
  const buttonType=String(form.elements.button_type?.value||'NONE');
  if(buttonType!=='NONE'){
    const button={type:buttonType,text:String(form.elements.button_text?.value||BUTTON_LABELS[buttonType]||'').trim()};
    if(buttonType==='URL')button.url=String(form.elements.button_value?.value||'').trim();
    if(buttonType==='PHONE_NUMBER')button.phone_number=normalizePhone(form.elements.button_value?.value);
    components.push({type:'BUTTONS',buttons:[button]});
  }
  return {name,language,category,components};
}

function friendlyError(error){
  const code=String(error?.payload?.error||error?.message||'').trim();
  const map={meta_template_examples_required:'Preencha os exemplos das variáveis.',meta_template_component_unsupported:'Esse recurso ainda não é aceito pela configuração da Meta.',meta_template_buttons_invalid:'Revise os dados dos botões.',meta_template_header_invalid:'Revise o cabeçalho.',carousel_media_invalid:'O arquivo escolhido não é aceito.',meta_template_mutation_uncertain:'A Meta pode ter recebido a alteração. Sincronize antes de tentar novamente.'};
  return map[code]||code||'Erro inesperado ao enviar o template.';
}

async function submitSimpleTemplate(event,dialog){
  event.preventDefault();
  const form=event.currentTarget;
  const button=form.querySelector('[data-template-simple-submit]');
  const status=form.querySelector('[data-template-simple-status]');
  const accountId=String(form.elements.account_id?.value||'').trim();
  if(!accountId){status.textContent='Selecione o canal WhatsApp.';return}
  button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Enviando…';status.textContent='Preparando o template para análise da Meta…';
  try{
    const draft=await buildDraft(form,accountId);
    if(!draft.name){status.textContent='Informe o nome do template.';return}
    await adminPost('create',{account_id:accountId,draft});
    status.textContent='Template enviado para análise. Atualizando a lista…';
    closeDialog(dialog);
    await window.DAMarketingTemplateCenter?.mountTemplateView?.(document.querySelector('#content'));
  }catch(error){status.textContent=`Não foi possível enviar. ${friendlyError(error)}`}
  finally{if(button.isConnected){button.disabled=false;button.setAttribute('aria-busy','false');button.textContent='Enviar para análise'}}
}

function simplifyToolbar(center){
  const toolbar=center.querySelector('.marketing-template-toolbar');if(!toolbar)return;
  const category=toolbar.querySelector('[data-template-filter="category"]')?.closest('label');if(category)category.querySelector('span').textContent='Categoria';
  const search=toolbar.querySelector('[data-template-filter="search"]')?.closest('label');if(search)search.querySelector('span').textContent='Busca';
}

function enhanceTemplateCenter(root=document.querySelector('#content')){
  const center=root?.querySelector?.('.marketing-template-center');if(!center)return;
  simplifyToolbar(center);
  const head=center.querySelector('.marketing-template-head');if(head){const title=head.querySelector('h2');if(title)title.textContent='Templates de mensagem';const subtitle=head.querySelector('p');if(subtitle)subtitle.textContent='Crie, edite e acompanhe seus modelos do WhatsApp.'}
  const original=center.querySelector('[data-template-create]');
  if(original&&!original.dataset.simpleBound){
    const replacement=original.cloneNode(true);replacement.dataset.simpleBound='1';replacement.textContent='+ Novo template';
    original.replaceWith(replacement);replacement.addEventListener('click',()=>openTemplateTypePicker());
  }
  const sync=center.querySelector('[data-template-sync]');if(sync&&sync.dataset.syncState!=='syncing')sync.textContent='Sincronizar com Meta';
}

function observe(){
  if(observerStarted)return;observerStarted=true;ensurePickerStyles();
  const observer=new MutationObserver(()=>enhanceTemplateCenter());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  enhanceTemplateCenter();
}

observe();
window.DAMarketingTemplateSimple={openTemplateTypePicker,openSimpleTemplateEditor,submitSimpleTemplate,enhanceTemplateCenter,updateWhatsAppPreview,insertTemplateVariable};
export {openTemplateTypePicker,openSimpleTemplateEditor,submitSimpleTemplate,enhanceTemplateCenter,updateWhatsAppPreview,insertTemplateVariable};
