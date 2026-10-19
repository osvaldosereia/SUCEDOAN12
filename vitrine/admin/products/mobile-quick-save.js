(()=>{
  window.DonaAntoniaAdminMobileProductQuickSave=Object.freeze({
    create({products,api,currentOperator,requireOperator,setSaveState,errorMessage,timers,stockQueue,stockZeroPending,processStockQueue}){
      const drafts=new Map(),pendingTimers=new Map(),busy=new Set();
      function priceCents(value){let s=String(value??'').trim().replace(/R\$/gi,'').replace(/\s+/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)&&n>=0?Math.round(n*100):null}
      function schedule(id,field,value){
        const product=products().find(p=>String(p.id)===String(id));if(!product)return;
        const draft=drafts.get(id)||{};
        if(field==='price'){const cents=priceCents(value);if(cents===null){setSaveState(id,'quick',false,'Preço inválido');return}draft.sale_price_cents=cents;product.sale_price_cents=cents;setSaveState(id,'quick',true)}
        else if(field==='cost'){const cents=priceCents(value);if(cents===null){setSaveState(id,'quick',false,'Custo inválido');return}draft.cost_cents=cents;product.cost_cents=cents;setSaveState(id,'quick',true)}
        else if(field==='stock'){const quantity=Number(String(value).replace(',','.'));if(!Number.isFinite(quantity)||quantity<0){setSaveState(id,'stock',false,'Estoque inválido');return}draft.stock_quantity=quantity;setSaveState(id,'stock',true)}
        else if(field==='gondola'){draft.gondola_number=value===''?null:Number(value);product.gondola_number=value===''?null:Number(value);setSaveState(id,'quick',true)}
        else if(field==='expiration'){draft.expiration_date=value||null;product.expiration_date=value||null;setSaveState(id,'quick',true)}
        drafts.set(id,draft);timers.clear(pendingTimers.get(id));pendingTimers.set(id,timers.set(()=>flush(id),650));
      }
      async function flush(id){
        timers.clear(pendingTimers.get(id));pendingTimers.delete(id);
        if(busy.has(id))return;
        const draft=drafts.get(id);if(!draft)return;drafts.delete(id);
        const operator=currentOperator()||requireOperator();
        if(!operator){setSaveState(id,'quick',false,'Operador necessário');setSaveState(id,'stock',false,'Operador necessário');return}
        const quick={};
        for(const key of ['sale_price_cents','cost_cents','gondola_number','expiration_date'])if(Object.prototype.hasOwnProperty.call(draft,key))quick[key]=draft[key];
        if(Object.keys(quick).length){
          busy.add(id);
          try{
            const data=await api('product_quick_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,...quick,operator})});
            const product=products().find(item=>String(item.id)===String(id)),pending=drafts.get(id)||{};
            if(product&&data.product)for(const key of ['sale_price_cents','cost_cents','gondola_number','expiration_date','active'])if(!Object.prototype.hasOwnProperty.call(pending,key))product[key]=data.product[key];
            const hasPendingQuick=Object.keys(pending).some(key=>key!=='stock_quantity');
            setSaveState(id,'quick',hasPendingQuick);
          }catch(error){setSaveState(id,'quick',false,errorMessage(error.message))}
          finally{busy.delete(id)}
        }else setSaveState(id,'quick',false);
        if(Object.prototype.hasOwnProperty.call(draft,'stock_quantity')&&!stockZeroPending.has(String(id))){stockQueue.set(id,{quantity:draft.stock_quantity,operator});processStockQueue()}
        if(drafts.has(id)){timers.clear(pendingTimers.get(id));pendingTimers.set(id,timers.set(()=>flush(id),180))}
      }
      return Object.freeze({schedule,flush,priceCents,state:Object.freeze({drafts,timers:pendingTimers,busy})});
    }
  });
})();
