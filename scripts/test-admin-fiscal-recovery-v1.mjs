import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gateway=readFileSync(new URL('../supabase/functions/admin-products-live-v1/index.ts',import.meta.url),'utf8');
const hub=readFileSync(new URL('../supabase/functions/admin-service-intelligence-v1/index.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../vitrine/admin/index.html',import.meta.url),'utf8');

for(const action of ['order_fiscal_recover_bling_v1','order_fiscal_recheck_v1']){
  assert.ok(gateway.includes(`a==="${action}"`),`route missing: ${action}`);
  assert.ok(gateway.includes(`"${action}"`),`allow-list missing: ${action}`);
  assert.ok(ui.includes(`'${action}'`),`UI operation missing: ${action}`);
}
const recoverStart=gateway.indexOf('async function orderFiscalRecoverBlingV1(');
const recoverEnd=gateway.indexOf('async function orderFiscalRecheckV1(',recoverStart);
assert.ok(recoverStart>=0&&recoverEnd>recoverStart,'Recovery handler is missing');
const recover=gateway.slice(recoverStart,recoverEnd);
assert.ok(recover.includes('auth?.role==="viewer"'),'Server must check authorization');
assert.ok(recover.includes('oq.data.status!=="ready"'),'Only separated ready orders are recoverable');
assert.ok(recover.includes('cq.data?.completed_at'),'Requires completed separation');
assert.ok(recover.includes('m.stock_applied!==true'),'Requires applied stock');
assert.ok(recover.includes('x.state==="pending"'),'Prevents incomplete separation');
assert.ok(recover.includes('postCutoverOrder(oid)'),'Respects runtime cutover');
assert.ok(recover.includes('target_key:"approved_separation"'),'Uses existing order state reconciliation');
assert.ok(recover.includes('target_key:"verified"'),'Verifies before fiscal operations');
assert.ok(recover.includes('fiscal_dispatch_reconcile'),'Checks pre-existing invoice after sync');
assert.ok(!recover.includes('blingHubCreateOrderOnce('),'Must not independently create Bling sales');
assert.ok(!recover.includes('orderFiscalIssueV4('),'Recovery must not issue invoices');
assert.ok(ui.includes('RECUPERAR VENDA NO BLING'));
assert.ok(ui.includes('CONSULTAR BLING / NF-e'));
assert.ok(ui.includes('TENTAR EMITIR NF-e'));
assert.ok(ui.includes('TENTAR AUTORIZAR NF-e'));
assert.ok(ui.includes("onclick=recoverCurrentOrderBling"));
assert.ok(ui.includes("onclick=recheckCurrentOrderFiscal"));
assert.ok(hub.includes('if(!token)token=await blingHubOauth(sb);'));
assert.ok(hub.includes('oauth_busy|oauth_temporarily_unavailable'));
assert.ok(hub.includes('p_status:jobStatus'));
assert.ok(hub.includes('summary[jobStatus]++'));
console.log('PASS: authenticated recovery, read-only recheck, idempotent issue path and transient worker retry.');
