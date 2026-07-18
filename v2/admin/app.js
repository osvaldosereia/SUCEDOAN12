import { loadCatalog, validateCatalog } from '../shared/catalog.js';

const state={products:[],source:'',activeModule:'dashboard'};
const content=document.getElementById('admin-content');
const status=document.getElementById('admin-status');
const title=document.getElementById('module-title');
const subtitle=document.getElementById('module-subtitle');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

function quality(product){return {image:Boolean(product.imagem),category:Boolean(product.categoria),price:Number(product.preco)>0,stock:Number(product.estoque)>0};}
function metric(value,label){return `<article class="metric"><strong>${value}</strong><span>${label}</span></article>`;}
function setModuleMeta(name,description){title.textContent=name;subtitle.textContent=description;}
function renderDashboard(){
  setModuleMeta('Visão geral','Indicadores e integridade do catálogo em modo somente leitura.');
  const audit=validateCatalog(state.products);
  const missingImages=state.products.filter(p=>!p.imagem).length;
  const missingCategories=state.products.filter(p=>!p.categoria).length;
  const zeroStock=state.products.filter(p=>Number(p.estoque)<=0).length;
  const checks=[
    ['Catálogo carregado',state.products.length>0,`${state.products.length} produtos`],
    ['Estrutura principal',audit.valid,audit.valid?'Sem erro crítico':audit.errors.join(' ')],
    ['Fonte identificada',Boolean(state.source),state.source||'Não identificada'],
    ['Imagens cadastradas',missingImages===0,missingImages?`${missingImages} pendências`:'Completo'],
    ['Categorias cadastradas',missingCategories===0,missingCategories?`${missingCategories} pendências`:'Completo']
  ];
  content.innerHTML=`<section class="module-hero"><span class="eyebrow">ADMIN V2 · SOMENTE LEITURA</span><h2>Operação organizada por módulos.</h2><p>Esta base separa diagnóstico, produtos, estoque, campanhas, integrações e publicação. Nenhuma gravação está habilitada.</p></section><section class="metrics">${metric(state.products.length,'PRODUTOS')}${metric(zeroStock,'SEM ESTOQUE')}${metric(missingImages,'SEM IMAGEM')}${metric(missingCategories,'SEM CATEGORIA')}</section><section class="panel"><div class="panel-head"><h3>Integridade do catálogo</h3><span class="pill">${state.source}</span></div><div class="audit-list">${checks.map(([label,ok,detail])=>`<div class="audit-row ${ok?'ok':'error'}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></div>`).join('')}</div></section>`;
}
function renderInventory(){
  setModuleMeta('Estoque e validade','Diagnóstico operacional separado da edição cadastral.');
  const rows=state.products.filter(p=>Number(p.estoque)<=5).sort((a,b)=>Number(a.estoque)-Number(b.estoque)).slice(0,150);
  content.innerHTML=`<section class="module-hero"><span class="eyebrow">DIAGNÓSTICO OPERACIONAL</span><h2>Estoque baixo</h2><p>Produtos com até 5 unidades, sem permitir alteração nesta fase.</p></section><section class="metrics">${metric(rows.length,'ATÉ 5 UNIDADES')}${metric(rows.filter(p=>Number(p.estoque)<=0).length,'ZERADOS')}${metric(rows.filter(p=>p.validade).length,'COM VALIDADE')}${metric(rows.filter(p=>!p.validade).length,'SEM VALIDADE')}</section><section class="panel"><div class="panel-head"><h3>Produtos que exigem atenção</h3><span class="pill">Somente leitura</span></div>${rows.length?`<table class="inventory-table"><thead><tr><th>Produto</th><th>Código</th><th>Categoria</th><th>Estoque</th><th>Validade</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${escapeHtml(p.nome)}</td><td>${escapeHtml(p.codigo)}</td><td>${escapeHtml(p.categoria||'—')}</td><td><strong>${Number(p.estoque)||0}</strong></td><td>${escapeHtml(p.validade||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nenhum produto com estoque baixo.</div>'}</section>`;
}
function renderPending(module){setModuleMeta(module,'Módulo planejado e ainda bloqueado para evitar mistura prematura de responsabilidades.');content.innerHTML=`<section class="module-hero"><span class="eyebrow">ARQUITETURA EM CONSTRUÇÃO</span><h2>${escapeHtml(module)}</h2><p>Este módulo só será liberado após o mapeamento das funções equivalentes no admin atual e definição do contrato de dados.</p></section>`;}
function render(){document.querySelectorAll('[data-module]').forEach(button=>button.classList.toggle('active',button.dataset.module===state.activeModule));if(state.activeModule==='dashboard')return renderDashboard();if(state.activeModule==='inventory')return renderInventory();renderPending(document.querySelector(`[data-module="${state.activeModule}"]`)?.textContent.trim()||state.activeModule);}
document.addEventListener('click',event=>{const button=event.target.closest('[data-module]');if(!button||button.disabled)return;state.activeModule=button.dataset.module;render();});
try{const result=await loadCatalog({onStatus:event=>{if(event.phase==='cache')status.textContent='Cache disponível; confirmando fonte segura…';}});state.products=result.products;state.source=result.source;status.textContent=`${result.products.length} produtos via ${result.source}`;status.dataset.type='success';render();}catch(error){console.error(error);status.textContent='Falha ao carregar catálogo';status.dataset.type='error';content.innerHTML=`<div class="panel"><div class="audit-row error"><strong>Falha de integridade</strong><span>${escapeHtml(error.message||error)}</span></div></div>`;}