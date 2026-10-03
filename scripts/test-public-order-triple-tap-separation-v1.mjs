import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('pedido/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/order-public-view-v1/index.ts','utf8');

assert.ok(page.includes('SEPARATION_TAPS=3'),'a separação deve exigir exatamente 3 toques');
assert.ok(page.includes('SEPARATION_TAP_WINDOW_MS'),'os 3 toques precisam ocorrer em uma janela curta');
assert.ok(page.includes('data-separation-index'),'cada linha de produto deve ser marcada individualmente');
assert.ok(page.includes('product-card separated'),'o produto separado precisa ter estado visual próprio');
assert.ok(page.includes('.product-placeholder'),'a área de foto vazia também precisa aceitar a conferência');
assert.ok(page.includes('activeTapIndex'),'toques em outro produto devem reiniciar a sequência anterior');
assert.ok(page.includes("action:'complete_separation'"),'a vitrine precisa concluir a separação pelo endpoint público');
assert.ok(page.includes('checked_indexes'),'a conclusão deve enviar exatamente os itens conferidos');
assert.ok(page.includes('Concluir separação'),'o botão só deve existir para concluir a separação completa');
assert.ok(!/login|senha|pin de seguran|c[oó]digo de acesso/i.test(page),'a vitrine de separação não pode criar login, senha ou PIN');

assert.ok(edge.includes('req.method==="POST"'),'o endpoint precisa aceitar a conclusão da separação');
assert.ok(edge.includes('complete_separation'),'a única mutação pública prevista deve ser a conclusão da separação');
assert.ok(edge.includes('validToken(token)'),'qualquer mutação deve exigir o token público do pedido');
assert.ok(edge.includes('checked_indexes'),'o servidor precisa validar todos os itens conferidos');
assert.ok(edge.includes('separation_fingerprint'),'o servidor precisa impedir checklist de uma versão diferente do pedido');
assert.ok(edge.includes('consume_vitrine_order_stock_v1'),'ao concluir, deve consumir somente a reserva operacional existente');
assert.ok(edge.includes('ops_start_order_check_v1'),'a conferência por 3 toques deve abrir/reusar a conferência canônica');
assert.ok(edge.includes('ops_order_check_items'),'a conferência deve preencher os itens da sessão canônica');
assert.ok(edge.includes('ops_finish_order_check_v1'),'a conferência canônica precisa ser finalizada antes de pronto');
assert.ok(edge.includes('status:"ready"')||edge.includes("status:'ready'"),'concluir separação deve levar o pedido apenas para PRONTO');
assert.ok(!edge.includes('ops2_launch_physical_stock'),'a vitrine pública nunca pode executar a baixa física definitiva');
assert.ok(!edge.includes('status:"out_for_delivery"')&&!edge.includes("status:'out_for_delivery'"),'a vitrine pública não pode pular PRONTO e mandar para ENTREGA');

console.log('OK · vitrine pública: 3 toques consecutivos por produto, sem login, conclusão segura em PRONTO.');
