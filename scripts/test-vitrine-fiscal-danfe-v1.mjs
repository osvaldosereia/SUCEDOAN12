import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/async function blingHubGetNfeDocumentPdf/);
assert.match(hub,/\/nfe\/documento\/.*\?formato=pdf/);
assert.match(hub,/Accept:"application\/json"/);
assert.match(hub,/Array\.isArray\(payload\?\.data\)/);
assert.match(hub,/doc\?\.conteudo/);
assert.match(hub,/DecompressionStream\("gzip"\)/);
assert.match(hub,/blingHubBase64ToBytes/);
assert.match(hub,/blingHubIsPdf/);
assert.match(hub,/danfe_document_too_large/);
assert.match(hub,/async function blingHubVitrineDanfePdf/);
assert.match(hub,/dispatch_fiscal_status!=="authorized"/);
assert.match(hub,/accessKey\.length!==44/);
assert.match(hub,/event_type:"dispatch_danfe_pdf_opened"/);
assert.match(hub,/external_write:false/);
assert.match(hub,/subaction==="fiscal_document_pdf"/);

assert.match(vitrine,/fiscal_document_pdf/);
assert.match(vitrine,/action==="order_fiscal_document_pdf"/);
assert.match(vitrine,/blingHubControl\("fiscal_document_pdf"/);

assert.match(html,/async function openCurrentDanfe\(\)/);
assert.match(html,/Imprimir DANFE/);
assert.match(html,/order_fiscal_document_pdf/);
assert.match(html,/new Blob\(\[bytes\],\{type:'application\/pdf'\}\)/);
assert.match(html,/DANFE .*aberto para impressão/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length);
for(const source of scripts)new Function(source);

console.log('OK · DANFE PDF oficial disponível no Admin somente após autorização fiscal');
