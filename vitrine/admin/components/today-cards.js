// Componentes de leitura da visão Hoje. Dependências fornecidas pelo Admin.
(function(global){
  function createTodayCards(esc,todayCardCount,renderTodayIssueBreakdown,orderIssueCount){
  function renderTodayCards(){
    const cards=[
      ['new','Novos','Pedidos para confirmar'],
      ['separate','Separação','Pedidos para separar'],
      ['ready','Prontos','Aguardando saída'],
      ['delivery','Em entrega','Pedidos na rua'],
      ['delivered','Entregues hoje','Conferir fechamento'],
      ['closure','Fechamento','Recebimento ou fiscal pendente'],
      ['backlog','De dias anteriores','Não deixar pedido para trás'],
      ['problems','Precisa de você','Pendências operacionais']
    ];
    return '<div class="ops-cards">'+cards.map(([key,label,sub])=>{
      const count=todayCardCount(key);
      const danger=(key==='problems'||key==='backlog'||key==='closure')&&count;
      const target=key==='closure'?' data-today-tab="closure"':' data-today-filter="'+key+'"';
      return '<button class="ops-card '+(danger?'danger':'')+'" type="button"'+target+'><small>'+esc(label)+'</small><strong>'+count+'</strong><span>'+esc(sub)+'</span></button>';
    }).join('')+'</div>'+
      renderTodayIssueBreakdown();
  }
  function renderTodayIssueBreakdown(){
    const issues=[
      ['address','Endereço'],
      ['customer','Cliente'],
      ['payment','Pagamento'],
      ['history','Histórico'],
      ['stock','Estoque']
    ].map(([key,label])=>[key,label,orderIssueCount(key)]).filter(([, ,count])=>count>0);
    if(!issues.length)return '';
    return '<div class="order-filters" style="margin:-2px 0 14px"><span class="filter-count">Pendências:</span>'+
      issues.map(([key,label,count])=>'<button class="filter-chip danger" type="button" data-today-issue="'+key+'">'+esc(label)+' · '+count+'</button>').join('')+
    '</div>';
  }
    return {renderTodayCards,renderTodayIssueBreakdown};
  }
  global.DonaAntoniaAdminTodayCards=Object.freeze({createTodayCards});
})(window);
