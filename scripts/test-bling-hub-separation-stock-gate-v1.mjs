import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const bridge=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const evaluatorStart=bridge.indexOf('function blingHubSeparationEvidenceReady');
assert.ok(evaluatorStart>=0,'Gate precisa ter um avaliador puro para testar cenários de estoque');
const evaluatorEnd=bridge.indexOf('\n}',evaluatorStart)+2;
const evaluatorSource=bridge.slice(evaluatorStart,evaluatorEnd).replace(/:\s*any/g,'');
const evaluate=vm.runInNewContext(`(${evaluatorSource})`);
const applied={metadata:{stock_applied:true}};
const finishedItems=[{state:'separated'},{state:'missing'}];
assert.equal(evaluate('ready',applied,finishedItems,[],[{status:'consumed'}]),true,'Cesta consumida com separação concluída precisa liberar o gate');
assert.equal(evaluate('ready',applied,finishedItems,[{status:'consumed'}],[]),true,'Reserva avulsa consumida com separação concluída precisa liberar o gate');
assert.equal(evaluate('ready',applied,[{state:'pending'}],[],[{status:'consumed'}]),false,'Item pendente mantém o gate fechado');
assert.equal(evaluate('ready',applied,finishedItems,[],[]),false,'Sem evidência de reserva/alocação de estoque o gate permanece fechado');
assert.equal(evaluate('processing',applied,finishedItems,[],[{status:'consumed'}]),false,'Pedido ainda não pronto permanece bloqueado');

const start=bridge.indexOf('async function blingHubVerifiedSeparationStockGate');
assert.ok(start>=0,'Bling preview precisa validar no banco a separação e a baixa/reserva de estoque locais');
const end=bridge.indexOf('\nasync function ',start+1);
assert.ok(end>start,'Gate de separação precisa ser uma função independente e verificável');
const gate=bridge.slice(start,end);

for(const table of ['order_separation_completions_v1','order_separation_items_v1','vitrine_stock_reservations','basket_stock_allocations']){
  assert.ok(gate.includes(table),`Gate precisa consultar ${table}`);
}
assert.match(evaluatorSource,/stock_applied/,'Separação precisa estar aplicada antes de liberar a sincronização');
assert.match(evaluatorSource,/separated[\s\S]*missing|missing[\s\S]*separated/,'Todos os itens precisam ter estado final de separação');
assert.match(evaluatorSource,/consumed[\s\S]*released|released[\s\S]*consumed/,'Reserva ou alocação precisa estar consumida/liberada');
assert.match(gate,/return\s+false/,'Falha ou evidência incompleta precisa bloquear em modo fail-closed');

const previewStart=bridge.indexOf('async function blingHubPreviewOrderSync');
const previewEnd=bridge.indexOf('\nasync function ',previewStart+1);
const preview=bridge.slice(previewStart,previewEnd);
assert.match(preview,/queueReason\s*===\s*["']ean_verified["'][\s\S]{0,260}blingHubVerifiedSeparationStockGate/,'Preview precisa validar a evidência local para pedidos já separados');
assert.match(preview,/verifiedSeparationStockReady/,'Resultado do gate verificado precisa liberar os dois pré-requisitos juntos');
assert.match(preview,/separationStarted\s*=[\s\S]{0,180}verifiedSeparationStockReady/,'Separação concluída precisa resolver first_separation_required');
assert.match(preview,/physicalStockHandled\s*=[\s\S]{0,180}verifiedSeparationStockReady/,'Baixa/reserva comprovada precisa resolver stock_not_consumed');

console.log('bling hub separation stock gate v1: ok');
