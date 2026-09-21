(()=>{
'use strict';
const ROOT_SELECTOR='#automationBuilderMount, #hscCopilot, [data-admin-integration], [data-admin-health]';
const ACTION_SELECTOR='button, [role="button"], input[type="submit"]';
const SENSITIVE=/compilar|simular|validar|kill|atualizar|ativar|salvar|testar|conectar|sincronizar|executar|gerar/i;
const inflight=new WeakSet();
function announce(message){let node=document.getElementById('r15SystemsStatus');if(!node){node=document.createElement('div');node.id='r15SystemsStatus';node.className='sr-only';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.appendChild(node)}node.textContent=message}
function protect(button){if(button.dataset.r15Guard==='1')return;button.dataset.r15Guard='1';button.addEventListener('click',()=>{const label=(button.textContent||button.getAttribute('aria-label')||'').trim();if(!SENSITIVE.test(label)||button.disabled||inflight.has(button))return;inflight.add(button);button.setAttribute('aria-busy','true');announce(`${label||'Ação'} em andamento.`);window.setTimeout(()=>{inflight.delete(button);button.removeAttribute('aria-busy')},1200)},{capture:true})}
function enhance(root=document){root.querySelectorAll(ROOT_SELECTOR).forEach(surface=>{surface.classList.add('da-r15-surface');surface.querySelectorAll(ACTION_SELECTOR).forEach(protect)})}
function boot(){enhance();new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)enhance(node.matches?.(ROOT_SELECTOR)?node:node)}))).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
