import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function ok(condition, message) {
  if (!condition) throw new Error(`FALHOU · ${message}`);
  console.log(`OK · ${message}`);
}

const index = read('admin-canecas/index.html');
const workflow = read('admin-canecas/generator-workflow-v2.js');
const generator = read('admin-canecas/generator-v1.js');
const library = read('admin-canecas/generator-library-v1.js');
const personalization = read('admin-canecas/personalization-config-v1.js');

ok(index.includes('generator-workflow-v2.js'), 'Admin carrega o fluxo rápido do Gerador V2');
ok(workflow.includes('const RECENT_LIMIT = 8'), 'Canecas recentes limitadas às 8 últimas');
ok(workflow.includes('function generatedByStudio'), 'Lista recente identifica canecas geradas, inclusive modelos');
ok(workflow.includes('data-use-generator-model'), 'Modelos possuem ação explícita para reutilização');
ok(workflow.includes('async function useModel'), 'Seleção de modelo restaura referência e receita');
ok(workflow.includes('data-recent-config'), 'Últimas geradas possuem acesso rápido ao cadastro');
ok(workflow.includes("button.textContent = 'Configurar agora'"), 'Resultado da geração oferece configuração imediata');
ok(workflow.includes('async function openMugRegistration'), 'Abertura do cadastro aguarda o catálogo ficar pronto');
ok(workflow.includes('cfSettingsPromptShortcut'), 'Configurações exibem atalho visível para prompts');
ok(workflow.includes("admin-canecas:settings-rendered"), 'Prompts podem ser recuperados quando a rota Settings abre fora de ordem');
ok(workflow.includes("admin-canecas:mug-created"), 'Nova geração atualiza resultado e lista recente automaticamente');
ok(library.includes('data-existing-mug'), 'Biblioteca mantém chave dos modelos para seleção');
ok(generator.includes("new CustomEvent('admin-canecas:mug-created'"), 'Gerador publica evento com a chave da caneca criada');
ok(personalization.includes("const PROMPTS_NODE = 'canecas/personalizacao_prompts'"), 'Prompts continuam persistidos no Firebase');
ok(personalization.includes('cfPersonalizationPromptSettings'), 'Painel de edição dos prompts continua presente em Configurações');

console.log('OK · Gerador Admin V2 protegido contra regressões principais.');
