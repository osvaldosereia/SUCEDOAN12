import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
assert.ok(html.includes('/vitrine/admin/core/errors.js'));
const ctx={window:{}};
vm.runInNewContext(fs.readFileSync('vitrine/admin/core/errors.js','utf8'),ctx);
const {errorMessage}=ctx.window.DonaAntoniaAdminErrors;
for(const code of ['bling_reauthentication_required','oauth_http_400','oauth_http_401','oauth_http_403']){
  assert.match(errorMessage(code),/Reconectar Bling/);
  assert.match(errorMessage(code),/Estoque NÃO foi salvo/);
}
assert.match(errorMessage('insufficient_stock'),/Estoque disponível insuficiente/);
assert.match(errorMessage('order_cancelled'),/Pedido cancelado/);
assert.match(errorMessage('fiscal_generation_already_attempted'),/não repetirá automaticamente/);
assert.match(errorMessage('invoice_generation_uncertain'),/não fará nova tentativa automática/);
assert.match(errorMessage('fiscal_document_not_authorized'),/autorização da NF-e/);
assert.match(errorMessage('stale_order_version'),/Atualizei/);
assert.equal(errorMessage('unrecognized_error'),'Não consegui salvar agora.');
assert.equal(errorMessage(null),'Não consegui salvar agora.');
assert.match(errorMessage('fiscal_operation_in_progress'),/Outra emissão fiscal/);
assert.match(errorMessage('fiscal_generation_gate_closed'),/bloqueada/);
assert.match(errorMessage('fiscal_human_confirmation_required'),/Confirme explicitamente/);
assert.match(errorMessage('separation_incomplete'),/produtos pendentes/);
assert.match(errorMessage('stock_reservation_released'),/reserva/);
assert.match(errorMessage('bling_finance_scope_missing'),/Bling/);
console.log('Admin core error messages: PASS');
