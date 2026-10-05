import fs from 'node:fs';
import assert from 'node:assert/strict';

const bridge=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const marker='order_check_required_before_bling_verified';
const indexes=[];
let from=0;
while(true){
  const i=bridge.indexOf(marker,from);
  if(i<0)break;
  indexes.push(i);
  from=i+marker.length;
}
assert.ok(indexes.length>=1,'Hub precisa manter o gate protegido para Verificado');
for(const i of indexes){
  const block=bridge.slice(Math.max(0,i-2200),i+300);
  assert.match(block,/ops_order_check_sessions/,'Gate legado EAN deve continuar compatível');
  assert.match(block,/order_separation_completions_v1/,'Gate Verificado deve aceitar a separação operacional V3/V4');
  assert.match(block,/stock_applied/,'Separação só pode equivaler à conferência após estoque aplicado');
  assert.match(block,/order_separation_items_v1/,'Gate precisa validar os itens da separação');
  assert.match(block,/state[\s\S]{0,120}pending|pending[\s\S]{0,120}state/,'Gate precisa rejeitar separação com item pendente');
}
console.log('order separation verified gate v4: ok');
