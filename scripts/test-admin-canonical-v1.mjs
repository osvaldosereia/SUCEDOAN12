import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync('admin/index.html','utf8');
for(const required of [
  'admin/atendimento.html',
  'admin/imagens-ia.html',
  'admin/nomes-produtos-v3.html',
  'admin/service-strategy.js',
  'admin/chat-real-test.js'
]){
  assert.equal(fs.existsSync(required),true,`${required} deve existir no Admin canônico`);
}

assert.doesNotMatch(index,/\/admin-v3\//,'Admin oficial não deve carregar caminhos admin-v3');
assert.match(index,/href="\.\/atendimento\.html"/,'Atendimento deve apontar para /admin');
assert.match(index,/href="\.\/imagens-ia\.html"/,'Imagens IA deve apontar para /admin');
assert.match(index,/href="\.\/nomes-produtos-v3\.html"/,'Nomes deve apontar para /admin');

for(const [legacy,target] of [
  ['admin-v3/index.html','/admin/'],
  ['admin-v3/atendimento.html','/admin/atendimento.html'],
  ['admin-v3/imagens-ia.html','/admin/imagens-ia.html'],
  ['admin-v3/nomes-produtos-v3.html','/admin/nomes-produtos-v3.html']
]){
  const html=fs.readFileSync(legacy,'utf8');
  assert.match(html,new RegExp(target.replaceAll('/','\\/')),`${legacy} deve redirecionar para ${target}`);
}

console.log('OK: Admin canônico em /admin');
