import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../vitrine/admin/index.html', import.meta.url),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';

assert.ok(inline,'script principal do Admin não encontrado');
assert.doesNotThrow(()=>new Function(inline),'JavaScript do Admin deve compilar');
assert.match(html,/data-tab="quotes"[^>]*>Orçamentos</,'aba Orçamentos deve existir no Vitrine/Admin');
assert.match(html,/if\(tab==='quotes'\)renderQuotes\(\)/,'roteamento da aba Orçamentos ausente');
assert.match(html,/src="\/orcamento\/\?embedded=1"/,'Admin deve incorporar o editor recuperado');
assert.match(html,/await adminStepUp\(\)/,'Orçamentos deve exigir sessão administrativa antes de abrir');
assert.match(html,/quote-admin-frame/,'iframe de Orçamentos deve ter layout dedicado');

console.log('OK · Vitrine/Admin incorpora Orçamentos com sessão administrativa.');
