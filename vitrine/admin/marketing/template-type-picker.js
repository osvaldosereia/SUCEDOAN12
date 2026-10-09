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
const STATUS_LABELS={APPROVED:'Aprovado',PENDING:'Em análise',REJECTED:'Rejeitado',IN_APPEAL:'Em recurso',FLAGGED:'Atenção',DISABLED:'Desativado',PENDING_DELETION:'Excluindo',PAUSED:'Pausado',UNKNOWN:'Não informado'};
let accountsCache=null;
let observerStarted=false;
let captureBound=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const channelByPhone=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.endsWith('0975')?'0975':digits.endsWith('1018')?'1018':'Outro'};
const component=(item,type)=>(Array.isArray(item?.components)?item.components:[]).find(entry=>String(entry?.type||'').toUpperCase()===type)||null;
const templateButtons=item=>Array.isArray(component(item,'BUTTONS')?.buttons)?component(item,'BUTTONS').buttons:[];
const fmtDate=value=>{const date=new Date(value||0);return Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const statusLabel=value=>STATUS_LABELS[String(value||'UNKNOWN').toUpperCase()]||String(value||'Não informado');

function ensurePickerStyles(){
  if(document.querySelector('link[data-marketing-template-picker-css]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/vitrine/admin/marketing/template-type-picker.css?v=marketing-template-picker-v3';link.dataset.marketingTemplatePickerCss='1';document.head.appendChild(link);
}

async function adminGet(params={}){
  const url=new URL(TEMPLATE_API);for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  const response=await attendanceAuthorizedFetch(url,{method:'GET',headers:{apikey:ADMIN_PUBLIC_KEY},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`template_${response.status}`);error.payload=data;throw error}
  return data;
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

function simpleEditorHtml(type,item=null){
  const category=type==='authentication'?'AUTHENTICATION':type==='catalog'?'MARKETING':'MARKETING';
  const categoryOptions=type==='standard'?'<option value="MARKETING">Marketing</option><option value="UTILITY">Utilidade</option>':`<option value="${category}">${category==='AUTHENTICATION'?'Autenticação':'Marketing'}</option>`;
  return `<div class="marketing-template-editor-layout"><form data-template-simple-form data-template-kind="${type}" data-template-id="${esc(item?.id||'')}"><section class="template-editor-section"><h4>Informações gerais</h4><div class="marketing-template-form-grid"><label><span>Nome</span><input name="name" required maxlength="512" placeholder="ex.: ofertas_outubro"></label><label><span>Canal WhatsApp</span><select name="account_id" required><option value="">Carregando…</option></select></label><label><span>Categoria</span><select name="category" required>${categoryOptions}</select></label><label><span>Idioma</span><select name="language"><option value="pt_BR">Português (Brasil)</option></select></label></div></section>${standardFields(type)}<div data-template-simple-status class="marketing-template-status" role="status" aria-live="polite"></div><div class="marketing-template-dialog-actions"><button type="button" data-simple-cancel>Cancelar</button><button type="submit" class="primary" data-template-simple-submit>${item?'Salvar alterações':'Enviar para análise'}</button></div></form>${previewHtml()}</div>`;
}

function headerFieldsHtml(type){
  if(type==='TEXT')return '<label class="wide"><span>Texto do cabeçalho</span><input name="header_text" maxlength="60" placeholder="Ex.: Oferta da semana"></label><label class="wide"><span>Exemplo das variáveis do cabeçalho</span><input name="header_examples" placeholder="Exemplo 1 | Exemplo 2"></label>';
  if(['IMAGE','VIDEO','DOCUMENT'].includes(type)){
    const accept=type==='IMAGE'?'image/jpeg,image/png':type==='VIDEO'?'video/mp4':'application/pdf';
    return `<label class="wide"><span>${HEADER_LABELS[type]} de exemplo</span><input type="file" data-template-media-file name="header_file" accept="${accept}" required><small>Usada somente como amostra para aprovação do template. Na edição, deixe vazio para manter a amostra atual.</small></label>`;
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

function detectTemplateKind(item){
  if(String(item?.category||'').toUpperCase()==='AUTHENTICATION')return 'authentication';
  if(component(item,'CAROUSEL'))return 'carousel';
  if(templateButtons(item).some(button=>String(button?.type||'').toUpperCase()==='CATALOG'))return 'catalog';
  return 'standard';
}

function hydrateEditor(form,item){
  if(!item)return;
  form.dataset.templateId=String(item.id||'');
  form.elements.name.value=String(item.name||'');form.elements.name.readOnly=true;
  form.elements.language.value=String(item.language||'pt_BR');
  if(form.elements.category)form.elements.category.value=String(item.category||'MARKETING').toUpperCase();
  if(form.elements.account_id){form.elements.account_id.value=String(item.whatsapp_account_id||'');form.elements.account_id.disabled=true}
  const type=form.dataset.templateKind||'standard';
  if(type==='authentication'){
    const body=component(item,'BODY'),footer=component(item,'FOOTER'),button=templateButtons(item)[0]||{};
    if(form.elements.security_recommendation)form.elements.security_recommendation.checked=body?.add_security_recommendation!==false;
    if(form.elements.expiration_minutes)form.elements.expiration_minutes.value=String(footer?.code_expiration_minutes||10);
    if(form.elements.otp_type)form.elements.otp_type.value=String(button?.otp_type||'COPY_CODE');
    updateWhatsAppPreview(form);return;
  }
  const header=component(item,'HEADER'),body=component(item,'BODY'),footer=component(item,'FOOTER'),button=templateButtons(item)[0]||null;
  if(form.elements.body)form.elements.body.value=String(body?.text||'');
  if(form.elements.footer)form.elements.footer.value=String(footer?.text||'');
  if(form.elements.header_type){form.elements.header_type.value=String(header?.format||'NONE').toUpperCase();form.elements.header_type.dispatchEvent(new Event('change',{bubbles:true}))}
  if(header?.format==='TEXT'){
    if(form.elements.header_text)form.elements.header_text.value=String(header.text||'');
    if(form.elements.header_examples)form.elements.header_examples.value=(header?.example?.header_text||[]).join(' | ');
  }else if(['IMAGE','VIDEO','DOCUMENT'].includes(String(header?.format||'').toUpperCase())){
    const handle=String(header?.example?.header_handle?.[0]||'');if(handle)form.dataset.existingHeaderHandle=handle;
    const file=form.querySelector('[data-template-media-file]');if(file&&handle)file.required=false;
  }
  renderVariableExamples(form);
  const examples=Array.isArray(body?.example?.body_text?.[0])?body.example.body_text[0]:[];
  examples.forEach((value,index)=>{const input=form.elements[`body_example_${index+1}`];if(input)input.value=String(value||'')});
  if(button&&form.elements.button_type){
    const buttonType=String(button.type||'NONE').toUpperCase();
    if([...form.elements.button_type.options].some(option=>option.value===buttonType)){form.elements.button_type.value=buttonType;form.elements.button_type.dispatchEvent(new Event('change',{bubbles:true}))}
    if(form.elements.button_text)form.elements.button_text.value=String(button.text||BUTTON_LABELS[buttonType]||'');
    if(form.elements.button_value)form.elements.button_value.value=String(button.url||button.phone_number||'');
  }
  updateWhatsAppPreview(form);
}

async function openSimpleTemplateEditor(type='standard',item=null){
  const titles=item?{standard:`Editar ${item.name}`,catalog:`Editar ${item.name}`,authentication:`Editar ${item.name}`}:{standard:'Novo modelo padrão',catalog:'Novo template de Catálogo',authentication:'Novo template de Autenticação'};
  const dialog=shellDialog(titles[type]||'Template',simpleEditorHtml(type,item),{wide:true});
  const form=dialog.querySelector('[data-template-simple-form]');
  const accounts=await loadAccounts().catch(()=>[]);
  const select=form.elements.account_id;
  select.innerHTML='<option value="">Selecione</option>'+accounts.map(account=>`<option value="${esc(account.id)}">${esc(channelByPhone(account.phone_e164))} · ${esc(account.display_name||'WhatsApp')}</option>`).join('');
  form.querySelector('[data-simple-cancel]')?.addEventListener('click',()=>closeDialog(dialog));
  form.addEventListener('submit',event=>submitSimpleTemplate(event,dialog));
  bindDynamicFields(form);hydrateEditor(form,item);
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
    const componentValue={type:'HEADER',format:'TEXT',text:headerText};
    const headerExamples=String(form.elements.header_examples?.value||'').split('|').map(entry=>entry.trim()).filter(Boolean);
    if(variableCount(headerText)&&headerExamples.length)componentValue.example={header_text:headerExamples};
    components.push(componentValue);
  }else if(['IMAGE','VIDEO','DOCUMENT'].includes(headerType)){
    const file=form.querySelector('[data-template-media-file]')?.files?.[0];
    let handle='';
    if(file){const uploaded=await uploadTemplateMedia(accountId,file);handle=String(uploaded.handle||'')}
    else handle=String(form.dataset.existingHeaderHandle||'');
    if(!handle)throw new Error('Selecione o arquivo de exemplo do cabeçalho.');
    components.push({type:'HEADER',format:headerType,example:{header_handle:[handle]}});
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
  const map={meta_template_examples_required:'Preencha os exemplos das variáveis.',meta_template_component_unsupported:'Esse recurso ainda não é aceito pela configuração da Meta.',meta_template_buttons_invalid:'Revise os dados dos botões.',meta_template_header_invalid:'Revise o cabeçalho.',meta_template_header_handle_required:'Envie uma amostra de mídia para esse cabeçalho.',carousel_media_invalid:'O arquivo escolhido não é aceito.',meta_template_mutation_uncertain:'A Meta pode ter recebido a alteração. Sincronize antes de tentar novamente.'};
  return map[code]||code||'Erro inesperado ao enviar o template.';
}

async function submitSimpleTemplate(event,dialog){
  event.preventDefault();
  const form=event.currentTarget;
  const button=form.querySelector('[data-template-simple-submit]');
  const status=form.querySelector('[data-template-simple-status]');
  const templateId=String(form.dataset.templateId||'').trim();
  const accountId=String(form.elements.account_id?.value||'').trim();
  if(!templateId&&!accountId){status.textContent='Selecione o canal WhatsApp.';return}
  button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=templateId?'Salvando…':'Enviando…';status.textContent=templateId?'Salvando alterações na Meta…':'Preparando o template para análise da Meta…';
  try{
    const draft=await buildDraft(form,accountId);
    if(!draft.name){status.textContent='Informe o nome do template.';return}
    if(templateId)await adminPost('edit',{template_id:templateId,draft});
    else await adminPost('create',{account_id:accountId,draft});
    status.textContent=templateId?'Alterações enviadas. Atualizando a lista…':'Template enviado para análise. Atualizando a lista…';
    closeDialog(dialog);
    await window.DAMarketingTemplateCenter?.mountTemplateView?.(document.querySelector('#content'));
  }catch(error){status.textContent=`Não foi possível ${templateId?'salvar':'enviar'}. ${friendlyError(error)}`}
  finally{if(button.isConnected){button.disabled=false;button.setAttribute('aria-busy','false');button.textContent=templateId?'Salvar alterações':'Enviar para análise'}}
}

function detailPreview(item){
  const body=component(item,'BODY');
  const footer=component(item,'FOOTER');
  const header=component(item,'HEADER');
  const buttons=templateButtons(item);
  return `<div class="marketing-template-live-preview"><div class="marketing-template-live-message">${header?`<strong>${esc(header.text||HEADER_LABELS[String(header.format||'').toUpperCase()]||'Cabeçalho')}</strong>`:''}<p>${esc(body?.text||'Template de autenticação').replace(/\n/g,'<br>')}</p>${footer?.text?`<small>${esc(footer.text)}</small>`:''}${buttons.length?`<div>${buttons.map(button=>`<span>${esc(button.text||BUTTON_LABELS[String(button.type||'').toUpperCase()]||button.type)}</span>`).join('')}</div>`:''}</div></div>`;
}

function historyHtml(events=[]){
  if(!events.length)return '<p class="template-history-empty">Ainda não há eventos registrados para este template.</p>';
  return `<div class="template-history-list">${events.map(event=>`<article><span class="template-history-dot"></span><div><strong>${esc(statusLabel(event.status||event.event_type))}</strong><small>${esc(fmtDate(event.occurred_at||event.received_at))}${event.quality_rating?` · Qualidade ${esc(event.quality_rating)}`:''}</small>${event.reason?`<p>${esc(event.reason)}</p>`:''}</div></article>`).join('')}</div>`;
}

function liveDetailHtml(data){
  const item=data.item||{};const reason=String(item?.metadata?.rejected_reason||'').trim();const live=data.live===true;
  return `<div class="marketing-template-live-detail"><div class="template-live-summary"><div><span class="template-live-status ${String(item.status||'').toLowerCase()}">${esc(statusLabel(item.status))}</span><h3>${esc(item.name||'Template')}</h3><p>${esc(item.language||'—')} · ${esc(item.category||'—')}</p></div><span class="template-live-source ${live?'ok':'warn'}">${live?'Atualizado agora pela Meta':'Meta indisponível · cache local'}</span></div>${reason?`<div class="template-live-reason"><strong>Motivo informado pela Meta</strong><p>${esc(reason)}</p></div>`:''}${detailPreview(item)}<section class="template-live-history"><h4>Histórico Meta</h4>${historyHtml(data.events||[])}</section><div class="marketing-template-dialog-actions"><button type="button" data-live-close>Fechar</button>${detectTemplateKind(item)==='carousel'?'<button type="button" class="secondary" disabled title="A edição de carrossel permanece no editor especializado">Carrossel</button>':`<button type="button" class="primary" data-live-edit="${esc(item.id||'')}">Editar</button>`}</div></div>`;
}

async function openLiveTemplateDetail(id){
  const dialog=shellDialog('Detalhes do template','<div class="template-live-loading">Atualizando com a Meta…</div>',{wide:true});
  try{
    const data=await adminGet({action:'detail',template_id:id});
    const body=dialog.querySelector('.marketing-template-dialog-body');if(!body)return dialog;
    body.innerHTML=liveDetailHtml(data);
    body.querySelector('[data-live-close]')?.addEventListener('click',()=>closeDialog(dialog));
    body.querySelector('[data-live-edit]')?.addEventListener('click',()=>{const item=data.item;closeDialog(dialog);openSimpleTemplateEditor(detectTemplateKind(item),item)});
  }catch(error){
    const body=dialog.querySelector('.marketing-template-dialog-body');if(body)body.innerHTML=`<div class="template-live-error"><strong>Não foi possível atualizar o template.</strong><p>${esc(friendlyError(error))}</p><button type="button" data-live-close>Fechar</button></div>`;
    body?.querySelector('[data-live-close]')?.addEventListener('click',()=>closeDialog(dialog));
  }
  return dialog;
}

async function openExistingTemplateEditor(id){
  try{
    const data=await adminGet({action:'detail',template_id:id});const item=data.item;
    const kind=detectTemplateKind(item);
    if(kind==='carousel')return openLiveTemplateDetail(id);
    return openSimpleTemplateEditor(kind,item);
  }catch(error){return openLiveTemplateDetail(id)}
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

function bindCaptureActions(){
  if(captureBound)return;captureBound=true;
  document.addEventListener('click',event=>{
    const detail=event.target?.closest?.('[data-template-detail]');
    if(detail){event.preventDefault();event.stopImmediatePropagation();openLiveTemplateDetail(detail.dataset.templateDetail);return}
    const edit=event.target?.closest?.('[data-template-edit]');
    if(edit&&!edit.disabled){event.preventDefault();event.stopImmediatePropagation();openExistingTemplateEditor(edit.dataset.templateEdit)}
  },true);
}

function observe(){
  if(observerStarted)return;observerStarted=true;ensurePickerStyles();bindCaptureActions();
  const observer=new MutationObserver(()=>enhanceTemplateCenter());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  enhanceTemplateCenter();
}

observe();
window.DAMarketingTemplateSimple={openTemplateTypePicker,openSimpleTemplateEditor,openExistingTemplateEditor,openLiveTemplateDetail,submitSimpleTemplate,enhanceTemplateCenter,updateWhatsAppPreview,insertTemplateVariable};
export {openTemplateTypePicker,openSimpleTemplateEditor,openExistingTemplateEditor,openLiveTemplateDetail,submitSimpleTemplate,enhanceTemplateCenter,updateWhatsAppPreview,insertTemplateVariable};
