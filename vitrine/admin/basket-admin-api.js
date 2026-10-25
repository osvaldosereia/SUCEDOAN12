(() => {
  'use strict';
  const ENDPOINT='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-basket-configuration-v1';
  const bridge=()=>window.DonaAntoniaAdminBridge||{};
  const flowErrorMessage=code=>({
    basket_flow_unavailable:'Este tamanho ainda não está habilitado no Flow.',
    basket_flow_stock_changed:'O estoque mudou ou esta seleção excedeu o estoque disponível. Ajuste as quantidades.',
    basket_flow_option_unavailable:'Uma das opções deixou de estar disponível. Atualize a prévia.',
    basket_flow_single_selection:'Este tipo permite apenas uma opção por posição.',
    basket_flow_position_fixed:'Uma posição fixa foi enviada para alteração.',
    basket_flow_configuration_invalid:'A configuração do Flow está incompleta. Revise o mapeamento no Admin.'
  }[String(code||'')]||'Não foi possível calcular a cotação atual do Flow.');
  async function request(action,payload={}) {
    if(typeof bridge().token!=='function')throw new Error('Sessão administrativa indisponível.');
    const token=await bridge().token();
    const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload}),cache:'no-store'});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.ok===false)throw new Error(result.message||result.error||'Falha ao salvar a configuração.');
    return action==='products'?result:result.configuration||result;
  }
  const api={
    list:()=>request('list'),
    saveTypes:types=>request('types_save',{types}),
    saveQuantities:quantities=>request('quantities_save',{quantities}),
    saveProductType:product_type=>request('product_type_save',{product_type}),
    flowList:()=>request('flow_list'),
    saveFlowSettings:configuration=>request('flow_save',{configuration}),
    searchProducts:q=>request('products',{q,limit:40}),
    async loadBasketCompositions(basketId,count=3) {
      const endpoint='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
      const rows=await Promise.all(Array.from({length:count},(_,i)=>i+1).map(async composition=>{
        const url=new URL(endpoint);url.searchParams.set('action','basket');url.searchParams.set('basket_id',String(basketId)+'@'+composition);url.searchParams.set('lightweight','1');
        const response=await fetch(url.toString(),{method:'GET',cache:'no-store'});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.ok!==true)return null;
        return result.basket?{basket:result.basket,items:result.items||[],composition_number:composition}:null;
      }));
      return rows.filter(Boolean);
    },
    async loadFlowRuntimeConfiguration(basketId,compositionNumber) {
      const endpoint='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
      const url=new URL(endpoint);url.searchParams.set('action','basket_flow_configuration');url.searchParams.set('basket_id',String(basketId));url.searchParams.set('composition_number',String(compositionNumber));
      const response=await fetch(url.toString(),{method:'GET',cache:'no-store'});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.ok!==true)throw new Error(flowErrorMessage(result.error));
      return result;
    },
    async quoteFlow(basketId,compositionNumber,items) {
      const endpoint='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2?action=basket_flow_quote';
      const response=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({basket_id:basketId,composition_number:compositionNumber,items})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.ok!==true)throw new Error(flowErrorMessage(result.error));
      return result;
    },
    async loadPositionOptions(basketId,compositionNumber,items) {
      const endpoint='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
      const rows=Array.isArray(items)?items:[];
      const out=[];
      for(let offset=0;offset<rows.length;offset+=24){
        const chunk=rows.slice(offset,offset+24);
        const response=await fetch(endpoint+'?action=basket_mold_options_batch',{
          method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({basket_id:basketId,composition_number:compositionNumber,positions:chunk.map(item=>({
            position_id:item.position_id,selected_product_id:item.product_id||'',quantity:Math.max(1,Math.trunc(Number(item.quantity)||1))
          }))})
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.ok!==true)throw new Error('Não foi possível carregar as opções atuais da cesta.');
        out.push(...(result.positions||[]));
      }
      return out;
    },
    async saveProductInline({id,stock,active}) {
      const b=bridge();
      if(typeof b.api!=='function'||typeof b.operator!=='function')throw new Error('Sessão administrativa indisponível.');
      const operator=b.operator();if(!operator)throw new Error('Identifique o operador antes de salvar.');
      const detail=await b.api('product_detail',{id}),p=detail.product||{};
      if(!p.id)throw new Error('Não foi possível carregar o cadastro completo do produto.');
      const nextStock=Number(stock);
      const expired=Boolean(p.expiration_date&&String(p.expiration_date)<new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cuiaba'}).format(new Date()));
      if(active&&expired)throw new Error('Produto vencido · corrija a validade antes de ativar.');
      const payload={id:p.id,name:p.name,sku:p.sku,gtin:p.gtin,sale_price_cents:Number(p.sale_price_cents||0),stock_quantity:nextStock,
        expiration_date:p.expiration_date||null,auto_expiry_offer_enabled:p.auto_expiry_offer_enabled===true,
        category:p.category||'',subcategory:p.subcategory||'',packaging:p.packaging||'',image_url:p.image_url||'',description:p.description||'',
        active:active===true,operator};
      const saved=await b.api('product_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      let savedStock=Number(saved.product?.stock_quantity??nextStock);
      if(Math.abs(savedStock-nextStock)>0.0001){
        try{const stockResult=await b.api('product_stock_set',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:saved.product_id||p.id,stock_quantity:nextStock,operator,source:'basket_carousel'})});savedStock=Number(stockResult.product?.stock_quantity??nextStock)}
        catch(error){throw new Error('Status salvo; estoque não atualizado: '+(error.message||'erro no serviço de estoque'))}
      }
      if(active===true&&saved.product?.active===false)throw new Error('Status não foi ativado. Verifique a validade do produto.');
      return {id:p.id,stock:savedStock,active:saved.product?.active!==false};
    },
    toast(message){const b=bridge();if(typeof b.toast==='function')b.toast(message);else console.warn(message)}
  };
  window.DonaAntoniaBasketAdminApi=api;
})();
