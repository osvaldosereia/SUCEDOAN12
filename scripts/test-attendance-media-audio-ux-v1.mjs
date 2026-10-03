import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync('vitrine/admin/atendimento/attendance-media-send.js','utf8');
const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');

assert.match(html,/id="mediaFile"[^>]*accept="[^"]*audio\/ogg/,'composer deve aceitar áudio OGG');
assert.match(html,/id="mediaFileName"/,'composer deve expor nome do anexo fora do input nativo');
assert.match(html,/id="clearMediaBtn"/,'composer deve permitir remover anexo explicitamente');
assert.match(html,/id="mediaProgress"[^>]*role="status"/,'composer deve ter estado acessível de progresso');
assert.match(js,/mediaKind\(/,'UI deve classificar anexo por imagem, áudio ou PDF');
assert.match(js,/Áudio pronto para enviar/,'áudio deve ter feedback explícito antes do envio');
assert.match(js,/Enviando áudio via Meta/,'áudio deve ter feedback explícito durante envio');
assert.match(js,/Áudio aceito pela Meta/,'áudio deve ter feedback explícito após aceite');
assert.match(js,/clearMediaBtn/,'remoção explícita deve ser ligada no JS');
assert.match(js,/aria-busy/,'envio deve expor estado busy acessível');
assert.match(js,/focus\(\)/,'erro de validação deve devolver foco ao seletor de arquivo');
assert.match(js,/pendingMediaIdempotencyKey/,'retry deve preservar chave de idempotência');
assert.doesNotMatch(js,/graph\.facebook\.com/,'browser nunca deve chamar Graph API diretamente');
console.log('PASS test-attendance-media-audio-ux-v1');
