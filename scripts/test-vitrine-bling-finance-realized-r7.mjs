import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/tipoFiltroData:"R"/);
assert.match(hub,/dataPagamentoInicial:past30/);
assert.match(hub,/dataPagamentoFinal:today/);
assert.match(hub,/situacao:"2"/);
assert.match(hub,/realized_30d:\{/);
assert.match(hub,/received_cents:realizedReceivedCents/);
assert.match(hub,/paid_cents:realizedPaidCents/);
assert.match(hub,/net_cents:realizedReceivedCents-realizedPaidCents/);
assert.match(hub,/received_30d_count/);
assert.match(hub,/paid_30d_count/);
assert.match(hub,/external_write:false/);

assert.match(html,/Recebido · 30 dias/);
assert.match(html,/Pago · 30 dias/);
assert.match(html,/Líquido realizado · 30 dias/);
assert.match(html,/realized\.received_cents/);
assert.match(html,/realized\.paid_cents/);
assert.match(html,/realized\.net_cents/);
assert.match(html,/Histórico de 30 dias parcial/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length);
for(const source of scripts)new Function(source);

console.log('OK · Bling Finance R7 mostra realizado de 30 dias somente leitura e protegido');
