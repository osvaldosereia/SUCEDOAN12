import { buildIntegrationRegistry, safeGetProbe, summarizeIntegrationResults } from './integration-audit.js';

const content=document.getElementById('admin-content');
const status=document.getElementById('admin-status');
const title=document.getElementById('module-title');
const subtitle=document.getElementById('module-subtitle');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const metric=(value,label)=>`<article class="metric"><strong>${value}</strong><span>${label}</span></article>`;
const state={registry:buildIntegrationRegistry(),results:new Map(),running:false};

function label(value){return ({healthy:'Saudável',warning:'Atenção','not-configured':'Não configurado','not-tested':'Não testado'})[value]||value;}
function render(){
  title.textContent='Integrações';
  subtitle.textContent='Diagnóstico seguro de leitura, sem credenciais expostas e sem requisições de escrita.';
  const audit=summarizeIntegrationResults(state.registry,state.results);
  content.innerHTML=`<section class="module-hero"><span class="eyebrow">DIAGNÓSTICO SEGURO · SOMENTE LEITURA</span><h2>Firebase, GitHub, Make, Bling e IA</h2><p>Somente fontes públicas ou leituras GET são verificadas. Webhooks, tokens e operações de escrita permanecem bloqueados.</p></section><section class="metrics">${metric(audit.total,'INTEGRAÇÕES')}${metric(audit.healthy,'SAUDÁVEIS')}${metric(audit.warnings,'COM ALERTAS')}${metric(audit.notConfigured,'NÃO CONFIGURADAS')}</section><section class="panel"><div class="panel-head"><h3>Estado das integrações</h3><button class="integration-probe-button" type="button" data-run-integration-probes ${state.running?'disabled':''}>${state.running?'Verificando…':'Executar leituras seguras'}</button></div><div class="integration-list">${audit.rows.map(row=>`<article class="integration-card"><div class="integration-card-head"><div><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.kind)} · ${escapeHtml(row.endpoint)}</small></div><span class="integration-status ${row.status}">${escapeHtml(label(row.status))}</span></div><div class="integration-facts"><span>${row.checks.length} verificação(ões) permitida(s)</span><span>${row.passed} sucesso(s)</span><span>${row.failed} falha(s)</span><span>Escrita bloqueada</span></div>${row.reason?`<p>${escapeHtml(row.reason)}</p>`:''}${row.checks.length?`<details><summary>Verificações disponíveis</summary><div class="integration-checks">${row.checks.map(check=>{const result=state.results.get(`${row.id}:${check.label}`);return `<div><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.safeMethod)} · ${escapeHtml(check.target)}</small></span><b class="${result?.ok?'ok':result?'error':'pending'}">${result?result.ok?`OK · ${result.latencyMs} ms`:escapeHtml(result.error):'Não executada'}</b></div>`;}).join('')}</div></details>`:''}</article>`).join('')}</div><div class="notice">Make, Bling e OpenAI não são testados diretamente pelo navegador. Na etapa operacional, esses testes deverão passar por um serviço intermediário seguro, sem expor webhooks ou tokens.</div></section>`;
}

async function runProbes(){
  if(state.running)return;
  state.running=true;render();
  for(const integration of state.registry){
    for(const check of integration.checks){
      state.results.set(`${integration.id}:${check.label}`,await safeGetProbe(check.target));
      render();
    }
  }
  state.running=false;
  const audit=summarizeIntegrationResults(state.registry,state.results);
  status.textContent=`Integrações: ${audit.healthy} saudáveis, ${audit.warnings} com alerta`;
  status.dataset.type=audit.warnings?'error':'success';
  render();
}

document.addEventListener('click',event=>{
  const moduleButton=event.target.closest('[data-module="integrations"]');
  if(moduleButton){event.preventDefault();event.stopImmediatePropagation();document.querySelectorAll('[data-module]').forEach(button=>button.classList.toggle('active',button.dataset.module==='integrations'));render();return;}
  if(event.target.closest('[data-run-integration-probes]'))runProbes();
},true);
