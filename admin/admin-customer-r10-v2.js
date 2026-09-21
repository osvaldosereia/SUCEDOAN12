// R10 — Clientes / Customer 360: camada de usabilidade DOM-only.
// Não autentica, não consulta APIs e não altera identidade/consentimento.
const APP=document.getElementById('app');
const DIALOG=document.getElementById('editorDialog');
const isCustomers=()=>location.hash.replace('#','')==='customers';
const MUTABLE_REVIEW='[data-identity-approve],[data-identity-reject]';
const reviewCooldown=new WeakMap();

function improveStateSemantics(root){
  root.querySelectorAll('.empty').forEach(el=>{
    if(!el.getAttribute('role'))el.setAttribute('role','status');
    if(!el.getAttribute('aria-live'))el.setAttribute('aria-live','polite');
  });
  root.querySelectorAll('.loading').forEach(el=>{
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    el.setAttribute('aria-busy','true');
  });
}

function enhanceCustomers(){
  if(!APP||!isCustomers())return;
  APP.classList.add('da-r10-customers');
  APP.querySelectorAll('button,a,input,select').forEach(el=>{
    if(el.matches('button,a')&&!el.getAttribute('aria-label')){
      const label=(el.textContent||'').trim();
      if(label)el.setAttribute('aria-label',label);
    }
  });
  APP.querySelectorAll('[data-customer-id],[data-customer-history],.customer-profile-button').forEach(el=>{
    el.classList.add('da-r10-customer-action');
  });
  improveStateSemantics(APP);
  const directory=APP.querySelector('.customer-directory,.customer-directory-list,.customer-directory-head')?.parentElement;
  if(directory&&!directory.querySelector('.da-r10-identity-note')){
    const note=document.createElement('aside');
    note.className='da-r10-identity-note';
    note.setAttribute('role','note');
    note.innerHTML='<strong>Identidade protegida</strong><span>Conflitos, consentimentos e dados sensíveis continuam sujeitos à revisão humana e aos gates do Customer 360.</span>';
    directory.prepend(note);
  }
}

function enhanceCustomerDialog(){
  if(!DIALOG)return;
  improveStateSemantics(DIALOG);
  DIALOG.querySelectorAll(MUTABLE_REVIEW).forEach(button=>{
    button.classList.add('da-r10-sensitive-review');
    if(!button.getAttribute('aria-describedby'))button.setAttribute('aria-describedby','da-r10-review-safety');
  });
  if(DIALOG.querySelector(MUTABLE_REVIEW)&&!DIALOG.querySelector('#da-r10-review-safety')){
    const note=document.createElement('p');
    note.id='da-r10-review-safety';
    note.className='da-r10-review-safety';
    note.textContent='Revisões de identidade registram uma decisão humana; não fazem merge automático de clientes.';
    DIALOG.querySelector('.editor-head')?.insertAdjacentElement('afterend',note);
  }
}

// Captura antes do handler funcional: impede clique repetido sem alterar API/contrato.
DIALOG?.addEventListener('click',event=>{
  const button=event.target.closest(MUTABLE_REVIEW);
  if(!button)return;
  const now=Date.now();
  const until=reviewCooldown.get(button)||0;
  if(now<until||button.getAttribute('aria-busy')==='true'){
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  reviewCooldown.set(button,now+16000);
  button.setAttribute('aria-busy','true');
  button.classList.add('da-r10-is-busy');
  setTimeout(()=>{
    if(!button.isConnected)return;
    button.removeAttribute('aria-busy');
    button.classList.remove('da-r10-is-busy');
  },16000);
},true);

const observer=new MutationObserver(()=>queueMicrotask(()=>{enhanceCustomers();enhanceCustomerDialog()}));
if(APP)observer.observe(APP,{childList:true,subtree:true});
if(DIALOG)observer.observe(DIALOG,{childList:true,subtree:true});
window.addEventListener('hashchange',enhanceCustomers);
window.addEventListener('DOMContentLoaded',()=>{enhanceCustomers();enhanceCustomerDialog()},{once:true});
enhanceCustomers();
enhanceCustomerDialog();
