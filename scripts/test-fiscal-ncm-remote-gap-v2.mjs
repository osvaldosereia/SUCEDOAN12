import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../supabase/functions/admin-service-intelligence-v1/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function blingHubFiscalNfeAutoRecovery(');
const stop=source.indexOf('async function blingHubVitrineDispatchFiscalCanary(',start);
assert.ok(start>=0&&stop>start);
const impl=source.slice(start,stop);
for(const expected of [
  'const linked=(products.data||[]).filter',
  'if(parsed.missing_ncm&&!names.length)',
  'blingHubGet(sb,token,"/produtos/"',
  'remoteNcm=blingHubDigits(tax.ncm??remote.ncm)',
  'c.ncm_conflict',
  'Number(c.document_count)<2',
  'ncm!==blingHubDigits(p.ncm)',
  'blingHubFiscalOfficialNcmCodes()',
  'expectedRemote=Object.prototype.hasOwnProperty.call',
  'remote_tax_changed_since_validation',
  'catalog_repaired_existing_draft_requires_invoice_item_repair',
  'generation_result_uncertain_manual_reconcile_required',
  'preview.invoice_id||preview.invoice',
  'fiscal-nfe-recovery-v3',
]) assert.ok(impl.includes(expected),'missing safety feature '+expected);
const diag=impl.indexOf('parsed.missing_ncm&&!names.length');
const remote=impl.indexOf('const remoteNcm',diag);
const inspect=impl.indexOf('if(!candidates.length)',diag);
assert.ok(diag>0&&remote>diag&&inspect>remote,
  'Do not filter locally before checking remote NCM');
const scanLimit=impl.includes('linked.length>45');
assert.equal(scanLimit,true,'Bound Bling API traffic per order');
assert.match(impl,/if\(job\.external_side_effect===true\|\|job\.error_code==="invoice_generation_uncertain"\)/);
console.log('PASS: remote NCM gap discovery, evidence gates, bounded reads and existing-draft safety.');
