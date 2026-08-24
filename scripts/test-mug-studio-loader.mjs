import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];

function read(relative) {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) {
    failures.push(`Arquivo ausente: ${relative}`);
    return '';
  }
  return readFileSync(file, 'utf8');
}

function requireText(source, marker, message) {
  if (!source.includes(marker)) failures.push(message);
}

function forbidText(source, marker, message) {
  if (source.includes(marker)) failures.push(message);
}

const productionEntry = read('producao/index.html');
const adminEntry = read('admin/index.html');
for (const [name, source] of [['producao/index.html', productionEntry], ['admin/index.html', adminEntry]]) {
  requireText(source, 'var build = String(Date.now());', `${name} não gera uma build nova a cada abertura.`);
  requireText(source, "destination.searchParams.set('admin_build', build)", `${name} não envia a build dinâmica ao Admin produtivo.`);
  requireText(source, "destination.searchParams.set('save_build', build)", `${name} não sincroniza save_build com admin_build.`);
  forbidText(source, "destination.searchParams.set('admin_build', '2026", `${name} voltou a fixar manualmente uma build.`);
}

const productive = read('producao-v2/admin-produtivo.html');
requireText(productive, "params.get('admin_build')", 'admin-produtivo.html não recebe a build da URL.');
requireText(productive, 'normalizeProductiveBuild', 'admin-produtivo.html não normaliza os assets para a build recebida.');
requireText(productive, 'meta name="admin-save-build"', 'admin-produtivo.html não publica a build ativa no meta do documento final.');

const navigation = read('producao-v2/js/navigation-v12.js');
requireText(navigation, 'meta[name="admin-save-build"]', 'navigation-v12.js não herda a build ativa do Produção.');
requireText(navigation, 'function withBuild(path)', 'navigation-v12.js não centraliza cache-busting.');
requireText(navigation, "import(withBuild('./mug-products-enhancement.js'))", 'Produtos de caneca não recebem a build ativa.');
requireText(navigation, "import(withBuild('./mug-make-native-openai-bridge.js'))", 'Bridge do Criador não recebe a build ativa.');
forbidText(navigation, 'mug-make-native-openai-bridge.js?admin_build=', 'navigation-v12.js ainda possui uma versão fixa do bridge.');
requireText(navigation, 'function scheduleMugPhrasesAddon()', 'Biblioteca de frases não possui carregamento secundário isolado.');
requireText(navigation, "import(withBuild('./mug-phrase-picker-v2.js'))", 'Seletor leve de frases não é carregado como complemento.');
requireText(navigation, 'requestIdleCallback', 'Complemento de frases não espera o navegador ficar ocioso.');
const routeReadyIndex = navigation.indexOf("window.dispatchEvent(new CustomEvent('admin-v2-route-ready'");
const phraseScheduleIndex = navigation.lastIndexOf('scheduleMugPhrasesAddon();');
if (routeReadyIndex < 0 || phraseScheduleIndex <= routeReadyIndex) {
  failures.push('Complemento de frases está sendo acionado antes do núcleo do Criador ficar pronto.');
}

const bridge = read('producao-v2/js/mug-make-native-openai-bridge.js');
requireText(bridge, 'meta[name="admin-save-build"]', 'Bridge das canecas não herda a build ativa.');
requireText(bridge, 'const MODULES = [', 'Bridge das canecas não possui uma lista única de módulos.');
requireText(bridge, "'./mug-command-layout-v4-force.js'", 'Layout 20/80 não está na cadeia do bridge.');
requireText(bridge, "'./mug-config-compact-v4-1.js'", 'Configuração do Make não está na cadeia do bridge.');
requireText(bridge, 'for (const path of MODULES) await import(withBuild(path));', 'Bridge não carrega os módulos sequencialmente com a mesma build.');
forbidText(bridge, "import './mug-", 'Bridge voltou a usar imports estáticos versionados separadamente.');
forbidText(bridge, 'mug-phrase-picker', 'Seletor de frases voltou para a cadeia crítica do Criador.');
forbidText(bridge, 'frases-canecas', 'JSON de frases voltou para a cadeia crítica do Criador.');

const layout = read('producao-v2/js/mug-command-layout-v4-force.js');
requireText(layout, "grid-template-columns:minmax(190px,1fr) minmax(0,4fr)", 'Layout desktop não mantém aproximadamente 20%/80%.');
requireText(layout, 'repeat(3,minmax(0,1fr))', 'Lista de comandos não está em 3 colunas no desktop.');
requireText(layout, '.mugv7-info{display:none!important}', 'Bloco “O que a automação fará” não está garantidamente removido.');

