import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const bridgePath='vitrine/admin/atendimento/attendance-layout-v3-bridge.js';

assert.ok(fs.existsSync(bridgePath),'fila Todas precisa de ponte explícita para o fluxo legado por canal');
assert.match(html,/attendance-layout-v3-bridge\.js/,'HTML deve carregar a ponte depois do layout v3');
const bridge=fs.readFileSync(bridgePath,'utf8');
assert.match(bridge,/baseChannel\s*=\s*['"]0975['"]/,'ponte deve conhecer o canal inicial do fluxo legado');
assert.match(bridge,/sameChannel|forceBaseChannelReload/,'ponte deve tratar clique no mesmo canal já ativo');
assert.match(bridge,/stopImmediatePropagation\(\)/,'ponte deve substituir o clique v3 antigo sem disparar duas aberturas');
assert.match(bridge,/data-unified-channel/,'ponte deve respeitar o canal gravado no card unificado');
assert.match(bridge,/allChannelsBtn/,'após abrir a conversa, a fila Todas deve ser restaurada');
assert.match(bridge,/queue-card:not\(\.queue-card-v3\)/,'ponte deve abrir o card legado para preservar envio, mídia, templates e ANA');
console.log('OK · ponte da fila Todas cobre conversa do mesmo canal ativo.');
