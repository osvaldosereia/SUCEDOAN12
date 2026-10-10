import {customerEditor} from './attendance-customer-api.js?v=weekly-consent-v1';
import {renderCustomerForm} from './attendance-customer-form.js?v=customer-profile-v1';
import {renderCustomerSearch} from './attendance-customer-search.js?v=customer-profile-v1';
import {renderCustomerProfileAssistant} from './attendance-customer-profile.js?v=customer-profile-confirm-v1';
import {renderMarketingConsent} from './attendance-marketing-consent.js?v=weekly-consent-v1';

function ensureCss(){if(document.querySelector('[data-attendance-customer-css]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='./attendance-customer.css?v=weekly-consent-v1';link.dataset.attendanceCustomerCss='1';document.head.append(link)}
const button=(text,primary=false)=>{const b=document.createElement('button');b.type='button';b.className=`attendance-customer-btn${primary?' primary':''}`;b.textContent=text;return b};
const status=(text,tone='neutral')=>{const d=document.createElement('div');d.className=`attendance-customer-status ${tone}`;d.textContent=text;return d};
function heading(card,text=''){card.replaceChildren();card.dataset.attendanceCustomerActive='1';const h=document.createElement('h3');h.textContent='Cliente';card.append(h);if(text){const p=document.createElement('p');p.className='attendance-customer-note';p.textContent=text;card.append(p)}}
function phoneField(card,phone,options={}){const label=document.createElement('label');label.className='attendance-customer-field attendance-customer-phone';const span=document.createElement('span');span.textContent='WhatsApp da conversa';const input=document.createElement('input');input.value=phone||'Não identificado';input.readOnly=options.readOnly!==false;label.append(span,input);card.append(label)}

export function renderUnlinkedCustomer({card,conversationId,result,copy,phoneOptions,onDone}){
  ensureCss();const ambiguous=result?.match_status==='ambiguous';heading(card,ambiguous?'Há mais de um cadastro possível. Escolha manualmente o correto.':'Este WhatsApp ainda não está vinculado a um cliente.');phoneField(card,result?.phone_e164,phoneOptions);
  if(ambiguous)card.append(status(`${Number(result?.candidate_count||0)} cadastros possíveis. O sistema não escolherá sozinho.`,'warning'));
  const actions=document.createElement('div');actions.className='attendance-customer-actions';const create=button(copy.create,true),search=button(copy.search);
  const redraw=()=>renderUnlinkedCustomer({card,conversationId,result,copy,phoneOptions,onDone});
  create.onclick=()=>renderCustomerForm({card,conversationId,mode:'create',phone:result?.phone_e164||'',onDone,onCancel:redraw});
  search.onclick=()=>renderCustomerSearch({card,conversationId,phone:result?.phone_e164||'',onDone,onCancel:redraw});
  actions.append(create,search);card.append(actions);
}

export function decorateLinkedCustomer({card,conversationId,copy,onDone}){
  ensureCss();
  let actions=card.querySelector('.context-actions');if(!actions){actions=document.createElement('div');actions.className='context-actions';card.append(actions)}
  if(!card.querySelector('[data-attendance-customer-edit]')){
    const edit=button(copy.edit);edit.dataset.attendanceCustomerEdit='1';edit.onclick=async()=>{heading(card,'Carregando cadastro…');try{const data=await customerEditor(conversationId);renderCustomerForm({card,conversationId,mode:'save',phone:data.conversation_phone_e164||'',data,onDone,onCancel:onDone})}catch{heading(card,'Não foi possível abrir o cadastro.');const back=button('Voltar');back.onclick=onDone;card.append(back)}};actions.prepend(edit);
  }
  renderMarketingConsent({card,conversationId}).catch(()=>{});
  renderCustomerProfileAssistant({card,conversationId,onRefresh:onDone}).catch(()=>{});
}
