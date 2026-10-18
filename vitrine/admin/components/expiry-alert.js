// Alerta de validade da visão Hoje; implementação preservada.
(function(global){
  function createExpiryAlert(state,esc){
  function renderTodayExpiryAlert(){
    const data=state.expiryAlerts||{},s=data.summary||{},total=Number(s.total||0);
    if(!total)return '';
    const urgent=Number(s.due_today||0)+Number(s.days_1_7||0);
    const cls=urgent?' danger':'';
    const parts=[];
    if(Number(s.due_today||0))parts.push(s.due_today+' vence(m) hoje');
    if(Number(s.days_1_7||0))parts.push(s.days_1_7+' em até 7 dias');
    if(Number(s.days_8_15||0))parts.push(s.days_8_15+' em 8–15 dias');
    if(Number(s.days_16_30||0))parts.push(s.days_16_30+' em 16–30 dias');
    return '<div class="bling-banner expiry-alert-banner'+cls+'"><strong>Validades exigem atenção · '+esc(total)+' produto(s) vencem em até 30 dias</strong><small>'+esc(parts.join(' · '))+'</small><div class="bling-actions"><button class="secondary" type="button" data-today-expiry>Ver validades</button></div></div>';
  }

    return {renderTodayExpiryAlert};
  }
  global.DonaAntoniaAdminExpiryAlert=Object.freeze({createExpiryAlert});
})(window);
