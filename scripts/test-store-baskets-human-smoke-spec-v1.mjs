import fs from 'node:fs';
import assert from 'node:assert/strict';
const plan=fs.readFileSync('docs/superpowers/plans/2026-10-05-store-baskets-go-live.md','utf8');
for(const phrase of ['reserva 10 cestas reais','marca montado','visualiza no site','saldo 10→9']) assert.match(plan,new RegExp(phrase),'human go-live must pin '+phrase);
console.log('store baskets human smoke spec v1: PASS');
