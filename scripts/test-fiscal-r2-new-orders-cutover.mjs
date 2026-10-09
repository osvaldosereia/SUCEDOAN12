import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isFiscalRecoveryNewOrderR2,inspectBlingNfeR2} from '../supabase/functions/admin-service-intelligence-v1/_shared/fiscal-r2-nfe-inspector.mjs';
const base='2026-10-09T20:08:06.484578Z';
assert.equal(isFiscalRecoveryNewOrderR2('2026-10-09T20:08:06.483Z',base),false);
assert.equal(isFiscalRecoveryNewOrderR2(base,base),true);
assert.equal(isFiscalRecoveryNewOrderR2('2026-10-09T20:08:08Z',base),true);
assert.equal(isFiscalRecoveryNewOrderR2('2026-10-08T12:00:00Z',base),false);
assert.equal(isFiscalRecoveryNewOrderR2('',base),false);
assert.equal(isFiscalRecoveryNewOrderR2('2026-10-09T20:09:00Z',''),false);
const src=readFileSync(new URL('../supabase/functions/admin-service-intelligence-v1/index.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261009201000_fiscal_autorecovery_only_new_orders.sql',import.meta.url),'utf8');
const s=src.slice(src.indexOf('async function blingHubFiscalNfeAutoRecovery('),src.indexOf('async function blingHubVitrineDispatchFiscalCanary('));
const p=src.slice(src.indexOf('async function blingHubFiscalDraftProbeV2('),src.indexOf('async function blingHubVitrineDispatchFiscalPreview('));
for(const marker of ['min_order_created_at','scope:"new_orders_only"','freshIds','gte("created_at",cutover)','in("order_id",freshIds)','isFiscalRecoveryNewOrderR2(job.created_at,cutover)','isFiscalRecoveryNewOrderR2(oq.data.created_at,cutover)']){
 assert.ok(s.includes(marker),'worker must filter: '+marker);
}
assert.ok(p.includes('if(!sourceOrderId)'),'No invoice ID-only exploration of legacy orders');
assert.ok(p.includes('historical_order_excluded'));
assert.ok(p.includes('isFiscalRecoveryNewOrderR2(oq.data.created_at,fence.data.min_order_created_at)'));
assert.ok(migration.includes('fiscal_nfe_autorecovery_cutover_floor_v1'));
assert.ok(migration.includes('2026-10-09 20:08:06.484578+00'));
const note={data:{id:12,situacao:1,pedidoVenda:{id:99},contato:{id:77},itens:[{descricao:'Example',tributacao:{}},{descricao:'Another',tributacao:{ncm:''}}]}};
const result=inspectBlingNfeR2(note,{bling_order_id:99,sale_invoice_id:12,contact_id:77});
assert.equal(result.ncm_not_exposed_count,1);
assert.equal(result.invalid_ncm_format_count,1);
assert.equal(result.items[0].ncm_state,'not_exposed');
assert.equal(result.items[1].ncm_state,'missing');
console.log('PASS: existing orders are excluded at both levels; missing NF-e NCM is not inferred from absent API fields.');
