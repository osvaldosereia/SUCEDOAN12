import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const cssPath='vitrine/admin/atendimento/attendance-layout-v3.css';
const jsPath='vitrine/admin/atendimento/attendance-layout-v3.js';

assert.ok(fs.existsSync(cssPath),'layout v3 deve ter CSS próprio para não desestabilizar a Central existente');
assert.ok(fs.existsSync(jsPath),'layout v3 deve ter módulo próprio para fila unificada e contexto operacional');
assert.match(html,/attendance-layout-v3\.css/,'HTML deve carregar o CSS do layout v3');
assert.match(html,/attendance-layout-v3\.js/,'HTML deve carregar o módulo do layout v3');

const css=fs.readFileSync(cssPath,'utf8');
const js=fs.readFileSync(jsPath,'utf8');

assert.match(js,/ALL_CHANNEL\s*=\s*['"]all['"]/,'deve existir modo Todas para 0975 + 1018');
assert.match(js,/Promise\.all\(/,'fila Todas deve consultar os dois canais em paralelo');
assert.match(js,/data-unified-channel/,'cards unificados precisam preservar o canal de origem');
assert.match(js,/renderOperationalContext/,'painel direito deve integrar cliente e pedido em uma única visão');
assert.match(js,/Pedido atual/,'painel deve destacar o pedido atual');
assert.match(js,/Abrir vitrine/,'pedido atual deve abrir a mesma vitrine pública do pedido');
assert.match(js,/Copiar link/,'pedido atual deve permitir copiar o link');
assert.match(js,/Interesses e etiquetas/,'painel deve reunir etiquetas/interesses sem trocar de aba');
assert.match(js,/Histórico/,'painel deve mostrar histórico resumido');
assert.match(js,/attendance-focus-layout/,'iframe deve compactar a navegação geral enquanto Atendimento estiver aberto');
assert.match(js,/queueQuickFilters/,'fila deve ter filtros rápidos de uso operacional');
assert.match(js,/orderComposerTool/,'composer deve expor pedido como ação rápida');

assert.match(css,/grid-template-columns:\s*minmax\(270px,320px\)\s+minmax\(520px,1fr\)\s+minmax\(300px,340px\)/,'desktop deve priorizar conversa entre fila e contexto');
assert.match(css,/\.composer-media\s+input\[type=['"]file['"]\]\s*\{[^}]*display:none/s,'input de arquivo nativo deve ficar oculto');
assert.match(css,/\.messages\s*\{[^}]*background/s,'timeline deve ter fundo visual próprio');
assert.match(css,/\.queue-card\.selected/,'conversa selecionada deve ficar evidente');
assert.match(css,/@media\s*\(max-width:\s*1179px\)/,'painel direito deve virar gaveta em telas menores');

console.log('OK · contrato visual/operacional da Central de Atendimento v3.');
