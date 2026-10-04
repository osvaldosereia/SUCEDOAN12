import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='vitrine/admin/atendimento/attendance-library.js';
const source=fs.readFileSync(path,'utf8');

assert.match(source,/const\s+MAX_LIBRARY_SELECTION\s*=\s*10\b/,'seleção deve limitar a 10 itens');
assert.match(source,/Janela de atendimento encerrada\. Mídia livre não pode ser enviada\./,'deve usar a mensagem exata de janela encerrada');
assert.match(source,/library_send/,'fila deve usar endpoint library_send');
assert.match(source,/for\s*\([^)]*of[^)]*\)\s*\{[\s\S]*?await\s+api\(['"]library_send['"]/,'envio deve ser sequencial com await por item');
assert.doesNotMatch(source,/Promise\.all\s*\([\s\S]{0,500}library_send/,'não pode disparar library_send em paralelo');
assert.match(source,/batchId|batch_id/,'lote deve ter identificador estável');
assert.match(source,/idempotencyKey|idempotency_key/,'cada item deve usar idempotência explícita');
assert.match(source,/failedItems|failed\s*:\s*new\s+Set|failed\s*=\s*new\s+Set/,'fila deve reter itens que falharam');
assert.match(source,/retryFailed|retry\s*failed/i,'deve existir retry apenas dos itens com falha');
assert.match(source,/SECURITY_STOP_ERRORS/,'deve distinguir erros de segurança que interrompem a fila');
assert.match(source,/service_window_closed/,'janela fechada deve interromper a fila');
assert.match(source,/human_send_not_homologated/,'gate humano deve interromper a fila');
assert.match(source,/meta_canary_destination_blocked/,'canário bloqueado deve interromper a fila');
assert.match(source,/conversationId[\s\S]{0,500}clearSelection|clearSelection[\s\S]{0,500}conversationId/,'troca de conversa deve limpar seleção');
assert.match(source,/Enviando\s*\$?\{?[^\n]*de\s*\$?\{?/,'UI deve mostrar progresso Enviando X de N');
assert.match(source,/enviado[s]?\s*·\s*[^\n]*falhou/,'UI deve resumir enviados e falhas');
assert.match(source,/conversation_id\s*:\s*conversationId/,'request deve enviar apenas o id canônico da conversa');
assert.doesNotMatch(source,/to_phone_e164\s*:|phone_number_id\s*:|whatsapp_account_id\s*:/,'frontend da Biblioteca não pode escolher destino/canal técnico');

console.log('PASS test-admin-attendance-library-queue-v1');
