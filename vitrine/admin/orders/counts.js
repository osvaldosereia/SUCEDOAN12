(function(global){
  function createOrderCounts(state,orderProblemReasons,orderFilterMatch){
  function orderFilterCount(filter){
    if(filter==='problems')return state.orders.filter(o=>orderProblemReasons(o).length>0).length;
    return state.orders.filter(o=>orderFilterMatch(o,filter)).length;
  }
  function todayCardCount(key){
    if(key==='closure')return Number(state.closurePendingCount||0);
    return orderFilterCount(key);
  }
    return {orderFilterCount,todayCardCount};
  }
  global.DonaAntoniaAdminOrderCounts=Object.freeze({createOrderCounts});
})(window);
