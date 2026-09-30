import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/functions/admin-service-intelligence-v1/index.ts';
const src=fs.readFileSync(path,'utf8');
const start=src.indexOf('async function vitrineListCustomers');
assert.ok(start>=0,'vitrineListCustomers ausente');
const next=src.indexOf('\nasync function ',start+20);
const block=src.slice(start,next>start?next:src.length);

assert.match(block,/\.limit\(q\?650:limit\);/,'abertura de Clientes deve limitar a consulta ao limite solicitado');
assert.doesNotMatch(block,/\.limit\(650\);/,'abertura de Clientes nao deve carregar 650 registros sem pesquisa');
assert.match(block,/if\(q\)/,'busca de clientes deve continuar preservada');
assert.match(block,/items=items\.slice\(0,limit\)/,'resposta deve continuar respeitando o limite da tela');

console.log('OK · Clientes usa carga inicial limitada e preserva busca ampla.');
