// Shared fiscal read scheduler. A batch must not replace a newer order detail.
(function(global){
  function create({api,getCache}){
    const inFlight=new WeakMap(),queue=[];
    let active=0;
    async function run(job){
      let value;
      try{
        value=await api('order_fiscal_status',{}, {
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id})
        });
      }catch(error){value={error:String(error?.message||'fiscal_unavailable')}}
      if(getCache()===job.cache&&job.cache[job.id]===job.initial)job.cache[job.id]=value;
      job.pending.delete(job.id);active--;job.done();drain();
    }
    function drain(){
      while(active<3&&queue.length){active++;run(queue.shift())}
    }
    function request(row,cache){
      if(cache[row.id])return Promise.resolve();
      let pending=inFlight.get(cache);
      if(!pending){pending=new Map();inFlight.set(cache,pending)}
      if(pending.has(row.id))return pending.get(row.id);
      let done;const promise=new Promise(resolve=>{done=resolve});
      pending.set(row.id,promise);
      queue.push({id:row.id,cache,initial:cache[row.id],pending,done});drain();
      return promise;
    }
    async function load(rows){
      const cache=getCache();
      await Promise.all((rows||[]).map(row=>request(row,cache)));
    }
    return Object.freeze({load});
  }
  global.DonaAntoniaAdminFiscalLoader=Object.freeze({create});
})(window);
