import {buildAdminNavigation} from './navigation-contract.js';

const root=document.querySelector('[data-admin-context-nav]');
if(root){
  const current=document.body.dataset.adminModule||'';
  const {groups}=buildAdminNavigation();
  const links=groups.flatMap(group=>group.modules)
    .filter(item=>item.href&&item.id!==current)
    .map(item=>`<a href="${item.href}"${item.external?' target="_blank" rel="noopener"':''}>${item.label}</a>`)
    .join('');
  root.innerHTML=`<details class="da-context-nav"><summary aria-label="Abrir navegação do Admin">Admin</summary><nav aria-label="Navegação do Admin">${links}</nav></details>`;
}
