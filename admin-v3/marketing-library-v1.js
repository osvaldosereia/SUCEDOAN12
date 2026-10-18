(function(){
'use strict';

const C=window.DA_ADMIN_V3_CONFIG||{};
const AUTH_KEY='da_admin_v3_auth';
let root=null;
let snapshot={commands:[],templates:[],external_side_effect:false};

const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const jsonText=(v,fallback={})=>{const t=String(v||'').trim();if(!t)return fallback;try{return JSON.parse(t)}catch{throw new Error('JSON inválido.')}};
const auth=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};
const message=(text,kind='')=>{const el=root?.querySelector('[data-mkt-lib-message]');if(!el)return;el.textContent=text;el.dataset.kind=kind};

async function refresh(a){
  const r=await fetch(`${C.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{
    method:'POST',
    headers:{apikey:C.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:a?.refresh_token})
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.access_token)throw new Error('Sessão expirada.');
  localStorage.setItem(AUTH_KEY,JSON.stringify(d));
  return d;
}

async function api(action,payload={},retry=true){
  let a=auth();
  if(!a?.access_token)throw new Error('Faça login no Admin protegido.');
  const r=await fetch(`${C.supabaseUrl}/functions/v1/${C.marketingEdgeFunction||'admin-marketing-v1'}`,{
    method:'POST',
    headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${a.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({action,...payload})
  });
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&retry){await refresh(a);return api(action,payload,false)}
  if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||`Erro ${r.status}`);
  return d;
}

function shell(){
  return `<section class="marketing-library">
    <div class="marketing-alert"><strong>Biblioteca privada e dormente.</strong> Salvar cria somente novas versões internas. Não publica, não executa IA e não altera rollout.</div>
    <div class="marketing-grid">
      <section class="panel">
        <div class="panel-head"><div><div class="eyebrow">Biblioteca de comandos</div><h2>Comandos reutilizáveis</h2></div><button type="button" class="button secondary small" data-mkt-lib-refresh>Atualizar</button></div>
        <form class="marketing-form" data-mkt-command-form>
          <div class="marketing-row"><label>Chave<input required data-command-key placeholder="oferta_produto_quadrado"></label><label>Nome<input required data-command-name placeholder="Oferta produto quadrada"></label></div>
          <div class="marketing-row"><label>Tipo<select data-command-kind><option value="image">Imagem</option><option value="video">Vídeo</option><option value="carousel">Carrossel</option><option value="caption">Legenda</option></select></label><label>Produção<select data-command-mode><option value="no_ai">Sem IA</option><option value="manual">Manual</option><option value="hybrid">Híbrido</option><option value="ai">Com IA (somente configuração)</option></select></label></div>
          <label>Provider preferido<select data-command-provider><option value="deterministic_renderer">Renderer sem IA</option><option value="auto">Automático, condicionado aos gates</option><option value="openai">OpenAI, condicionado aos gates</option><option value="google">Google, condicionado aos gates</option></select></label>
          <label>Comando<textarea required data-command-text></textarea></label>
          <label>Variáveis (JSON)<textarea data-command-variables>{"headline":"text","cta":"text"}</textarea></label>
          <label>Configurações (JSON)<textarea data-command-settings>{"editable":true}</textarea></label>
          <button class="button primary" type="submit">Salvar nova versão</button>
          <small>Nova versão: a versão anterior permanece intacta e auditável.</small>
        </form>
        <div class="marketing-list" data-command-list></div>
      </section>
      <section class="panel">
        <div class="panel-head"><div><div class="eyebrow">Biblioteca de modelos</div><h2>Modelos reutilizáveis</h2></div><span class="marketing-pill off">sem execução</span></div>
        <form class="marketing-form" data-mkt-template-form>
          <div class="marketing-row"><label>Chave<input required data-template-key placeholder="vertical_story_status"></label><label>Nome<input required data-template-name placeholder="Story e Status 9:16"></label></div>
          <label>Tipo<select data-template-kind><option value="image">Imagem</option><option value="video">Vídeo</option><option value="carousel">Carrossel</option></select></label>
          <label>Canvas (JSON)<textarea data-template-canvas>{"width":1080,"height":1920,"format":"webp"}</textarea></label>
          <label>Layout (JSON)<textarea data-template-layout>{"safe_area":true,"zones":["headline","product","price","cta","brand"]}</textarea></label>
          <label>Marca (JSON)<textarea data-template-brand>{"brand":"dona_antonia","editable":true}</textarea></label>
          <label>Variáveis (JSON)<textarea data-template-vars>{"headline":"text","product_image":"image","price":"money","cta":"text"}</textarea></label>
          <button class="button primary" type="submit">Salvar nova versão</button>
          <small>O modelo define composição editável; não agenda nem publica conteúdo.</small>
        </form>
        <div class="marketing-list" data-template-list></div>
      </section>
    </div>
    <div class="marketing-json" data-mkt-lib-message>Nenhuma ação executada.</div>
  </section>`;
}

function guardedSettings(mode,settings){
  const next={...settings,editable:settings.editable!==false};
  if(mode==='ai'||mode==='hybrid'){
    next.requires_ai_gate=true;
    next.requires_cost_budget=true;
  }
  return next;
}

function render(){
  const commands=Array.isArray(snapshot.commands)?snapshot.commands:[];
  const templates=Array.isArray(snapshot.templates)?snapshot.templates:[];
  root.querySelector('[data-command-list]').innerHTML=commands.length?commands.map(c=>`<div class="marketing-item"><div class="marketing-item-head"><div><strong>${esc(c.name)}</strong><small>${esc(c.command_key)} · v${esc(c.version)} · ${esc(c.media_kind)} · ${esc(c.generation_mode)}</small></div><button type="button" class="linkish" data-command-reuse="${esc(c.id)}">Reutilizar</button></div></div>`).join(''):'<div class="marketing-empty">Nenhum comando disponível.</div>';
  root.querySelector('[data-template-list]').innerHTML=templates.length?templates.map(t=>`<div class="marketing-item"><div class="marketing-item-head"><div><strong>${esc(t.name)}</strong><small>${esc(t.template_key)} · v${esc(t.version)} · ${esc(t.media_kind)}</small></div><button type="button" class="linkish" data-template-reuse="${esc(t.id)}">Reutilizar</button></div></div>`).join(''):'<div class="marketing-empty">Nenhum modelo disponível.</div>';
}

async function load(){
  message('Carregando biblioteca…');
  const d=await api('overview');
  const s=d?.snapshot;
  if(!s||s.external_side_effect!==false)throw new Error('Contrato de segurança inválido: leitura não comprovou external_side_effect=false.');
  snapshot={commands:Array.isArray(s.commands)?s.commands:[],templates:Array.isArray(s.templates)?s.templates:[],external_side_effect:false};
  render();
  message(`${snapshot.commands.length} comandos e ${snapshot.templates.length} modelos carregados.`,'ok');
}

function reuseCommand(id){
  const c=snapshot.commands.find(x=>x.id===id);if(!c)return;
  root.querySelector('[data-command-key]').value=c.command_key||'';
  root.querySelector('[data-command-name]').value=c.name||'';
  root.querySelector('[data-command-kind]').value=c.media_kind||'image';
  root.querySelector('[data-command-mode]').value=c.generation_mode||'no_ai';
  root.querySelector('[data-command-provider]').value=c.provider_hint||'deterministic_renderer';
  root.querySelector('[data-command-text]').value=c.command_text||'';
  root.querySelector('[data-command-variables]').value=JSON.stringify(c.variables||{},null,2);
  root.querySelector('[data-command-settings]').value=JSON.stringify(c.settings||{},null,2);
  message(`Comando v${c.version||1} carregado para criar uma nova versão. Nenhum dado anterior será alterado.`,'ok');
}

function reuseTemplate(id){
  const t=snapshot.templates.find(x=>x.id===id);if(!t)return;
  root.querySelector('[data-template-key]').value=t.template_key||'';
  root.querySelector('[data-template-name]').value=t.name||'';
  root.querySelector('[data-template-kind]').value=t.media_kind||'image';
  root.querySelector('[data-template-canvas]').value=JSON.stringify(t.canvas_spec||{},null,2);
  root.querySelector('[data-template-layout]').value=JSON.stringify(t.layout_spec||{},null,2);
  root.querySelector('[data-template-brand]').value=JSON.stringify(t.brand_spec||{},null,2);
  root.querySelector('[data-template-vars]').value=JSON.stringify(t.variable_schema||{},null,2);
  message(`Modelo v${t.version||1} carregado para criar uma nova versão. Nenhum dado anterior será alterado.`,'ok');
}

async function saveCommand(e){
  e.preventDefault();
  try{
    const mode=root.querySelector('[data-command-mode]').value;
    const settings=guardedSettings(mode,jsonText(root.querySelector('[data-command-settings]').value,{}));
    const d=await api('create_command',{
      command_key:root.querySelector('[data-command-key]').value,
      name:root.querySelector('[data-command-name]').value,
      media_kind:root.querySelector('[data-command-kind]').value,
      generation_mode:mode,
      provider_hint:root.querySelector('[data-command-provider]').value,
      command_text:root.querySelector('[data-command-text]').value,
      variables:jsonText(root.querySelector('[data-command-variables]').value,{}),
      settings
    });
    if(d?.result?.external_side_effect===true)throw new Error('Resposta insegura bloqueada.');
    message('Nova versão do comando salva internamente. Nenhuma geração/publicação foi executada.','ok');
    await load();
  }catch(err){message(err.message||String(err),'error')}
}

async function saveTemplate(e){
  e.preventDefault();
  try{
    const d=await api('create_template',{
      template_key:root.querySelector('[data-template-key]').value,
      name:root.querySelector('[data-template-name]').value,
      media_kind:root.querySelector('[data-template-kind]').value,
      canvas_spec:jsonText(root.querySelector('[data-template-canvas]').value,{}),
      layout_spec:jsonText(root.querySelector('[data-template-layout]').value,{}),
      brand_spec:jsonText(root.querySelector('[data-template-brand]').value,{}),
      variable_schema:jsonText(root.querySelector('[data-template-vars]').value,{})
    });
    if(d?.result?.external_side_effect===true)throw new Error('Resposta insegura bloqueada.');
    message('Nova versão do modelo salva internamente. Nenhuma geração/publicação foi executada.','ok');
    await load();
  }catch(err){message(err.message||String(err),'error')}
}

function bind(){
  root.querySelector('[data-mkt-lib-refresh]').addEventListener('click',()=>load().catch(err=>message(err.message||String(err),'error')));
  root.querySelector('[data-mkt-command-form]').addEventListener('submit',saveCommand);
  root.querySelector('[data-mkt-template-form]').addEventListener('submit',saveTemplate);
  root.addEventListener('click',e=>{
    const cmd=e.target.closest('[data-command-reuse]');if(cmd)return reuseCommand(cmd.dataset.commandReuse);
    const tpl=e.target.closest('[data-template-reuse]');if(tpl)return reuseTemplate(tpl.dataset.templateReuse);
  });
}

async function mount(target){
  root=typeof target==='string'?document.querySelector(target):target;
  if(!root)throw new Error('Container da biblioteca de Marketing não encontrado.');
  root.innerHTML=shell();
  bind();
  await load();
}

window.DAMarketingLibraryV1={mount,load};
})();
