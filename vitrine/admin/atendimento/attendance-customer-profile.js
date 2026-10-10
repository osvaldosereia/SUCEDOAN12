import {customerConfirmationBind,customerConfirmationCreate,customerConfirmationPending,customerEditor,customerProfileExtract,customerProfileList,customerProfileReview} from './attendance-customer-api.js?v=customer-profile-confirm-v1';
import {renderCustomerForm} from './attendance-customer-form.js?v=customer-profile-v1';

const FIELD_LABELS={name:'Nome',cpf_cnpj:'CPF/CNPJ',email:'E-mail',postal_code:'CEP',street:'Rua',number:'Número',complement:'Complemento',neighborhood:'Bairro',city:'Cidade',state:'UF',reference:'Referência'};
let pendingConfirmation=null;

export function maskProfileSuggestion(field,value){
  const text=String(value??'').trim();
  if(field!=='cpf_cnpj')return text;
  const digits=text.replace(/\D/g,'');return digits?`***${digits.slice(-4)}`:'***';
}
export function isUsableProfileSuggestion(item){return item?.status!=='reviewed_rejected'&&item?.recommendation!=='ignore'&&Number(item?.confidence||0)>=0.80}
export function profileProgress(profile={}){
  const address=profile?.address||{};
  const values=[profile?.name||profile?.display_name,profile?.phone||profile?.phone_e164,profile?.cpf||profile?.cpf_cnpj,profile?.email,address?.street,address?.number,address?.district||address?.neighborhood,address?.city];
  return {complete:values.filter(v=>String(v??'').trim()).length,total:8};
}
export function buildCustomerConfirmationMessage(items=[]){
  const usable=(Array.isArray(items)?items:[]).filter(isUsableProfileSuggestion).slice(0,8);
  if(!usable.length)return '';
  const name=usable.find(item=>item?.field_name==='name');
  const greeting=String(valueOf(name)||'').trim();
  const lines=usable.map(item=>`${FIELD_LABELS[item?.field_name]||'Dado'}: ${maskProfileSuggestion(item?.field_name,valueOf(item))}`);
  return `Oi${greeting?`, ${greeting}`:''}! Para deixar seu cadastro certinho, você pode confirmar estes dados?\n${lines.join('\n')}\nResponda “SIM” se estiver correto ou escreva a correção. 😊`;
}

const button=(text,primary=false)=>{const b=document.createElement('button');b.type='button';b.className=`attendance-customer-btn${primary?' primary':''}`;b.textContent=text;return b};
const valueOf=item=>String(item?.suggested_value?.value??item?.normalized_value??'').trim();
const confidenceLabel=item=>`${Math.round(Number(item?.confidence||0)*100)}% de confiança`;

function applySuggestion(data,item){
  const next=structuredClone(data||{});next.customer=next.customer||{};next.customer.address=next.customer.address||{};
  const value=valueOf(item);const field=item?.field_name;
  if(field==='name')next.customer.display_name=value;
  else if(field==='cpf_cnpj')next.customer.cpf=value;
  else if(field==='email')next.customer.email=value;
  else if(field==='postal_code')next.customer.address.postal_code=value;
  else if(field==='street')next.customer.address.street=value;
  else if(field==='number')next.customer.address.number=value;
  else if(field==='complement')next.customer.address.complement=value;
  else if(field==='neighborhood')next.customer.address.district=value;
  else if(field==='city')next.customer.address.city=value;
  else if(field==='state')next.customer.address.state=value;
  else if(field==='reference')next.customer.address.raw_text=value;
  return next;
}

