// Ordenação de pedidos: implementação original preservada.
(function(global){
  // Ordena uma cópia, preservando a lista original.
  function sortOperationalOrders(rows){
    return [...(Array.isArray(rows)?rows:[])].sort((a,b)=>{
      const at=Date.parse(a?.created_at||'')||0;
      const bt=Date.parse(b?.created_at||'')||0;
      return bt-at;
    });
  }
  global.DonaAntoniaAdminOrderSorting=Object.freeze({sortOperationalOrders});
})(window);
