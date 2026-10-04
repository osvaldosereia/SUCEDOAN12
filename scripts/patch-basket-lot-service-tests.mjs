import fs from 'node:fs';
const servicePath='supabase/functions/admin-products-live-v1/index.ts';
const financialTest='scripts/test-basket-kit-financials-categories.mjs';
const opsTest='scripts/test-basket-lot-ops-rules.mjs';
const commercialTest='scripts/test-basket-kit-commercial-fields.mjs';
const req=(v,m)=>{if(!v)throw new Error(m)};
const range=(text,a,b,c,label)=>{const i=text.indexOf(a),j=text.indexOf(b,i);req(i>=0&&j>i,'missing '+label);return text.slice(0,i)+c+text.slice(j)};

let s=fs.readFileSync(servicePath,'utf8');
s=s.replaceAll('sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,public_name,linked_hygiene_lot_id','sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,public_name,linked_hygiene_lot_id,business_type,linked_lot_id,own_sale_price_override,own_component_sum_snapshot,own_hidden_adjustment_snapshot,own_cost_sum_snapshot,cost_sum_snapshot');

const a='  let hygieneLots:any[]=[];';
const b='  const nx=await db.rpc("next_basket_kit_short_code_v1",{p_kit_template_id:kid});';
const loader=`  let linkableLots:any[]=[];\n  const linkq=await db.from("basket_stock_lots")\n    .select("id,kit_template_id,basket_id,lot_kind,short_code,lot_code,status,sale_enabled,quantity_built,quantity_available,built_at,public_name,business_type,linked_lot_id,sale_price_override,component_sum_snapshot,hidden_adjustment_snapshot,cost_sum_snapshot")\n    .eq("status","ready").gt("quantity_available",0).is("linked_lot_id",null).order("built_at",{ascending:false});\n  if(linkq.error)throw linkq.error;linkableLots=linkq.data||[];\n  if(linkableLots.length){\n    const li=await db.from("basket_stock_lot_items")\n      .select("lot_id,product_id,quantity_per_basket,position_order,product:products(id,name,sku,image_url,packaging,price,cost)")\n      .in("lot_id",linkableLots.map((x:any)=>x.id)).order("position_order");\n    if(li.error)throw li.error;\n    linkableLots=linkableLots.map((l:any)=>({...l,items:(li.data||[]).filter((x:any)=>String(x.lot_id)===String(l.id)).map((x:any)=>({...x,quantity_per_kit:Number(x.quantity_per_basket||0)}))}));\n  }\n`;
s=range(s,a,b,loader+b,'linkable lot loader');
const oldReturn='return {kit:{...kq.data,basket},items,lots:lotRows,hygiene_lots:hygieneLots,default_hygiene_lot_id:hygieneLots[0]?.id||null,';
req(s.includes(oldReturn),'missing detail return');
s=s.replace(oldReturn,'return {kit:{...kq.data,basket},items,lots:lotRows,linkable_lots:linkableLots,hygiene_lots:linkableLots.filter((x:any)=>x.lot_kind==="hygiene"),default_hygiene_lot_id:linkableLots.find((x:any)=>x.lot_kind==="hygiene")?.id||null,');

s=s.replaceAll('db.rpc("create_basket_kit_lot_v3"','db.rpc("create_basket_kit_lot_v4"');
s=s.replaceAll('db.rpc("save_basket_kit_lot_draft_v3"','db.rpc("save_basket_kit_lot_draft_v4"');
const oldParams='p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price),\n    p_linked_hygiene_lot_id:id(p?.linked_hygiene_lot_id)||null';
const newParams='p_public_name:tx(p?.public_name,120)||null,p_sale_price:p?.sale_price==null?null:Number(p.sale_price),\n    p_business_type:tx(p?.business_type,40)||null,p_linked_lot_id:id(p?.linked_lot_id)||null';
req(s.includes(oldParams),'missing rpc params');s=s.replaceAll(oldParams,newParams);

const marker='    const m=String(q.error.message||"").split("\\n")[0];\n    const code=';
const injected='    const m=String(q.error.message||"").split("\\n")[0];\n    const linkedLotConflictCodes=["insufficient_loose_stock","lot_product_unavailable","linked_lot_unavailable"];\n    if(m.includes("invalid_linked_lot")||m.includes("linked_lot_already_composite")||m.includes("linked_lot_unavailable")||m.includes("invalid_linked_lot_cycle"))return {error:"linked_lot_unavailable",status:409};\n    const code=';
req(s.includes(marker),'missing error mapping');s=s.replaceAll(marker,injected);
fs.writeFileSync(servicePath,s);

let t=fs.readFileSync(financialTest,'utf8');
t=t.replace("assert.deepEqual(JSON.parse(JSON.stringify(result)),{cost:34.5,retail:53},'somatórios devem incluir alimentos e o lote de limpeza escolhido mesmo quando a relação vem como array');","assert.equal(result.cost,34.5,'somatório de custo compatível deve incluir o lote escolhido');\nassert.equal(result.retail,53,'somatório de venda compatível deve incluir o lote escolhido');");
fs.writeFileSync(financialTest,t);

t=fs.readFileSync(opsTest,'utf8');
t=t.replace("assert.match(adminUi,/Lote de Limpeza\\/Higiene \\(opcional\\)/,'food lot composer must clearly mark hygiene selection optional');\nassert.match(adminUi,/d\\.kit\\.kind==='food'\\?'<div class=\"basket-composer-summary\"[^\\n]*kitLotHygieneLot/,'hygiene selector must be available for every food lot, not only a basket flag');","assert.match(adminUi,/Vincular outro lote \\(opcional\\)/,'composer must offer an optional generic lot link');\nassert.match(adminUi,/kitLotLinkedLot/,'generic linked-lot selector must be present');");
t=t.replace("assert.match(adminApi,/if\\(kq\\.data\\.kind===\"food\"\\)\\{/,'admin API must load available hygiene lots for every food kit');","assert.match(adminApi,/linkable_lots/,'admin API must load generic linkable lots');");
fs.writeFileSync(opsTest,t);

t=fs.readFileSync(commercialTest,'utf8');
t=t.replace("assert.match(adminUi,/public_name:d\\.kit\\.kind==='food'/,'draft save must send public name');\nassert.match(adminUi,/sale_price:d\\.kit\\.kind==='food'/,'draft save must send sale price');","assert.match(adminUi,/public_name:String\\(draft\\.public_name/,'draft save must send public name for every classified lot');\nassert.match(adminUi,/sale_price:Number\\(draft\\.sale_price\\)/,'draft save must send sale price for every classified lot');");
t=t.replace("assert.match(adminApi,/save_basket_kit_lot_draft_v3/,'gateway must use linked-hygiene commercial draft RPC');\nassert.match(adminApi,/create_basket_kit_lot_v3/,'gateway must use linked-hygiene commercial create RPC');\nassert.match(adminApi,/p_linked_hygiene_lot_id/,'gateway must persist the selected hygiene lot');","assert.match(adminApi,/save_basket_kit_lot_draft_v4/,'gateway must use generic linked-lot commercial draft RPC');\nassert.match(adminApi,/create_basket_kit_lot_v4/,'gateway must use generic linked-lot commercial create RPC');\nassert.match(adminApi,/p_linked_lot_id/,'gateway must persist the selected linked lot');");
fs.writeFileSync(commercialTest,t);
console.log('service and tests patch applied');
