import fs from 'node:fs';
import assert from 'node:assert/strict';

// The Admin gateway rejects unknown actions before dispatch. Any handler absent
// from LOCAL is unreachable, even if its implementation is otherwise correct.
const source=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const parseSet=(name)=>{
  const declaration=source.match(new RegExp('const '+name+'=new Set\\(\\[([^\\]]+)\\]\\)'));
  assert.ok(declaration,'missing '+name);
  const entries=[...declaration[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(entries).size,entries.length,'duplicates in '+name);
  return new Set(entries);
};
const allowed=parseSet('LOCAL'),writes=parseSet('WRITE_ACTIONS');
const routed=new Set([...source.matchAll(/\ba\s*===\s*"([a-z][a-z0-9_]*)"/g)].map(x=>x[1]));
assert.ok(source.includes('if(!LOCAL.has(a))return js('),'route allowlist must run before handlers');
assert.ok(source.includes('auth.role==="viewer"&&WRITE_ACTIONS.has(a)'),'viewer write guard must remain active');
for(const action of routed)assert.ok(allowed.has(action),'unreachable route '+action);
for(const action of allowed)assert.ok(routed.has(action),'registered but unimplemented route '+action);
for(const action of writes)assert.ok(allowed.has(action),'write route not registered '+action);
for(const action of ['product_lot_save','product_lot_tracking_complete','order_check_start','order_check_scan','order_check_finish']){
  assert.ok(allowed.has(action),'missing operational handler '+action);
  assert.ok(writes.has(action),'unprotected operational write '+action);
}
for(const action of ['history_sync_retry','bling_oauth_begin','order_separation_complete','inventory_sheet_apply','order_fiscal_issue_v4']){
  assert.ok(writes.has(action),'POST side effect incorrectly accessible to viewer: '+action);
}
console.log('Admin gateway routes and write permissions: PASS ('+allowed.size+' routes, '+writes.size+' writes)');
