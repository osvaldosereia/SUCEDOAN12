import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={window:{},String,Number,Object,Boolean,Array,Math};
vm.createContext(context);
for(const file of ['customer-readiness.js','card-model.js','card-view.js'])
  vm.runInContext(fs.readFileSync(`vitrine/admin/orders/${file}`,'utf8'),context,{filename:file});
const readiness=context.window.DonaAntoniaAdminCustomerReadiness.create(value=>String(value||'').trim().toLowerCase());
const fiscal={};
const model=context.window.DonaAntoniaAdminOrderCardModel.create({
  normalize:value=>String(value||'').toLowerCase(),escapeHtml:value=>String(value),
  customerReadiness:{isPending:readiness.isOrderCustomerDataPending,reasons:readiness.orderCustomerDataPendingReasons},
  cachedFiscalForOrder:order=>fiscal[order?.id]||null,detailFiscalForOrder:()=>null
});
const card=context.window.DonaAntoniaAdminOrderCardView.create({
  escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
  money:value=>`R$ ${(Number(value||0)/100).toFixed(2)}`,
  dateTime:value=>value||'sem data',orderDisplayCode:order=>order.order_number||order.id,
  separationMoney:value=>`R$ ${Number(value).toFixed(2)}`,orderCardPhone:()=>'(65) 99999-0000',
  cardModel:model,customerReadiness:readiness,fiscalByOrder:id=>fiscal[id]||null
});

{
  const html=card.render({id:'<x>',status:'created',customer_id:'c1',whatsapp_phone_e164:'6566660000',delivery_address_snapshot:{street:'Rua A',number:'10',city:'Cuiabá',state:'MT'},customer_name:'Ana <Silva>',total_cents:1234,created_at:'ontem'});
  assert.match(html,/NÃO MONTAR ESSE PEDIDO/);
  assert.match(html,/CONFIRMAR PEDIDO/);
  assert.match(html,/&lt;x&gt;/);
  assert.match(html,/Ana &lt;Silva&gt;/);
  assert.doesNotMatch(html,/data-manual-queue-add/,'unconfirmed orders cannot enter manual separation');
}

{
  const order={id:'c1',order_number:'001',status:'confirmed',customer_id:'c1',whatsapp_phone_e164:'6566660000',delivery_address_snapshot:{street:'Rua A',number:'10',city:'Cuiabá',state:'MT'},customer_name:'Bruna',total_cents:9900,created_at:'hoje',separation_summary:{
    assignment:{separator_key:'jose',separator_label:'José',assigned_at:'10:00'},
    counts:{total:4,separated:2,missing:1,pending:1},missing_subtotal:12.5
  }};
  const html=card.render(order);
  assert.match(html,/MONTAR PARA ENTREGAR HOJE/);
  assert.match(html,/EM SEPARAÇÃO · JOSÉ/);
  assert.match(html,/3 de 4 itens/);
  assert.match(html,/Separação em andamento/);
  assert.match(html,/2 separados/);
  assert.match(html,/1 pendente/);
  assert.match(html,/faltou/i);
  assert.match(html,/CONTINUAR SEPARAÇÃO/);
  assert.match(html,/data-order-chat="c1"/);
  assert.match(html,/data-open-order="c1"/);
  assert.doesNotMatch(html,/data-manual-queue-(?:add|remove)/,'confirmed orders enter Separar agora without manual queue controls');
}

{
  const ready={id:'f1',status:'ready',customer_id:'c1',whatsapp_phone_e164:'6566660000',delivery_address_snapshot:{street:'Rua A',number:'10',city:'Cuiabá',state:'MT'},customer_name:'Cliente',total_cents:100,created_at:'hoje'};
  fiscal.f1={authorized:true,stage:'authorized'};
  assert.match(card.render(ready),/data-v3-dispatch="f1"/);
  fiscal.f1={stage:'blocked'};
  assert.match(card.render(ready),/REVISAR NF-e/);
  assert.doesNotMatch(card.render(ready),/data-v3-dispatch="f1"/);
}

{
  const pending={id:'p1',status:'created',customer_name:'Sem cadastro',total_cents:100,created_at:'hoje'};
  assert.match(card.render(pending),/AGUARDANDO DADOS DO CLIENTE/);
  assert.doesNotMatch(card.render(pending),/data-v3-confirm="p1"/);
}

console.log('Admin order card view and operational rendering: PASS');
