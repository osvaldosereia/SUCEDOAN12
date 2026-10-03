import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('vitrine/admin/atendimento/attendance-media-send.js','utf8');
const api=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');

assert.match(ui,/let\s+pendingMediaIdempotencyKey\s*=\s*null/,'retry do mesmo arquivo deve reutilizar a mesma chave');
assert.match(ui,/pendingMediaIdempotencyKey\s*\|\|=\s*idempotencyKey\(\)/,'chave deve nascer uma vez por seleção');
assert.match(ui,/input\.addEventListener\(['"]change['"][\s\S]{0,220}pendingMediaIdempotencyKey\s*=\s*null/,'trocar arquivo deve iniciar nova operação idempotente');
const sendStart=ui.indexOf('async function sendMedia');
assert.ok(sendStart>=0,'sendMedia deve existir');
const sendEnd=ui.indexOf('\nfunction ',sendStart+10);
const sendSource=ui.slice(sendStart,sendEnd>sendStart?sendEnd:undefined);
assert.match(sendSource,/form\.set\(['"]idempotency_key['"],pendingMediaIdempotencyKey\)/,'retry deve enviar a chave persistida');
assert.match(sendSource,/mediaFile[^\n]*value\s*=\s*['"]['"][\s\S]{0,150}pendingMediaIdempotencyKey\s*=\s*null/,'sucesso deve encerrar a operação idempotente');
assert.doesNotMatch(sendSource,/catch[\s\S]{0,500}pendingMediaIdempotencyKey\s*=\s*null/,'erro não pode trocar a chave do mesmo arquivo');

assert.match(api,/action==="send_media"[\s\S]{0,350}metaConfigReady\(\)/,'send_media deve falhar antes do enqueue quando Meta não estiver configurada');

console.log('PASS test-attendance-meta-media-retry-v1');
