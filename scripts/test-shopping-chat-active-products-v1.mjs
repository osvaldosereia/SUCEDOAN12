import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const chat = read('supabase/functions/shopping-chat-v1/index.ts');
const products = read('supabase/functions/shopping-chat-products-v1/index.ts');
const migrationPath = 'supabase/migrations/20260916095000_web_shopping_room_active_product_eligibility_v2.sql';

// Regra comercial do Comprar: produto explicitamente ativo, com estoque e preço, deve
// poder ser encontrado e adicionado. `physically_verified` continua informativo para
// estoque/conferência, mas não pode esconder um produto que o admin deixou ativo.
assert.doesNotMatch(
  chat,
  /\.eq\(['"]physically_verified['"],\s*true\)/,
  'shopping-chat-v1 ainda esconde produtos ativos sem physically_verified',
);

assert.doesNotMatch(
  products,
  /\.eq\(['"]physically_verified['"],\s*true\)/,
  'shopping-chat-products-v1 ainda esconde produtos ativos sem physically_verified',
);

assert.ok(
  fs.existsSync(new URL(`../${migrationPath}`, import.meta.url)),
  'falta migration que alinha a escrita do carrinho à mesma regra de produto ativo',
);

const migration = read(migrationPath);
assert.match(migration, /is_active\s*=\s*true/i, 'migration precisa exigir produto ativo');
assert.match(migration, /coalesce\(stock,\s*0\)/i, 'migration precisa respeitar estoque atual');
assert.match(migration, /coalesce\(price,\s*0\)\s*>\s*0/i, 'migration precisa exigir preço válido');
assert.doesNotMatch(
  migration,
  /physically_verified\s*=\s*true/i,
  'migration não pode recolocar physically_verified como bloqueio comercial do Comprar',
);

console.log('shopping chat active products contract: ok');
