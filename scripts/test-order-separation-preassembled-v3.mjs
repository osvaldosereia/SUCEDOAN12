import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='supabase/migrations/20261004225000_order_separation_preassembled_components_v3.sql';
assert.equal(fs.existsSync(path),true,'migration da separação de cestas pré-montadas deve existir');
const sql=fs.readFileSync(path,'utf8');

assert.match(sql,/create or replace function public\.ops2_init_order_separation_v2/i,'migration deve corrigir a inicialização da separação');
assert.match(sql,/oi\.quantity,\s*oi\.unit_price,\s*oi\.line_total/s,'separação deve carregar quantidade e valor comercial completos do item');
assert.doesNotMatch(sql,/as separation_quantity/i,'quantidade pré-montada não pode ser removida da tela de conferência');
assert.match(sql,/create or replace function public\.ops2_apply_order_separation_stock_v2/i,'migration deve proteger a baixa de estoque');
assert.match(sql,/s\.quantity\s*-\s*coalesce\(nullif\(oi\.metadata->>'preassembled_units'/s,'baixa avulsa deve excluir unidades já pertencentes ao lote pré-montado');
assert.match(sql,/separation_v2_missing_components/,'faltas de componentes pré-montados devem continuar registradas no lote');

console.log('preassembled basket separation v3 contract: ok');
