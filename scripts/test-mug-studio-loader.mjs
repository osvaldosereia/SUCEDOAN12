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

const bridge = read('producao-v2/js/mug-make-native-openai-bridge.js');
requireText(bridge, 'meta[name="admin-save-build"]', 'Bridge das canecas não herda a build ativa.');
requireText(bridge, 'const MODULES = [', 'Bridge das canecas não possui uma lista única de módulos.');
requireText(bridge, "'./mug-command-layout-v4-force.js'", 'Layout 20/80 não está na cadeia do bridge.');
requireText(bridge, "'./mug-config-compact-v4-1.js'", 'Configuração do Make não está na cadeia do bridge.');
requireText(bridge, "'./mug-preset-phrases-v1.js'", 'Seletor das 200 frases religiosas não está na cadeia do bridge.');
requireText(bridge, "'./mug-motivational-phrases-v1.js'", 'Seletor das 200 frases motivacionais não está na cadeia do bridge.');
requireText(bridge, 'for (const path of MODULES) await import(withBuild(path));', 'Bridge não carrega os módulos sequencialmente com a mesma build.');
forbidText(bridge, "import './mug-", 'Bridge voltou a usar imports estáticos versionados separadamente.');

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

const phrasesSource = read('producao-v2/js/mug-preset-phrases-v1.js');
requireText(phrasesSource, '200 frases prontas', 'Título do seletor de 200 frases religiosas não está disponível.');
requireText(phrasesSource, 'id="mugPresetPhraseSearch"', 'Busca das frases religiosas não está disponível.');
requireText(phrasesSource, 'id="mugPresetPhraseCategory"', 'Filtro por categoria das frases religiosas não está disponível.');
requireText(phrasesSource, 'id="mugPresetPhraseSelect"', 'Lista selecionável de frases religiosas não está disponível.');
requireText(phrasesSource, "field.value = phrase;", 'A frase religiosa escolhida não preenche Instrução complementar.');
requireText(phrasesSource, '"Deus ainda escreve milagres."', 'Primeira frase religiosa não foi publicada.');
requireText(phrasesSource, '"Com Deus, sempre."', 'Última frase religiosa não foi publicada.');
const phraseMatch = phrasesSource.match(/const PHRASES = Object\.freeze\((\[[\s\S]*?\])\);/);
if (!phraseMatch) {
  failures.push('Não foi possível validar quantitativamente o banco de frases religiosas.');
} else {
  try {
    const phrases = JSON.parse(phraseMatch[1]);
    if (phrases.length !== 200) failures.push(`Banco de frases religiosas possui ${phrases.length} itens; esperado: 200.`);
  } catch (error) {
    failures.push(`Banco de frases religiosas não é um array JSON válido: ${error.message}`);
  }
}

const motivationalSource = read('producao-v2/js/mug-motivational-phrases-v1.js');
requireText(motivationalSource, '200 frases motivacionais', 'Título do seletor de frases motivacionais não está disponível.');
requireText(motivationalSource, 'id="mugMotivationalPhraseSearch"', 'Busca das frases motivacionais não está disponível.');
requireText(motivationalSource, 'id="mugMotivationalPhraseCategory"', 'Filtro por categoria motivacional não está disponível.');
requireText(motivationalSource, 'id="mugMotivationalPhraseSelect"', 'Lista selecionável motivacional não está disponível.');
requireText(motivationalSource, 'Curtas, fortes e minimalistas', 'Categoria motivacional curta não foi publicada.');
requireText(motivationalSource, 'Inteligentes e reflexivas', 'Categoria reflexiva não foi publicada.');
requireText(motivationalSource, 'Foco, trabalho e produtividade', 'Categoria de produtividade não foi publicada.');
requireText(motivationalSource, 'Autoconfiança e autoestima', 'Categoria de autoestima não foi publicada.');
requireText(motivationalSource, 'Recomeço e superação', 'Categoria de recomeço não foi publicada.');
requireText(motivationalSource, 'Leveza, equilíbrio e vida', 'Categoria de leveza não foi publicada.');
requireText(motivationalSource, 'Atitude, ousadia e personalidade', 'Categoria de atitude não foi publicada.');
requireText(motivationalSource, 'Café + motivação', 'Categoria de café motivacional não foi publicada.');
requireText(motivationalSource, '"Vai dar certo. Continue."', 'Primeira frase motivacional não foi publicada.');
requireText(motivationalSource, '"Beba café. Crie possibilidades."', 'Última frase motivacional não foi publicada.');
requireText(motivationalSource, "field.value = phrase;", 'A frase motivacional escolhida não preenche Instrução complementar.');
const motivationalMatch = motivationalSource.match(/const MOTIVATIONAL_PHRASES = Object\.freeze\((\[[\s\S]*?\])\);/);
if (!motivationalMatch) {
  failures.push('Não foi possível validar quantitativamente o banco motivacional.');
} else {
  try {
    const phrases = JSON.parse(motivationalMatch[1]);
    if (phrases.length !== 200) failures.push(`Banco motivacional possui ${phrases.length} itens; esperado: 200.`);
  } catch (error) {
    failures.push(`Banco motivacional não é um array JSON válido: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`Criador de Canecas: ${failures.length} falha(s) na cadeia de publicação.`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Criador de Canecas validado: entrada dinâmica, build única, layout 20/80, 3 colunas, comandos padrão, Configuração Make e 400 frases categorizadas confirmados.');
}
