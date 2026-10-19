import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20261019130000_marketing_repurchase_monthly_cadence_v1.sql','utf8');
assert.match(sql,/percentile_cont\(0\.5\)/,'cadência deve usar intervalo mediano das compras');
assert.match(sql,/interval_days between 14 and 60/,'histórico deve ignorar intervalos fora da faixa plausível');
assert.match(sql,/greatest\(21,least\(45,/,'cadência aprendida deve ser limitada entre 21 e 45 dias');
assert.match(sql,/v_interval_days integer := 30/,'uma compra sem histórico deve usar ciclo mensal de 30 dias');
assert.match(sql,/recompradonaantonia30dias/,'a fila deve identificar o template mensal esperado');
assert.match(sql,/marketing_opt_in/,'a recomposição não pode remover o bloqueio de marketing');
assert.match(sql,/if v_order\.id is null then/,'clientes sem pedido devem continuar sem data de recompra');
assert.match(sql,/for v_customer_id in[\s\S]*perform public\.marketing_repurchase_recalc_v1/,'migração deve atualizar a fila existente sem enviar mensagens');
assert.doesNotMatch(sql,/interval '10 days'/,'o prazo legado de 10 dias deve ser removido da lógica de recompra');
console.log('marketing monthly repurchase cadence: ok');
