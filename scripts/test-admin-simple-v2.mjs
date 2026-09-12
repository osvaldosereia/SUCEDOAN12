import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('admin/index.html','utf8');
const app=fs.readFileSync('admin/app-lite.js','utf8');
const api=fs.readFileSync('supabase/functions/admin-simple-v2/index.ts','utf8');

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
assert.doesNotMatch(api,/\.or\("physically_verified\.eq\.true,source_system\.eq\./,'lista administrativa não pode esconder produtos por origem/source_system');
assert.match(api,/if\(status===?"inactive"\)query=query\.eq\("is_active",false\)/,'admin precisa continuar permitindo filtrar inativos');
console.log('admin-simple-v2 ok');
