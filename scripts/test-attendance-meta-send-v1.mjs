import assert from 'node:assert/strict';
import fs from 'node:fs';

const transportPath = new URL('../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs', import.meta.url);
assert.equal(fs.existsSync(transportPath), true, 'adapter Meta deve existir');

const transport = fs.readFileSync(transportPath, 'utf8');

assert.match(transport, /export\s+async\s+function\s+sendTextViaMeta/i);
assert.match(transport, /phoneNumberId/i);
assert.match(transport, /accessToken/i);
assert.match(transport, /graphVersion/i);
assert.match(transport, /recipient_type/i);
assert.match(transport, /messaging_product\s*:\s*["']whatsapp["']/i);
assert.match(transport, /type\s*:\s*["']text["']/i);
assert.match(transport, /preview_url\s*:\s*false/i);
assert.match(transport, /messages\?\.\[0\]\?\.id|messages\[0\]\.id/i, 'sucesso deve exigir wamid');
assert.match(transport, /providerMessageId/i);
assert.match(transport, /provider\s*:\s*["']meta["']/i);
assert.match(transport, /Authorization/i);
assert.match(transport, /Bearer/i);
assert.match(transport, /AbortController/i, 'adapter deve ter timeout explícito');
assert.match(transport, /timeout/i);
assert.match(transport, /meta_http_error|meta_network_error|meta_timeout|meta_invalid_response/i);
assert.doesNotMatch(transport, /console\.(log|error|warn)\([^\n]*(accessToken|authorization)/i, 'token não pode ser logado');
assert.doesNotMatch(transport, /EAA[A-Za-z0-9_-]{30,}/, 'token literal não pode existir');

console.log('OK · contrato do adapter Meta exige wamid, timeout, erros normalizados e não embute segredo.');
