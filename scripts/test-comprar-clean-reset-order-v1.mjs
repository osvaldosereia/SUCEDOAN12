import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const upsell=readFileSync('comprar/upsell.js','utf8');
const resetFunction='supabase/functions/shopping-room-reset-v1/index.ts';
const migration='supabase/migrations/20260915184500_room_reset_open_cart_v1.sql';

assert.match(upsell,/Limpar pedido/,'resumo do pedido deve oferecer ação Limpar pedido');
assert.match(upsell,/Quer limpar este pedido e começar novamente\?/,'limpeza deve exigir confirmação explícita');
assert.match(upsell,/shopping-room-reset-v1/,'front deve usar endpoint isolado de reset');
assert.match(upsell,/post\(resetApi,['"]reset_cart['"]\)/,'front deve limpar o carrinho no backend');
assert.match(upsell,/waitForPendingProductSyncs\(\)/,'reset deve aguardar sincronizações de quantidade pendentes');
assert.match(upsell,/state\.selectedBasket\s*=\s*null/,'front deve esquecer cesta escolhida');
assert.match(upsell,/state\.basketItems\s*=\s*\[\]/,'front deve limpar composição em memória');
assert.match(upsell,/state\.checkout\s*=\s*null/,'front deve limpar checkout temporário');
assert.match(upsell,/state\.payment\s*=\s*null/,'front deve limpar pagamento temporário');
assert.match(upsell,/renderStart\(\)/,'após limpar deve voltar ao início do atendimento');
assert.match(upsell,/location\.reload\(\)/,'produção deve recarregar a mesma sala para zerar estados internos dos módulos');

assert.ok(existsSync(resetFunction),'edge function isolada de reset deve existir');
const roomReset=readFileSync(resetFunction,'utf8');
assert.match(roomReset,/action\s*!==\s*['"]reset_cart['"]/,'API de reset deve aceitar apenas reset_cart');
assert.match(roomReset,/room_reset_open_cart_v1/,'reset_cart deve usar RPC transacional');
assert.ok(existsSync(migration),'migration transacional de reset deve existir');
const sql=readFileSync(migration,'utf8');
assert.match(sql,/create or replace function public\.room_reset_open_cart_v1/i,'migration deve criar RPC de reset');
assert.match(sql,/status\s*=\s*['"]draft['"]/i,'RPC só deve aceitar carrinho editável');
assert.match(sql,/delete from public\.cart_items/i,'RPC deve remover itens do carrinho');
assert.match(sql,/basket_id\s*=\s*null/i,'RPC deve remover cesta selecionada');
assert.match(sql,/current_view\s*=\s*['"]start['"]/i,'sessão deve voltar ao início');
assert.doesNotMatch(sql,/customer_id\s*=\s*null/i,'reset não deve apagar cliente já identificado');

console.log('OK: contrato de limpar pedido');
