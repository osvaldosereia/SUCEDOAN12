import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20261006143000_basket_mold_option_consistency_v1.sql';
assert.ok(fs.existsSync(migrationPath),'migration de consistência das variações deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

assert.match(sql,/cestas-so-alimentos/i,'migration deve proteger moldes Só Alimento');
assert.match(sql,/Higiene Pessoal/i,'migration deve rejeitar higiene em Só Alimento');
assert.match(sql,/Lavanderia/i,'migration deve rejeitar lavanderia em Só Alimento');
assert.match(sql,/basket_mold_food_only_product_invalid/i,'save deve ter erro explícito para produto não alimentar');
assert.match(sql,/basket_mold_option_taxonomy_mismatch/i,'save deve impedir variação de taxonomia incompatível');

assert.match(sql,/Macarrão Lámen/i,'migration deve limpar posição de Lámen');
assert.match(sql,/Caldo de Galinha/i,'migration deve remover Caldo da posição de Lámen');
assert.match(sql,/Rosquinha de Coco Rancheiro 500 g/i,'migration deve normalizar Rosquinha 500 g');
assert.match(sql,/39f3bbf3-56f2-41bb-9500-7eee98b06daa/i,'migration deve garantir a Rosquinha Rancheiro canônica');

assert.match(sql,/delete\s+from\s+public\.basket_mold_positions/i,'migration deve remover posições indevidas, não estoque');
assert.doesNotMatch(sql,/update\s+public\.products\s+set\s+stock/i,'migration não pode alterar estoque de produto');
assert.doesNotMatch(sql,/update\s+public\.basket_stock_lots/i,'migration não pode alterar lotes físicos');
assert.doesNotMatch(sql,/delete\s+from\s+public\.basket_stock_lots/i,'migration não pode apagar lotes físicos');

console.log('basket mold option consistency contract: ok');
