import fs from 'node:fs';
import assert from 'node:assert/strict';

const requiredContracts = [
  'admin-design-system-v2-contract.test.mjs',
  'admin-general-navigation-contract.test.mjs',
  'admin-r3-context-nav-contract.test.mjs',
  'admin-r10-customer-v2-contract.test.mjs',
  'admin-r11-operations-v2-contract.test.mjs',
  'admin-r12-creative-v2-contract.test.mjs',
  'admin-r13-marketing-v2-contract.test.mjs',
  'admin-r14-operations-v2-contract.test.mjs',
  'admin-r15-systems-v2-contract.test.mjs'
];
for (const name of requiredContracts) {
  assert.ok(fs.existsSync(`tests/${name}`), `missing Admin Geral contract: ${name}`);
}

const config = fs.readFileSync('admin/config.js', 'utf8');
for (const gate of [
  'humanServiceCenterUiEnabled',
  'humanCopilotEnabled',
  'financialAdminUiEnabled',
  'experienceOrchestratorUiEnabled',
  'automationBuilderUiEnabled',
  'logisticsUiEnabled',
  'commercialTruthUiEnabled'
]) {
  assert.match(config, new RegExp(`${gate}:\\s*false`), `${gate} must remain fail-closed`);
}

const roadmap = fs.readFileSync('docs/projects/admin-geral/ROADMAP-MASTER.md', 'utf8');
assert.match(roadmap, /Mobile e desktop de primeira classe/);
assert.match(roadmap, /Make não deve virar runtime novo/);
assert.match(roadmap, /Não fabricar evidência, credencial, consentimento, canary ou resultado externo/);
assert.match(roadmap, /Preservar os gates já existentes de Meta Direct, publishing, outbound, canary, custos de IA e integrações reais/);

const handoff = fs.readFileSync('docs/projects/admin-geral/HANDOFF.md', 'utf8');
assert.match(handoff, /App Dona Antônia: fora do escopo/);
assert.match(handoff, /Não abrir efeitos externos para testar/);

console.log('admin R16 final safety contract: ok');
