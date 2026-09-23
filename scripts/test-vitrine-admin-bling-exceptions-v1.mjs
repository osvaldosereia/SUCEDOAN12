import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/id="integrationOperationalAlert"/);
assert.match(html,/function blingOperationalIssues\(b\)/);
assert.match(html,/function loadOperationalIntegrationAlert\(\)/);
assert.match(html,/Credenciais do Bling precisam de atenção/);
assert.match(html,/Integração direta com o Bling está pausada/);
assert.match(html,/Envio de pedidos ao Bling está pausado/);
assert.match(html,/fila precisam de revisão/);
assert.match(html,/pedido\(s\) precisam de revisão no Bling/);
assert.match(html,/Integração precisa de atenção/);
assert.match(html,/Ver diagnóstico/);
assert.match(html,/if\(!issues\.length\)return/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · Bling por exceção no operacional');
