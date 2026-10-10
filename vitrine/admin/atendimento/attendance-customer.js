import {customerReconcile} from './attendance-customer-api.js?v=customer-profile-v1';
import {decorateLinkedCustomer,renderUnlinkedCustomer} from './attendance-customer-view.js?v=customer-profile-v1';

const COPY={create:'Cadastrar cliente',search:'Buscar cadastro',edit:'Editar aqui'};
const PHONE_OPTIONS={readOnly:true};
let selected='',busy=false;

const selectedConversationId=()=>document.querySelector('.queue-card.selected')?.dataset?.conversationId||'';
const active=()=>document.querySelector('[data-context-tab="customer"]')?.classList.contains('active')===true;
const customerCard=()=>[...(document.querySelector('#contextBody')?.children||[])].find(x=>x.classList?.contains('context-card')&&x.querySelector('h3')?.textContent?.trim()==='Cliente')||null;
function selection(){const id=selectedConversationId();if(id!==selected)selected=id;return id}
function reload(){document.querySelector('.queue-card.selected')?.click()}
async function customer_reconcile(id,card){const result=await customerReconcile(id);if(selection()!==id||!card.isConnected)return;if(result.linked===true){reload();return}renderUnlinkedCustomer({card,conversationId:id,result,copy:COPY,phoneOptions:PHONE_OPTIONS,onDone:reload})}
async function process(){if(busy||!active())return;const id=selection(),card=customerCard();if(!id||!card)return;if(card.querySelector('.customer-hero')){decorateLinkedCustomer({card,conversationId:id,copy:COPY,onDone:reload});return}if(card.dataset.attendanceCustomerActive)return;card.dataset.attendanceCustomerActive='loading';busy=true;try{await customer_reconcile(id,card)}catch{if(card.isConnected){card.dataset.attendanceCustomerActive='error';card.append(Object.assign(document.createElement('div'),{className:'attendance-customer-status error',textContent:'Não foi possível verificar o cadastro automaticamente.'}))}}finally{busy=false}}

const body=document.querySelector('#contextBody');if(body){new MutationObserver(()=>queueMicrotask(process)).observe(body,{childList:true,subtree:false});document.querySelector('[data-context-tab="customer"]')?.addEventListener('click',()=>queueMicrotask(process));queueMicrotask(process)}
