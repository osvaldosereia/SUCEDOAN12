// Renderização da atividade operacional, sem alterações em dados ou eventos.
(function(global){
  function createOpsTimeline(state,esc,dateTime){
  function renderOpsTimeline(){
    const rows=Array.isArray(state.opsTimeline)?state.opsTimeline:[];
    if(!rows.length)return '';
    const sourceLabel={dona_antonia:'Dona Antônia',storefront:'Site',bling:'Bling',papoai:'PapoAI',chatgpt:'ChatGPT'};
    return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px 14px 0"><strong>Atividade recente</strong><span class="muted">eventos importantes · sem log técnico bruto</span></div><div style="padding:8px 14px 14px">'+rows.slice(0,12).map(e=>'<div class="history-row"><div><span class="pill '+(e.severity==='error'||e.severity==='critical'?'danger':'')+'">'+esc(sourceLabel[e.source_system]||e.source_system||'Sistema')+'</span></div><div class="history-main"><strong>'+esc(e.summary||e.event_type||'Evento')+'</strong><small>'+esc(e.actor_label||e.actor_type||'Sistema')+' · '+esc(dateTime(e.occurred_at))+'</small></div></div>').join('')+'</div></section>';
  }

    return {renderOpsTimeline};
  }
  global.DonaAntoniaAdminOpsTimeline=Object.freeze({createOpsTimeline});
})(window);