function renderSuggestion(container,item,{conversationId,card,onRefresh}){
  const row=document.createElement('div');row.className='attendance-profile-suggestion';row.dataset.suggestionId=String(item?.id||'');
  if(isUsableProfileSuggestion(item)){const choose=document.createElement('label');choose.className='attendance-profile-confirm-choice';const input=document.createElement('input');input.type='checkbox';input.value=String(item.id||'');input.dataset.confirmSuggestion='1';input.checked=true;const text=document.createElement('span');text.textContent='Incluir no pedido de confirmação';choose.append(input,text);row.append(choose)}
  const head=document.createElement('div');head.className='attendance-profile-suggestion-head';
  const strong=document.createElement('strong');strong.textContent=FIELD_LABELS[item?.field_name]||item?.field_name||'Dado';
  const badge=document.createElement('span');badge.textContent=confidenceLabel(item);head.append(strong,badge);
  const value=document.createElement('div');value.className='attendance-profile-suggestion-value';value.textContent=maskProfileSuggestion(item?.field_name,valueOf(item));
  const evidence=document.createElement('small');const evidenceIds=Array.isArray(item?.evidence_message_ids)?item.evidence_message_ids:[];evidence.textContent=`Evidência: ${evidenceIds.length||0} mensagem(ns)`;
  row.append(head,value,evidence);
  if(isUsableProfileSuggestion(item)){
    const actions=document.createElement('div');actions.className='attendance-customer-actions compact';
    const use=button('Usar no formulário',true),discard=button('Descartar');
    use.onclick=async()=>{use.disabled=discard.disabled=true;try{await customerProfileReview(item.id,'accepted');const data=await customerEditor(conversationId);const filled=applySuggestion(data,item);renderCustomerForm({card,conversationId,mode:'save',phone:filled?.conversation_phone_e164||'',data:filled,onDone:onRefresh,onCancel:onRefresh})}catch(error){use.disabled=discard.disabled=false;const msg=document.createElement('div');msg.className='attendance-customer-status error';msg.textContent=String(error?.message||'')==='invalid_cpf_cnpj'?'O CPF/CNPJ encontrado não é válido. Revise manualmente.':'Não foi possível aceitar esta sugestão.';row.append(msg)}};
    discard.onclick=async()=>{use.disabled=discard.disabled=true;try{await customerProfileReview(item.id,'rejected');row.hidden=true}catch{use.disabled=discard.disabled=false}};actions.append(use,discard);row.append(actions);
  }
  container.append(row);
}

async function loadSuggestions(container,conversationId,options){
  container.replaceChildren();
  const loading=document.createElement('div');loading.className='attendance-customer-status';loading.textContent='Carregando sugestões…';container.append(loading);
  try{
    const data=await customerProfileList(conversationId);container.replaceChildren();const items=(Array.isArray(data?.items)?data.items:[]).filter(item=>item?.status==='pending'&&isUsableProfileSuggestion(item));
    if(!items.length){const empty=document.createElement('div');empty.className='attendance-customer-status';empty.textContent='Nenhuma sugestão cadastral pendente.';container.append(empty);return}
    for(const item of items)renderSuggestion(container,item,{conversationId,...options});
    const confirm=button('Pedir confirmação ao cliente',true);confirm.onclick=async()=>{
      const selected=[...container.querySelectorAll('[data-confirm-suggestion]:checked')].map(input=>items.find(item=>String(item.id)===input.value)).filter(Boolean);
      if(!selected.length){statusMessage(container,'Selecione ao menos um dado para confirmar.','error');return}
      if(selected.length>8){statusMessage(container,'Selecione até 8 dados por mensagem.','error');return}
      const text=buildCustomerConfirmationMessage(selected);if(!text){statusMessage(container,'Não há dados utilizáveis para confirmar.','error');return}
      confirm.disabled=true;confirm.textContent='Preparando rascunho…';
      try{
        const request=await customerConfirmationCreate(conversationId,selected.map(item=>item.id));
        if(!request?.request_id)throw new Error('confirmation_request_missing');
        const current=await customerConfirmationPending(conversationId);
        if(current?.outbound_message_id){statusMessage(container,'Já existe uma confirmação enviada aguardando resposta.','warning');return}
        const draft=document.querySelector('#messageDraft');if(!draft)throw new Error('composer_unavailable');
        pendingConfirmation={requestId:String(request.request_id),conversationId,text};
        draft.value=text;draft.dispatchEvent(new Event('input',{bubbles:true}));draft.focus();
        statusMessage(container,'Rascunho pronto para revisar e enviar. A confirmação só começa após o envio pelo botão Enviar.','success');
      }catch(error){
        const code=String(error?.message||'');
        statusMessage(container,code==='ambiguous_phone'?'Há mais de um cadastro associado ao telefone. Resolva o cliente antes de pedir confirmação.':'Não foi possível preparar o pedido de confirmação.','error');
      }finally{confirm.disabled=false;confirm.textContent='Pedir confirmação ao cliente'}
    };
    container.append(confirm);
  }catch{container.replaceChildren();const error=document.createElement('div');error.className='attendance-customer-status error';error.textContent='Não foi possível carregar as sugestões da ANA.';container.append(error)}
}

