import fs from 'node:fs';
import assert from 'node:assert/strict';
const edge=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const between=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return s.slice(i,j)};
const pdf=between(html,'  async function openDanfeForOrder(','  async function loadCurrentOrderFiscal(');
const fiscal=between(edge,'async function orderFiscalStatusV4(','async function orderFiscalIssueV4(');
for(const p of [/order_fiscal_document_pdf/,/atob\(String\(data\.base64\|\|''\)\)/,/fiscal_document_empty/,/new Blob\(\[bytes\],\{type:'application\/pdf'\}\)/,/URL\.createObjectURL/,/URL\.revokeObjectURL/,/w\.close\(\)/])assert.match(pdf,p);
assert.match(pdf,/if\(fiscal\.authorized!==true&&gate\.authorized!==true\)/);
assert.doesNotMatch(pdf,/&&\s*!fiscal\.bling_invoice_id\s*&&\s*!fiscal\.invoice_id/);
assert.match(fiscal,/danfeAvailable=authorized&&Boolean/);
// A remote invoice ID by itself is insufficient: NF-e must be authorized.
assert.match(html,/state\.currentOrderFiscal\?\.danfe_available===true\)\?'<button class="secondary" id="printDanfe"/);
assert.doesNotMatch(html,/state\.currentOrderFiscal\?\.bling_invoice_id\)\?'<button class="secondary" id="printDanfe"/);

assert.match(edge,/if\(fiscal\.authorized!==true\)return js\(r,\{ok:false,error:"fiscal_authorization_required_before_document"\},409\)/);
assert.match(edge,/hub\("fiscal_document_pdf",\{source_order_id:oid\}\)/);
console.log('Fiscal DANFE document download contract: PASS');