const config = read('producao-v2/js/mug-config-compact-v4-1.js');
requireText(config, '<summary>Configuração</summary>', 'Botão Configuração não está disponível no Criador.');
requireText(config, 'id="mugv7Webhook"', 'Campo Webhook Make não está disponível no Criador.');
requireText(config, 'localStorage.setItem(WEBHOOK_KEY', 'Webhook Make não é persistido localmente.');

const compact = read('producao-v2/js/mug-command-library-compact-v2.js');
requireText(compact, 'iniciar_ativo', 'Comandos não preservam a opção de iniciar ativado.');
requireText(compact, "button.textContent = defaults.has(id) ? '★' : '☆'", 'Controle ★/☆ dos comandos padrão não está disponível.');

const phrasePicker = read('producao-v2/js/mug-phrase-picker-v2.js');
requireText(phrasePicker, 'const PAGE_SIZE = 20;', 'Seletor de frases não limita a quantidade renderizada por página.');
requireText(phrasePicker, "new URL('../data/canecas/frases-canecas-v1.json', import.meta.url)", 'Seletor não usa o JSON estático versionado.');
requireText(phrasePicker, "cache: 'force-cache'", 'JSON de frases não aproveita cache do navegador.');
requireText(phrasePicker, "openButton.addEventListener('click', () => openLibrary(panel))", 'JSON de frases não está protegido por ação explícita do usuário.');
requireText(phrasePicker, 'dialog.showModal()', 'Biblioteca de frases não está isolada em janela própria.');
requireText(phrasePicker, 'filtered.slice(start, start + PAGE_SIZE)', 'Resultados de frases não estão paginados no DOM.');
forbidText(phrasePicker, 'Date.now()', 'Seletor de frases invalida o cache do JSON a cada abertura.');
forbidText(phrasePicker, 'picker.open = true', 'Biblioteca de frases voltou a abrir automaticamente.');

for (const legacy of [
  'producao-v2/js/mug-preset-phrases-v1.js',
  'producao-v2/js/mug-motivational-phrases-v1.js',
]) {
  if (existsSync(path.join(ROOT, legacy))) failures.push(`Módulo legado pesado voltou ao projeto: ${legacy}`);
}

const phraseJsonText = read('producao-v2/data/canecas/frases-canecas-v1.json');
if (Buffer.byteLength(phraseJsonText, 'utf8') > 30000) {
  failures.push('JSON de frases ultrapassou 30 KB e deixou de ser leve.');
}
let phraseData = null;
try {
  phraseData = JSON.parse(phraseJsonText);
} catch (error) {
  failures.push(`JSON de frases inválido: ${error.message}`);
}

if (phraseData) {
  if (phraseData.total !== 400) failures.push('JSON de frases não declara total 400.');
  if (!Array.isArray(phraseData.listas) || phraseData.listas.length !== 2) {
    failures.push('JSON de frases precisa conter exatamente duas listas.');
  } else {
    const expected = new Map([['religiosas', 200], ['motivacionais', 200]]);
    for (const [id, total] of expected) {
      const list = phraseData.listas.find(item => item?.id === id);
      if (!list) {
        failures.push(`Lista ausente no JSON: ${id}.`);
        continue;
      }
      if (!Array.isArray(list.frases) || list.frases.length !== total) {
        failures.push(`Lista ${id} não possui exatamente ${total} frases.`);
      }
      if (!Array.isArray(list.categorias) || !list.categorias.length) {
        failures.push(`Lista ${id} não possui categorias.`);
        continue;
      }
      const ranges = [...list.categorias].sort((a, b) => Number(a.inicio) - Number(b.inicio));
      let next = 1;
      for (const category of ranges) {
        const start = Number(category.inicio);
        const end = Number(category.fim);
        if (start !== next || end < start || end > total) {
          failures.push(`Categorias da lista ${id} possuem lacuna, sobreposição ou faixa inválida.`);
          break;
        }
        next = end + 1;
      }
      if (next !== total + 1) failures.push(`Categorias da lista ${id} não cobrem as ${total} frases.`);
    }
  }
}

if (failures.length) {
  console.error(`Criador de Canecas: ${failures.length} falha(s) na cadeia de publicação.`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Criador de Canecas validado: núcleo estável + 400 frases em JSON lazy-load, 20 resultados por página e cache preservado.');
}
