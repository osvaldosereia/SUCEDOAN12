import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('vitrine/admin/atendimento/attendance-media-send.js','utf8');
const textUi=fs.readFileSync('vitrine/admin/atendimento/attendance-send.js','utf8');
const mediaGateway=fs.readFileSync('supabase/functions/_shared/admin-attendance-media-send-v1.mjs','utf8');

assert.doesNotMatch(textUi,/send_media|mediaFile|apiForm/,'mídia deve ficar isolada do sender de texto para evitar dois fluxos concorrentes');
assert.match(ui,/let\s+pendingMediaIdempotencyKey\s*=\s*null/,'retry do mesmo arquivo deve reutilizar a mesma chave');
assert.match(ui,/pendingMediaIdempotencyKey\s*\|\|=\s*idempotencyKey\(\)/,'chave deve nascer uma vez por seleção');
assert.match(ui,/input\.addEventListener\(['"]change['"][\s\S]{0,220}pendingMediaIdempotencyKey\s*=\s*null/,'trocar arquivo deve iniciar nova operação idempotente');
const clearStart=ui.indexOf('function clearMediaSelection');
const clearEnd=ui.indexOf('\nfunction ',clearStart+10);
assert.ok(clearStart>=0&&clearEnd>clearStart,'clearMediaSelection deve existir como operação isolada');
const clearSource=ui.slice(clearStart,clearEnd);
assert.match(clearSource,/mediaFile|#mediaFile/,'limpeza deve zerar o input de arquivo');
assert.match(clearSource,/pendingMediaIdempotencyKey\s*=\s*null/,'limpeza deve encerrar a operação idempotente');
assert.match(clearSource,/mediaConversationId\s*=\s*null/,'limpeza deve remover o vínculo da conversa');
const sendStart=ui.indexOf('async function sendMedia');
assert.ok(sendStart>=0,'sendMedia deve existir');
const sendEnd=ui.indexOf('\nfunction ',sendStart+10);
const sendSource=ui.slice(sendStart,sendEnd>sendStart?sendEnd:undefined);
assert.match(sendSource,/form\.set\(['"]idempotency_key['"],pendingMediaIdempotencyKey\)/,'retry deve enviar a chave persistida');
assert.match(sendSource,/clearMediaSelection\(\)[\s\S]{0,120}Anexo aceito pela Meta/,'sucesso deve encerrar a operação idempotente pela limpeza centralizada');
assert.doesNotMatch(sendSource,/\}catch\(error\)\{[\s\S]{0,250}pendingMediaIdempotencyKey\s*=\s*null/,'erro não pode trocar a chave do mesmo arquivo');

const configGuard=mediaGateway.indexOf("meta_transport_not_configured");
const enqueue=mediaGateway.indexOf("ops2_admin_attendance_enqueue_media_v1");
assert.ok(configGuard>=0&&enqueue>configGuard,'send_media deve falhar antes do enqueue quando Meta não estiver configurada');

console.log('PASS test-attendance-meta-media-retry-v1');
