(()=>{
  'use strict';

  const state={
    kits:[],chips:[],products:[],mostUsed:[],draft:null,stockAuthority:'legacy_shadow',savingProductIds:new Set()
  };

  function bridge(){return window.DonaAntoniaAdminBridge||{}}
  function api(action,params={},options={}){
    const b=bridge();
    if(typeof b.api!=='function')return Promise.reject(new Error('admin_bridge_unavailable'));
    return b.api(action,params,options);
  }
  function toast(message){
    const b=bridge();
    if(typeof b.toast==='function')b.toast(message);
    else console.warn(message);
  }
  function operator(){
    const b=bridge();
    return typeof b.operator==='function'?b.operator():'Operação';
  }
  function numberValue(value){
    const raw=String(value??'').trim().replace(/\s+/g,'').replace(',','.');
    if(raw==='')return null;
    const n=Number(raw);
    return Number.isFinite(n)?n:null;
  }
  function cents(value){return Math.round(Number(value||0)*100)}
  function errorCode(error){return String(error?.error||error?.payload?.error||error?.message||'')}

  function replaceProduct(next){
    if(!next?.id)return;
    const lists=[state.products,state.mostUsed];
    for(const list of lists){
      const idx=list.findIndex(p=>String(p.id)===String(next.id));
      if(idx>=0)list[idx]={...list[idx],...next};
    }
    if(state.draft?.items){
      state.draft.items=state.draft.items.map(item=>String(item.product_id)===String(next.id)?{...item,product:{...(item.product||{}),...next}}:item);
    }
  }

  async function saveProductInline(product,changes={}){
    const productId=String(product?.id||changes?.product_id||'').trim();
    if(!productId)throw new Error('invalid_product');
    if(state.savingProductIds.has(productId))throw new Error('product_save_in_progress');

    const nextCost=Object.prototype.hasOwnProperty.call(changes,'cost')?numberValue(changes.cost):Number(product?.cost_price||0);
    const nextPrice=Object.prototype.hasOwnProperty.call(changes,'price')?numberValue(changes.price):Number(product?.sale_price||0);
    const nextStock=Object.prototype.hasOwnProperty.call(changes,'stock')?numberValue(changes.stock):Number(product?.physical_stock||0);

    if(nextCost===null||nextCost<0)throw new Error('invalid_cost: Custo não pode ser negativo.');
    if(nextPrice===null||nextPrice<0)throw new Error('invalid_price: Preço de venda não pode ser negativo.');
    if(nextStock===null||nextStock<0)throw new Error('invalid_stock: Estoque não pode ser negativo.');

    const costChanged=Math.abs(Number(product?.cost_price||0)-nextCost)>0.0001;
    const priceChanged=Math.abs(Number(product?.sale_price||0)-nextPrice)>0.0001;
    const stockChanged=Math.abs(Number(product?.physical_stock||0)-nextStock)>0.0001;
    if(!costChanged&&!priceChanged&&!stockChanged)return product;

    state.savingProductIds.add(productId);
    try{
      let latest=product;

      // Estoque sempre passa pelo escritor oficial. Quando a autoridade for Bling,
      // o backend decide se a operação é permitida e como deve ser refletida.
      if(stockChanged){
        const stockResult=await api('product_stock_set',{}, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            product_id:productId,
            stock_quantity:nextStock,
            operator:operator(),
            source:'kit_builder'
          })
        });
        latest=stockResult?.product||latest;
      }

      if(costChanged||priceChanged){
        const quickResult=await api('product_quick_save',{}, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            product_id:productId,
            cost_cents:cents(nextCost),
            sale_price_cents:cents(nextPrice),
            operator:operator(),
            source:'kit_builder'
          })
        });
        latest=quickResult?.product||latest;
      }

      const normalized={
        ...latest,
        id:productId,
        cost_price:costChanged?nextCost:Number(latest?.cost_price??product?.cost_price??0),
        sale_price:priceChanged?nextPrice:Number(latest?.sale_price??product?.sale_price??0),
        physical_stock:stockChanged?nextStock:Number(latest?.physical_stock??product?.physical_stock??0),
        stock_authority:latest?.stock_authority||product?.stock_authority||state.stockAuthority
      };
      replaceProduct(normalized);
      state.stockAuthority=normalized.stock_authority||state.stockAuthority;
      toast(state.stockAuthority==='bling'?'Produto atualizado. Estoque validado pela autoridade Bling.':'Produto atualizado.');
      return normalized;
    }catch(error){
      const code=errorCode(error);
      if(code.includes('bling'))toast('O estoque é controlado pelo Bling e esta alteração não foi aceita.');
      else if(code.includes('basket')||code.includes('locked')||code.includes('reserved'))toast('Não foi possível reduzir o estoque abaixo da quantidade já reservada em cestas/kits.');
      else if(code.includes('invalid_cost'))toast('Custo inválido.');
      else if(code.includes('invalid_price'))toast('Preço de venda inválido.');
      else if(code.includes('invalid_stock'))toast('Estoque inválido.');
      else toast('Não consegui atualizar este produto.');
      throw error;
    }finally{
      state.savingProductIds.delete(productId);
    }
  }

  function setProducts(rows){
    state.products=Array.isArray(rows)?rows:[];
    const authority=state.products.find(p=>p?.stock_authority)?.stock_authority;
    if(authority)state.stockAuthority=authority;
  }
  function setMostUsed(rows){state.mostUsed=Array.isArray(rows)?rows:[]}
  function setDraft(value){state.draft=value||null}

  window.DonaAntoniaKitBuilder={
    state,
    saveProductInline,
    setProducts,
    setMostUsed,
    setDraft
  };
})();
