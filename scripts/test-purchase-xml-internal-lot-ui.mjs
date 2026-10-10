import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const admin=readFileSync(new URL('../vitrine/admin/index.html',import.meta.url),'utf8');
const backends=[
  '../supabase/functions/purchase-xml-v1/index.ts',
  '../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts'
].map(path=>readFileSync(new URL(path,import.meta.url),'utf8'));

assert.match(admin,/Lotes internos desta entrada/,'Admin deve identificar explicitamente os lotes internos desta NF-e');
assert.match(admin,/Validade desta entrada \(opcional\)/,'validade da entrada deve ser opcional');
assert.match(admin,/FIFO/,'Admin deve explicar a ordem FIFO');
assert.doesNotMatch(admin,/Sem controle de validade para este item/,'não deve exigir opt-out de validade');
assert.doesNotMatch(admin,/\+ Outra validade/,'uma entrada XML deve usar o lote interno automático, não criar vários lotes manuais');
assert.doesNotMatch(admin,/data-receipt-lot-qty/,'quantidade do lote vem da quantidade convertida da NF-e');
assert.match(admin,/expiration_date:String\([^\n]+data-receipt-lot-exp/,'salvamento deve enviar somente a validade opcional por item');

for(const [i,src] of backends.entries()){
  assert.match(src,/inventory_lot_id/,'backend '+i+' deve usar inventory_lot_id');
  assert.match(src,/lot_expiration_date/,'backend '+i+' deve usar lot_expiration_date');
  assert.match(src,/entry_inventory_lot/,'backend '+i+' deve expor o lote interno da entrada');
  assert.match(src,/activate_purchase_xml_inventory_lots_v1/,'backend '+i+' deve ativar o lote interno existente');
  assert.doesNotMatch(src,/expiration_date_required/,'backend '+i+' não pode exigir validade');
  assert.match(src,/receipt_expiration_optional:true/,'backend '+i+' deve declarar validade opcional');
  const materialize=src.match(/async function materializeReceiptLots[\s\S]*?\n}\n\nasync function docDetail/)?.[0]||'';
  assert.ok(materialize,'materializeReceiptLots ausente no backend '+i);
  assert.doesNotMatch(materialize,/ops2_upsert_product_lot_v1/,'backend '+i+' não pode criar lote duplicado ao verificar recebimento');
}
assert.equal(backends[0],backends[1],'os dois módulos purchase-xml devem permanecer sincronizados');

const inline=[...admin.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
assert.ok(inline.length,'Admin precisa ter JavaScript inline');
inline.forEach((src,i)=>assert.doesNotThrow(()=>new Function(src),`JavaScript inline ${i+1} do Admin deve compilar`));

console.log('purchase XML internal lot UI contract OK');
