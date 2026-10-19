// Shared order data, list refresh lifetime and serialized manual picking queue.
(function(global){
  function create({api,queueRequest,orders,navigation,ui,view}){
    const {query:$,document,toast,errorMessage,currentOperator=()=>''}=ui;
    const state={orderQuery:'',orderStatusTab:'manual',manualQueueIds:new Set(),manualQueueLoaded:false,manualQueueError:false,manualQueueLastSync:0};
    let ordersLoadGeneration=0,orderBoardRefreshGeneration=0,queueTail=Promise.resolve(),queueRead=null;
    const mutations=new Set(),confirmations=new Set();
    function viewToken(){return $('#orderRows')}
    function canPaint(host){return navigation.currentTab()==='orders'&&host&&host===$('#orderRows')}
    function manualQueueRpc(action,orderId=null){
      const task=queueTail.then(async()=>{
        const data=await queueRequest(action,orderId);
        state.manualQueueIds=new Set(data.order_ids.map(String));
        state.manualQueueLoaded=true;state.manualQueueError=false;state.manualQueueLastSync=Date.now();
        return data;
      });
      queueTail=task.catch(()=>{});return task;
    }
    function loadManualPickQueue(){
      if(queueRead)return queueRead;
      queueRead=manualQueueRpc('list').catch(error=>{state.manualQueueError=true;state.manualQueueLoaded=false;throw error}).finally(()=>{queueRead=null});
      return queueRead;
    }
    async function setManualPickQueue(orderId,enable,button){
      const id=String(orderId);if(mutations.has(id))return;
      const host=viewToken();mutations.add(id);
      if(button){button.disabled=true;button.textContent=enable?'ADICIONANDO…':'RETIRANDO…'}
      try{
        await manualQueueRpc(enable?'add':'remove',orderId);
        toast(enable?'Pedido incluído em SEPARAR AGORA':'Pedido retirado de SEPARAR AGORA');
      }catch(error){toast('Não foi possível atualizar a fila manual: '+errorMessage(error.message))}
      finally{mutations.delete(id);if(canPaint(host))view.paint()}
    }
    async function loadOrders(){
      const generation=++ordersLoadGeneration,host=viewToken();
      const isLatest=()=>generation===ordersLoadGeneration;
      try{
        const data=await api('orders');if(!isLatest())return;
        orders.set(Array.isArray(data.orders)?data.orders:[]);
        try{await loadManualPickQueue()}catch{}
        if(!isLatest())return;
        if(canPaint(host))view.paint();
        const fiscalRows=orders.get().filter(o=>o.status==='ready').sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,8);
        if(fiscalRows.length){await orders.loadFiscal(fiscalRows);if(isLatest()&&canPaint(host))view.paint()}
      }catch(error){if(isLatest()&&canPaint(host))host.innerHTML='<div class="empty">Não consegui carregar os pedidos.</div>'}
    }
    async function confirmOrder(id,button){
      const key=String(id);if(confirmations.has(key))return false;
      const current=orders.get().find(row=>String(row.id)===key);
      if(current&&orders.isCustomerPending?.(current)){
        toast('Complete os dados essenciais do cliente antes de confirmar');return false;
      }
      const previousLabel=button?.textContent||'CONFIRMAR PEDIDO';confirmations.add(key);
      if(button){button.disabled=true;button.textContent='CONFIRMANDO…'}
      let confirmed=false;
      try{
        await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:'confirmed',operator:currentOperator()||'Operação'})});
        confirmed=true;toast('Pedido confirmado');await loadOrders();return true;
      }catch(error){toast(errorMessage(error.message));return false}
      finally{
        confirmations.delete(key);
        if(button&&(!document.contains||document.contains(button))){button.disabled=false;button.textContent=confirmed?'CONFIRMADO':previousLabel}
      }
    }
    async function refreshOrderSeparationBoard(){
      if(navigation.currentTab()!=='orders'||document.hidden||!orders.get().length)return;
      const generation=++orderBoardRefreshGeneration,ordersGeneration=ordersLoadGeneration,host=viewToken();
      const isCurrent=()=>generation===orderBoardRefreshGeneration&&ordersGeneration===ordersLoadGeneration&&canPaint(host)&&!document.hidden;
      try{
        const data=await api('order_separation_board');if(!isCurrent())return;
        const map=new Map((data.board||[]).map(x=>[String(x.order_id),x]));let changed=false;
        orders.set(orders.get().map(o=>{
          const row=map.get(String(o.id));if(!row)return o;
          const nextSummary=row.separation_summary||null,nextStatus=row.status||o.status;
          if(nextStatus!==o.status||JSON.stringify(nextSummary)!==JSON.stringify(o.separation_summary||null))changed=true;
          return {...o,status:nextStatus,separation_summary:nextSummary};
        }));
        if(state.orderStatusTab==='manual'&&Date.now()-Number(state.manualQueueLastSync||0)>=15000){
          const previous=[...state.manualQueueIds].sort().join(',');
          try{
            await loadManualPickQueue();if(!isCurrent())return;
            if(previous!==[...state.manualQueueIds].sort().join(','))changed=true;
          }catch{}
        }
        if(changed&&isCurrent())view.paint();
      }catch{} // Polling is best effort; explicit list refresh reports failures.
    }
    return Object.freeze({state,loadOrders,confirmOrder,loadManualPickQueue,setManualPickQueue,refreshOrderSeparationBoard});
  }
  global.DonaAntoniaAdminOrderList=Object.freeze({create});
})(window);
