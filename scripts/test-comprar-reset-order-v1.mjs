import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const app=readFileSync('comprar/app.js','utf8');
const room=readFileSync('supabase/functions/shopping-room-v1/index.ts','utf8');
const migration='supabase/migrations/20260915184500_room_reset_open_cart_v1.sql';

assert.match(app,/Limpar pedido/,'resumo do pedido deve oferecer ação Limpar pedido');
assert.match(app,/Quer limpar este pedido e começar novamente\?/,'limpeza deve exigir confirmação explícita');
assert.match(app,/api\(['"]reset_cart['"]\)/,'front deve limpar o carrinho no backend');
assert.match(app,/state\.selectedBasket\s*=\s*null/,'front deve esquecer cesta escolhida');
assert.match(app,/state\.basketItems\s*=\s*\[\]/,'front deve limpar composição em memória');
assert.match(app,/state\.checkout\s*=\s*null/,'front deve limpar checkout temporário');
assert.match(app,/state\.payment\s*=\s*null/,'front deve limpar pagamento temporário');
assert.match(app,/renderStart\(\)/,'após limpar deve voltar ao início do atendimento');

assert.match(room,/action===['"]reset_cart['"]/,'API pública deve expor reset_cart');
assert.match(room,/room_reset_open_cart_v1/,'reset_cart deve usar RPC transacional');
assert.ok(existsSync(migration),'migration transacional de reset deve existir');
const sql=readFileSync(migration,'utf8');
assert.match(sql,/create or replace function public\.room_reset_open_cart_v1/i,'migration deve criar RPC de reset');
assert.match(sql,/status\s*=\s*['"]draft['"]/i,'RPC só deve aceitar carrinho editável');
assert.match(sql,/delete from public\.cart_items/i,'RPC deve remover itens do carrinho');
assert.match(sql,/basket_id\s*=\s*null/i,'RPC deve remover cesta selecionada');
assert.match(sql,/current_view\s*=\s*['"]start['"]/i,'sessão deve voltar ao início');
assert.doesNotMatch(sql,/customer_id\s*=\s*null/i,'reset não deve apagar cliente já identificado');

console.log('OK: contrato de limpar pedido');