function statusMessage(container,text,tone='neutral'){
  let status=container.querySelector('[data-profile-confirmation-status]');
  if(!status){status=document.createElement('div');status.dataset.profileConfirmationStatus='1';status.className='attendance-customer-status';container.append(status)}
  status.dataset.tone=tone;status.textContent=text;
}

export async function renderCustomerProfileAssistant({card,conversationId,onRefresh}){
  if(!card||!conversationId||card.querySelector('[data-attendance-customer-profile]'))return;
  const section=document.createElement('section');section.className='attendance-customer-profile';section.dataset.attendanceCustomerProfile='1';
  const title=document.createElement('div');title.className='attendance-profile-title';const h=document.createElement('strong');h.textContent='Cadastro';const state=document.createElement('span');state.textContent='Carregando…';title.append(h,state);section.append(title);
  const progress=document.createElement('div');progress.className='attendance-profile-progress';section.append(progress);
  const actions=document.createElement('div');actions.className='attendance-customer-actions';const extract=button('ANA buscar dados na conversa',true),review=button('Revisar sugestões');actions.append(extract,review);section.append(actions);
  const list=document.createElement('div');list.className='attendance-profile-suggestions';list.hidden=true;section.append(list);card.append(section);

  try{
    const data=await customerEditor(conversationId);const customer=data?.customer||{};const p=profileProgress({name:customer.display_name,phone:customer.phone_e164,cpf:customer.cpf,email:customer.email,address:customer.address||{}});
    state.textContent=p.complete>=p.total?'Completo':p.complete>=2?'Em andamento':'Provisório';progress.textContent=`${p.complete} de ${p.total} dados principais preenchidos`;
  }catch{state.textContent='Indisponível';progress.textContent='Não foi possível calcular o progresso agora.'}

  review.onclick=async()=>{list.hidden=!list.hidden;if(!list.hidden)await loadSuggestions(list,conversationId,{card,onRefresh})};
  extract.onclick=async()=>{extract.disabled=true;extract.textContent='ANA analisando…';try{await customerProfileExtract(conversationId);list.hidden=false;await loadSuggestions(list,conversationId,{card,onRefresh})}catch(error){list.hidden=false;list.replaceChildren();const msg=document.createElement('div');msg.className='attendance-customer-status error';msg.textContent=String(error?.message||'')==='ambiguous_phone'?'Há mais de um cadastro possível para este telefone. Resolva o cliente antes de usar a ANA.':'A ANA não conseguiu analisar os dados agora.';list.append(msg)}finally{extract.disabled=false;extract.textContent='ANA buscar dados na conversa'}};
}

if(typeof document!=='undefined')document.addEventListener('attendance:sent',async event=>{
  const detail=event?.detail||{},pending=pendingConfirmation;
  if(!pending||detail.conversationId!==pending.conversationId||detail.provider!=='meta'||detail.text!==pending.text||!detail.messageId)return;
  pendingConfirmation=null;
  try{await customerConfirmationBind(pending.requestId,detail.messageId)}
  catch{const box=document.querySelector('[data-attendance-customer-profile] .attendance-profile-suggestions');if(box)statusMessage(box,'A mensagem foi enviada, mas não consegui vincular a resposta ao pedido. Confira a conversa antes de pedir novamente.','warning')}
});
