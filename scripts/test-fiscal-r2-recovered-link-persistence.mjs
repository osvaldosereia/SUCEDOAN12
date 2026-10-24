import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../supabase/functions/admin-service-intelligence-v1/index.ts',import.meta.url),'utf8');
const s=code.indexOf('if(preview.invoice_id&&preview.invoice&&!preview.invoice?.situation?.authorized)');
const e=code.indexOf('if(preview.invoice_id||preview.invoice)',s);
assert.ok(s>=0&&e>s);
const portion=code.slice(s,e);
for(const k of [
 'probed.identity_verified===true',
 'preview.invoice_lookup?.by==="bling_sale_invoice_reference"',
 'Number(job.bling_invoice_id||0)===0',
 '.eq("bling_order_id",preview.bling_order_id)',
 '.eq("status","review_required").is("bling_invoice_id",null)',
 'existing_invoice_recorded',
 'existing_invoice_rejected_or_terminal'
])assert.ok(portion.includes(k),'missing safe persisted invoice guard: '+k);
assert.ok(portion.includes('sb.from("dispatch_fiscal_jobs").update('));
assert.ok(!portion.includes('sb.from("order_fiscal_controls").update('),
 'Rejected NF-e must not mark controls as authorized');
assert.ok(!portion.includes('mark_order_dispatch_fiscal_authorized_v1'));
assert.ok(!portion.includes('blingHubPostOnce('));
assert.ok(code.includes('const newlyLinkedInvoice=Number(job.bling_invoice_id||0)>0'));
assert.ok(code.includes('Number(lastEvent?.diagnostics?.invoice_id||0)!==Number(job.bling_invoice_id)'));
assert.ok(code.includes('if(unchanged&&!newlyLinkedInvoice'));
const idPos=code.indexOf('diagnostics.invoice_id=Number(preview.invoice_id||0)||null');
const blockPos=code.indexOf('if(preview.hard_blockers?.length)',idPos);
assert.ok(idPos>0&&blockPos>idPos,'Recognized invoice ID must be recorded before terminal blocker');
console.log('PASS: verified sale note is remembered without changing authorization or generating a duplicate.');
