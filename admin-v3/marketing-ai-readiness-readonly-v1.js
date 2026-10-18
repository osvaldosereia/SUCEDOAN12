(function(){
'use strict';
if(window.DAMarketingAiReadinessReadonlyV1)return;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
const money=cents=>`R$ ${(Number(cents||0)/100).toFixed(2).replace('.',',')}`;
function validate(packet){
  if(!packet||typeof packet!=='object'||Array.isArray(packet))throw new Error('Pacote inválido.');
  if(packet.schema_version!=='marketing-ai-preflight-v1')throw new Error('Contrato de IA incompatível.');
  if(packet.external_side_effect!==false)throw new Error('Pacote recusado: efeito externo não garantido como falso.');
  if(packet.network_allowed!==false)throw new Error('Pacote recusado: rede precisa permanecer desligada.');
  if(packet.provider_call_allowed!==false)throw new Error('Pacote recusado: provider precisa permanecer bloqueado.');
  if(packet.dry_run!==true)throw new Error('Pacote recusado: somente dry-run é aceito.');
  if(!Array.isArray(packet.blockers))throw new Error('Pacote recusado: blockers ausentes.');
  if(!Number.isFinite(Number(packet.estimated_cost_cents)))throw new Error('Pacote recusado: custo estimado inválido.');
  return packet;
}
function blockerList(packet){
  if(!packet.blockers.length)return '<li>Nenhum blocker no cenário informado; execução continua inexistente nesta superfície.</li>';
  return packet.blockers.map(item=>`<li>${esc(item)}</li>`).join('');
}
function render(packet,mount){
  const p=validate(packet),runtime=p.runtime_snapshot||{};
  mount.innerHTML=`<section class="panel"><div class="panel-head"><div><div class="eyebrow">IA · somente leitura</div><h2>Custo e gates estimados</h2></div><span class="marketing-pill off">LOCAL ONLY</span></div><div class="marketing-grid"><article class="marketing-card"><small>Modo</small><strong>${esc(p.mode)}</strong></article><article class="marketing-card"><small>Mídia</small><strong>${esc(p.media_kind)}</strong></article><article class="marketing-card"><small>Unidades</small><strong>${esc(p.requested_units)}</strong></article><article class="marketing-card"><small>Custo estimado</small><strong>${esc(money(p.estimated_cost_cents))}</strong></article><article class="marketing-card"><small>Marketing</small><strong>${runtime.enabled===true?'ON':'OFF'}</strong></article><article class="marketing-card"><small>Kill switch</small><strong>${runtime.kill_switch===true?'ON':'OFF'}</strong></article><article class="marketing-card"><small>Geração</small><strong>${runtime.generation_enabled===true?'ON':'OFF'}</strong></article><article class="marketing-card"><small>Provider</small><strong>${p.provider_call_allowed===false?'BLOQUEADO':'REVISAR'}</strong></article></div><div class="panel"><h3>Blockers</h3><ul>${blockerList(p)}</ul></div><p><small>Idempotência: ${esc(p.idempotency_key||'')}</small></p></section>`;
  return p;
}
function setPreflight(packet,mount=document.getElementById('marketingAiReadinessReadonlyMount')){
  if(!mount)return false;
  try{render(packet,mount);return true}catch(error){mount.innerHTML=`<section class="panel"><h2>Preflight recusado</h2><p>${esc(error?.message||error)}</p></section>`;return false}
}
window.DAMarketingAiReadinessReadonlyV1=Object.freeze({setPreflight,validate});
})();
