// Owns the order editor snapshot and the lifetime of its asynchronous work.
(function(global){
  function create({isOpen}){
    let generation=0,id=null,detail=null,fiscal=null,preview=null;
    const requests=new Map();
    function invalidate(){generation++;requests.clear()}
    function begin(orderId){
      invalidate();id=String(orderId);detail=null;fiscal=null;preview=null;
      return capture();
    }
    function capture(){return Object.freeze({generation,id})}
    function isCurrent(token){return Boolean(token&&token.generation===generation&&token.id===id&&isOpen())}
    function request(channel){
      const sequence=(requests.get(channel)||0)+1;requests.set(channel,sequence);
      return Object.freeze({...capture(),channel,sequence});
    }
    function accepts(ticket){return isCurrent(ticket)&&requests.get(ticket.channel)===ticket.sequence}
    return Object.freeze({
      begin,capture,isCurrent,request,accepts,invalidate,
      get detail(){return detail},
      set detail(value){
        const next=value?.order?.id;
        if(next!=null&&String(next)!==id)begin(next);
        detail=value;
      },
      get fiscal(){return fiscal},set fiscal(value){fiscal=value},
      get preview(){return preview},set preview(value){preview=value}
    });
  }
  global.DonaAntoniaAdminOrderSession=Object.freeze({create});
})(window);
