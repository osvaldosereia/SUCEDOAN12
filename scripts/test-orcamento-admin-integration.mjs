import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../vitrine/admin/index.html', import.meta.url),'utf8');
const runtime=readFileSync(new URL('../vitrine/admin/admin-runtime.js', import.meta.url),'utf8');

assert.doesNotThrow(()=>new Function(runtime),'JavaScript de navegação do Admin deve compilar');
assert.match(html,/data-tab="quotes"/,'aba Orçamentos deve existir no Vitrine/Admin');
assert.match(html,/>\s*<span>Orçamentos<\/span>/,'aba deve identificar Orçamentos');
assert.match(runtime,/if\(tab==='quotes'\)renderQuotes\(\)/,'roteamento da aba Orçamentos ausente');
assert.match(runtime,/src="\/orcamento\/\?embedded=1"/,'Admin deve incorporar o editor recuperado');
assert.match(runtime,/await adminStepUp\(\)/,'Orçamentos deve exigir sessão administrativa antes de abrir');
assert.match(html,/quote-admin-frame/,'iframe de Orçamentos deve ter layout dedicado');

console.log('OK · Vitrine/Admin incorpora Orçamentos com sessão administrativa.');
