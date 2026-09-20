// R10 — Clientes / Customer 360: camada de usabilidade DOM-only.
// Não autentica, não consulta APIs e não altera identidade/consentimento.
const APP=document.getElementById('app');
const isCustomers=()=>location.hash.replace('#','')==='customers';

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
  const directory=APP.querySelector('.customer-directory,.customer-directory-list,.customer-directory-head')?.parentElement;
  if(directory&&!directory.querySelector('.da-r10-identity-note')){
    const note=document.createElement('aside');
    note.className='da-r10-identity-note';
    note.setAttribute('role','note');
    note.innerHTML='<strong>Identidade protegida</strong><span>Conflitos, consentimentos e dados sensíveis continuam sujeitos à revisão humana e aos gates do Customer 360.</span>';
    directory.prepend(note);
  }
}

const observer=new MutationObserver(()=>queueMicrotask(enhanceCustomers));
if(APP)observer.observe(APP,{childList:true,subtree:true});
window.addEventListener('hashchange',enhanceCustomers);
window.addEventListener('DOMContentLoaded',enhanceCustomers,{once:true});
enhanceCustomers();
