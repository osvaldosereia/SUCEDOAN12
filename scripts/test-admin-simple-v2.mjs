import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('admin/index.html','utf8');
const app=fs.readFileSync('admin/app-lite.js','utf8');

for (const route of ['products','baskets','customers']) {
  assert.match(html,new RegExp(`data-route="${route}"`));
}

for (const forbidden of [
  'data-route="counts"',
  'data-route="queue"',
  'WhatsApp ativos',
  'Somente WhatsApp',
  'Inteligência do Atendimento',
  'whatsapp-flow-key'
]) {
  assert.doesNotMatch(html,new RegExp(forbidden,'i'));
}

assert.doesNotMatch(app,/toggleWhatsapp|loadCounts|loadQueue|retryCommand/i);
console.log('admin-simple-v2 ok');
