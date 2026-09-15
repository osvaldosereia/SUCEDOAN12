import fs from 'node:fs';
import assert from 'node:assert/strict';

const help=fs.readFileSync('comprar/help.js','utf8');
const quickCss=fs.existsSync('comprar/help-quick.css')?fs.readFileSync('comprar/help-quick.css','utf8'):'';
const atendimento=fs.readFileSync('admin/atendimento.html','utf8');
const canonicalUi=fs.existsSync('admin/admin-canonical-ui.js')?fs.readFileSync('admin/admin-canonical-ui.js','utf8'):'';

assert.match(help,/menuApi/,'Ajuda deve ler a configuração pública do menu');
assert.match(help,/response_text/,'chips devem responder diretamente pelo texto configurado');
assert.match(help,/Outras dúvidas/,'deve permitir reabrir as perguntas rápidas');
assert.match(help,/baskets[^\n]*offers[^\n]*products|products[^\n]*offers[^\n]*baskets/,'deve reconhecer ações comerciais para não mostrá-las como dúvidas');
assert.match(help,/help-quick-questions/,'Ajuda deve renderizar os chips dentro da conversa');
assert.doesNotMatch(help,/response_text[\s\S]{0,300}send_text/,'clique em pergunta rápida não deve usar IA/send_text');
assert.match(quickCss,/\.help-quick-questions\s*\{/,'deve estilizar as perguntas dentro do timeline');
assert.match(atendimento,/Perguntas rápidas/,'Atendimento deve explicar as perguntas rápidas');
assert.match(canonicalUi,/Perguntas rápidas do cliente/,'Admin deve nomear o recurso como perguntas rápidas do cliente');
assert.match(canonicalUi,/data-kind=['"]?(?:baskets|offers|products)/,'Admin canônico deve tratar ações de compra fora das dúvidas');

console.log('OK: perguntas rápidas da Ajuda');
