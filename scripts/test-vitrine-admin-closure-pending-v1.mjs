import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/async function blingHubVitrinePendingClosures\(sb:any,limitRaw:any=5000\)/);
assert.match(hub,/\.eq\("delivery_status","delivered"\)/);
assert.match(hub,/const fiscalDone=c\.fiscal_status==="issued"\|\|c\.fiscal_status==="cancelled"\|\|Boolean\(c\.bling_invoice_id\)/);
assert.match(hub,/subaction==="fiscal_pending_orders"/);
assert.match(hub,/external_write:false/);

assert.match(vitrine,/async function listClosureOrders\(\)/);
assert.match(vitrine,/blingHubControl\("fiscal_pending_orders"/);
assert.match(vitrine,/const pendingRows:any\[\]=\[\]/);
assert.match(vitrine,/\.eq\("status","delivered"\)/);
assert.match(vitrine,/\.limit\(30\)/);
assert.match(vitrine,/action==="closure_orders"/);

assert.match(html,/closureOrders:\[\]/);
assert.match(html,/api\('closure_orders'\)/);
assert.match(html,/state\.fiscalByOrder=\{\.\.\.state\.fiscalByOrder,\.\.\.\(data\.fiscal_by_order\|\|\{\}\)\}/);
assert.match(html,/filter\(o=>!state\.fiscalByOrder\[o\.id\]\)/);
assert.match(html,/state\.closureOrders\.find\(x=>x\.id===id\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · fechamento pendente não some por limite recente');
