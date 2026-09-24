import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/data-quick-confirm/);
assert.match(html,/if\(problems\.length&&shortcut\)/);
assert.match(html,/if\(o\.status==='created'\)/);
assert.match(html,/async function quickConfirmOrder\(id,btn\)/);
assert.match(html,/if\(problems\.length\)\{toast\('Corrija os dados do pedido antes de confirmar'\)/);
assert.match(html,/status:'confirmed'/);
assert.match(html,/Pedido #'\+shortOrder\(o\.order_number\)\+' confirmado/);
assert.match(html,/paintOrderFilters\(\);paintOrderRows\(\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · confirmação rápida de pedido completo');
