// Painel de pendências operacionais; sem mutações ou chamadas externas.
(function(global){
  function createOpsAttention(state,esc){
  function attentionTargetTab(a){
    if(a?.type==='product_location_incomplete')return 'gondolas';
    if(a?.type==='bling_scope_missing')return 'bling';
    if(a?.type==='papoai_legacy_endpoint')return 'more';
    return 'today';
  }
  function renderOpsAttention(){
    if(state.opsAttention===null)return '<section class="panel" style="margin-bottom:14px"><div class="loading">Carregando pendências…</div></section>';
    const items=Array.isArray(state.opsAttention)?state.opsAttention:[];
    const rankLabel={critical:'Crítica',high:'Alta',normal:'Normal',low:'Baixa'};
    if(!items.length)return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px"><strong>Precisa de você</strong><span class="muted">Nenhuma pendência aberta.</span></div></section>';
    return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px 14px 0"><strong>Precisa de você</strong><span class="muted">'+items.length+' pendência'+(items.length===1?'':'s')+' aberta'+(items.length===1?'':'s')+'</span></div><div style="padding:8px 14px 14px">'+items.slice(0,8).map(a=>'<div class="history-row" style="align-items:center"><div><span class="pill '+(a.priority==='critical'||a.priority==='high'?'danger':'')+'">'+esc(rankLabel[a.priority]||a.priority)+'</span></div><div class="history-main"><strong>'+esc(a.summary)+'</strong><small>'+esc(a.recommended_action||'Abrir para revisar')+'</small></div><button class="quick-link" type="button" data-attention-open="'+esc(a.id)+'" data-attention-tab="'+esc(attentionTargetTab(a))+'">Abrir</button></div>').join('')+'</div></section>';
  }

    return {attentionTargetTab,renderOpsAttention};
  }
  global.DonaAntoniaAdminOpsAttention=Object.freeze({createOpsAttention});
})(window);
