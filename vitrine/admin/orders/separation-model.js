// Pure read model for separation and delivery print views.
// Kept outside the Admin IIFE so product aggregation can be tested independently.
((root)=>{
  function separationItems(detail){
    const map=new Map();
    const add=(key,name,qty,image,gondola,shelf,gtin='',prefix='')=>{
      const n=Number(qty||0);if(n<=0)return;
      const k=String(key||name)+'|'+prefix;const old=map.get(k);
      if(old)old.quantity+=n;
      else map.set(k,{name:(prefix?prefix+' · ':'')+(name||'Produto'),quantity:n,image_url:image||'/img/logoantonia5.png',gondola_number:gondola??null,shelf_label:String(shelf||'').trim()||null,gtin:String(gtin||'').replace(/\D/g,'')});
    };
    for(const item of detail?.items||[]){
      if(item?.item_kind==='basket'){
        for(const c of item.components||[]){
          const m=c?.metadata||{},loose=Number(m.loose_quantity??c.quantity??0),preassembled=Number(m.preassembled_units||0);
          if(loose<=0)continue;
          add(c.product_id||c.id||c.name_snapshot,c.name_snapshot,loose,c.image_url,c.gondola_number,c.shelf_label,c.gtin,preassembled>0?'EXTRA':'MONTAR');
        }
        continue;
      }
      add(item.product_id||item.id||item.name_snapshot,item.name_snapshot,item.quantity,item.image_url,item.gondola_number,item.shelf_label,item.gtin,'');
    }
    return [...map.values()].sort((a,b)=>{
      const ga=a.gondola_number!=null&&Number.isFinite(Number(a.gondola_number))?Number(a.gondola_number):999999,gb=b.gondola_number!=null&&Number.isFinite(Number(b.gondola_number))?Number(b.gondola_number):999999;
      return ga-gb||String(a.shelf_label||'').localeCompare(String(b.shelf_label||''),'pt-BR',{numeric:true})||String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
    });
  }
  function separationKitRefs(detail){
    const out=[];
    for(const plan of detail?.checkout_separation_plan||[]){
      const qty=Number(plan?.quantity||1),food=plan?.food||{},hygiene=plan?.hygiene||{};
      if(food.mode==='lot'){
        const codes=[food.short_code,hygiene.mode==='lot'?hygiene.short_code:null].filter(Boolean).join(' + ');
        out.push({label:'CESTA ORIGINAL · permanece original',code:codes||'LOTE',quantity:qty,basket:plan.basket_name||'Cesta'});
      }
    }
    return out;
  }
  root.DonaAntoniaAdminSeparationModel=Object.freeze({separationItems,separationKitRefs});
})(window);
