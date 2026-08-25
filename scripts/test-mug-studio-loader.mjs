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
  requireText(source, 'var RELEASE = ', `${name} não declara uma release estável do Admin.`);
  requireText(source, "20260825-mug-model-carousel-v10", `${name} não publica a release do carrossel visual V10.`);
  requireText(source, "destination.searchParams.set('admin_build', RELEASE)", `${name} não envia a release estável ao Admin produtivo.`);
  requireText(source, "destination.searchParams.set('save_build', RELEASE)", `${name} não sincroniza save_build com admin_build.`);
  forbidText(source, 'var build = String(Date.now());', `${name} voltou a invalidar todo o cache em cada abertura.`);
}

const productive = read('producao-v2/admin-produtivo.html');
requireText(productive, "params.get('admin_build')", 'admin-produtivo.html não recebe a build ativa.');
requireText(productive, 'normalizeProductiveBuild', 'admin-produtivo.html não normaliza a build dos assets.');
requireText(productive, 'meta name="admin-save-build"', 'admin-produtivo.html não publica a build ativa.');
requireText(productive, "cache: 'default'", 'admin-produtivo.html não aproveita cache da release ativa.');

const bridge = read('producao-v2/js/mug-make-native-openai-bridge.js');
requireText(bridge, 'meta[name="admin-save-build"]', 'Bridge das canecas não herda a build ativa.');
requireText(bridge, "'./mug-studio-gallery.js'", 'Galeria V8 não está na cadeia do Criador.');
requireText(bridge, "'./mug-personalizer-v7.js'", 'Personalizador principal não está na cadeia do Criador.');
requireText(bridge, "'./mug-command-library-v1.js'", 'Biblioteca de comandos não está na cadeia do Criador.');
requireText(bridge, "'./mug-command-library-compact-v2.js'", 'Biblioteca compacta não está na cadeia do Criador.');
requireText(bridge, "'./mug-command-layout-v4-force.js'", 'Layout desktop não está na cadeia do Criador.');
requireText(bridge, "'./mug-config-compact-v4-1.js'", 'Configuração compacta não está na cadeia do Criador.');
requireText(bridge, "'./mug-model-carousel-v10.js'", 'Carrossel visual dos modelos não está na cadeia do Criador.');
requireText(bridge, 'for (const path of MODULES) await import(withBuild(path));', 'Bridge não carrega os módulos sequencialmente com a mesma build.');

const personalizer = read('producao-v2/js/mug-personalizer-v7.js');
requireText(personalizer, 'PRIORIDADE MÁXIMA — INSTRUÇÃO COMPLEMENTAR DO OPERADOR', 'Prompt não prioriza a instrução do operador.');
requireText(personalizer, "const PLACEHOLDER_MOCKUP_3 = '__MUG_MOCKUP_3__'", 'Criador não declara o terceiro mockup.');
requireText(personalizer, 'mockup_center_base64: centerReference', 'Criador não envia a referência central ao Make.');
requireText(personalizer, 'prompt_mockup_3: buildMockupPrompt(3)', 'Criador não envia o prompt do terceiro mockup.');
requireText(personalizer, '!text(finalResult.mockup_3_url)', 'Criador não exige confirmação do terceiro mockup.');
requireText(personalizer, "action: 'generate_mug_name'", 'Criador não solicita nome comercial por IA.');
requireText(personalizer, 'Caneca de Porcelana ${middle} - 350ml', 'Nome não é normalizado no padrão comercial.');
requireText(personalizer, "const MUG_CATEGORY = 'Caneca de Porcelana'", 'Categoria oficial das novas canecas não está no singular.');
requireText(personalizer, 'subcategoria: productTheme', 'Subcategoria não é criada a partir do tema.');
requireText(personalizer, 'tema: productTheme', 'Tema identificado não é persistido no cadastro.');
requireText(personalizer, 'Caneca de porcelana branca, com capacidade de 350ml', 'Descrição não informa porcelana branca e 350ml.');
requireText(personalizer, 'A IA não conseguiu identificar o tema da caneca', 'Criador ainda permite cadastro com tema genérico.');
requireText(personalizer, "const MUG_CAPACITY = '350ml'", 'Capacidade padrão não está em 350ml.');
requireText(personalizer, 'const MUG_PRICE = 24.90;', 'Preço padrão não está em R$ 24,90.');
requireText(personalizer, "material: 'Porcelana'", 'Material padrão não está como porcelana.');

const gallery = read('producao-v2/js/mug-studio-gallery.js');
requireText(gallery, "const BUILD = '20260825-mug-studio-gallery-v8'", 'Galeria não está na versão V8.');
requireText(gallery, 'const RECENT_LIMIT = 6;', 'Histórico rápido não está limitado a 6 canecas.');
requireText(gallery, "const CATEGORY_NAMES = ['Caneca de Porcelana', 'Canecas de Porcelana', 'Canecas'];", 'Galeria não lê a categoria oficial e as categorias legadas.');
requireText(gallery, "params.set('limitToLast', String(CATEGORY_QUERY_LIMIT))", 'Consulta das canecas não limita o volume lido do Firebase.');
requireText(gallery, '.slice(0, RECENT_LIMIT)', 'Galeria não corta o resultado final nas 6 últimas canecas.');
requireText(gallery, '<h2>Últimas 6 canecas</h2>', 'Título do histórico rápido não deixa claro o limite de 6.');
forbidText(gallery, 'data-mug-page="prev"', 'Paginação antiga voltou para o histórico das canecas.');
forbidText(gallery, 'data-mug-page="next"', 'Paginação antiga voltou para o histórico das canecas.');
requireText(gallery, "const MODELS_NODE = 'canecas/modelos_criacao';", 'Modelos não possuem armazenamento dedicado no Firebase.');
requireText(gallery, 'data-toggle-mug-model=', 'Cards recentes não permitem marcar/desmarcar Modelo.');
requireText(gallery, 'data-use-mug-model=', 'Card de modelo recente não permite reutilização rápida.');
requireText(gallery, "shelf.id = 'mugQuickModels';", 'Biblioteca de comandos não recebe a área Modelos rápidos.');
requireText(gallery, 'data-quick-model-use=', 'Modelos rápidos não possuem ação Usar.');
requireText(gallery, "localStorage.setItem(SELECTED_KEY, JSON.stringify([...ids]))", 'Aplicação do modelo não restaura a seleção persistida de comandos.');
requireText(gallery, "panel.__mugCommandState.selected = new Set(ids)", 'Aplicação do modelo não atualiza o estado vivo da biblioteca de comandos.');
requireText(gallery, "'configuracao_arte/comandos_salvos_ids': recipe.ids", 'Nova criação não registra quais comandos salvos foram utilizados.');
requireText(gallery, "'configuracao_arte/instrucao_manual': recipe.manual", 'Nova criação não preserva separadamente a instrução manual.');
requireText(gallery, "archiveProduct(loadConfig(), key", 'Botão Apagar não usa arquivamento seguro.');

const modelCarousel = read('producao-v2/js/mug-model-carousel-v10.js');
requireText(modelCarousel, "const BUILD = '20260825-mug-model-carousel-v10'", 'Carrossel visual dos modelos não está na V10.');
requireText(modelCarousel, 'product.mockup_1', 'Carrossel não lê o mockup 1 do produto.');
requireText(modelCarousel, 'product.mockup_2', 'Carrossel não lê o mockup 2 do produto.');
requireText(modelCarousel, 'product.mockup_3', 'Carrossel não lê o mockup 3 do produto.');
requireText(modelCarousel, 'data-model-carousel-prev', 'Carrossel externo não possui navegação manual anterior.');
requireText(modelCarousel, 'data-model-carousel-next', 'Carrossel externo não possui navegação manual seguinte.');
requireText(modelCarousel, 'data-model-slide-prev', 'Card não possui navegação manual para o mockup anterior.');
requireText(modelCarousel, 'data-model-slide-next', 'Card não possui navegação manual para o próximo mockup.');
requireText(modelCarousel, 'data-model-slide-dot=', 'Card não possui seleção manual direta entre os três mockups.');
requireText(modelCarousel, 'scrollBy({ left:', 'Carrossel de modelos não desliza horizontalmente sob comando do usuário.');
requireText(modelCarousel, 'data-quick-model-use=', 'Card visual não preserva a ação de usar modelo.');
requireText(modelCarousel, 'data-quick-model-remove=', 'Card visual não preserva a ação de remover modelo.');
requireText(modelCarousel, 'mockup_1: mockups[0]', 'Modelos antigos não são enriquecidos com o primeiro mockup.');
requireText(modelCarousel, 'mockup_2: mockups[1]', 'Modelos antigos não são enriquecidos com o segundo mockup.');
requireText(modelCarousel, 'mockup_3: mockups[2]', 'Modelos antigos não são enriquecidos com o terceiro mockup.');
requireText(modelCarousel, 'shelfObserver.observe(shelf, { childList: true });', 'Observação de compatibilidade não está limitada à área dos modelos.');
forbidText(modelCarousel, 'model.nome', 'Carrossel visual voltou a exibir o nome da caneca.');
forbidText(modelCarousel, 'model.codigo', 'Carrossel visual voltou a exibir o código da caneca.');
forbidText(modelCarousel, 'setInterval(', 'Carrossel visual possui autoplay; a troca deve ser somente manual.');
forbidText(modelCarousel, 'observer.observe(document.documentElement', 'Carrossel visual não pode observar o DOM inteiro continuamente.');

const layout = read('producao-v2/js/mug-command-layout-v4-force.js');
requireText(layout, "const BUILD = '20260825-canecas-command-layout-v8-desktop'", 'Layout desktop não está na versão V8.');
requireText(layout, 'minmax(0,4fr)', 'Layout desktop não mantém aproximadamente 20%/80%.');
requireText(layout, 'repeat(3,minmax(0,1fr))', 'Biblioteca de comandos não usa múltiplas colunas no desktop.');
requireText(layout, '@media (min-width: 1500px)', 'Layout não aproveita monitores desktop largos.');
requireText(layout, 'repeat(4,minmax(0,1fr))', 'Monitores largos não recebem quatro colunas de comandos.');
requireText(layout, '.mugv7-info{display:none!important}', 'Bloco informativo redundante não está oculto.');
forbidText(layout, "observer.observe(document.documentElement", 'Layout voltou a observar o DOM inteiro continuamente.');

const config = read('producao-v2/js/mug-config-compact-v4-1.js');
requireText(config, "const BUILD = '20260825-canecas-config-v8'", 'Configuração compacta não está na versão V8.');
requireText(config, 'id="mugv7Webhook"', 'Webhook Make não está disponível no Criador.');
requireText(config, 'localStorage.setItem(WEBHOOK_KEY', 'Webhook Make não é persistido localmente.');
forbidText(config, "observer.observe(document.documentElement", 'Configuração voltou a observar o DOM inteiro continuamente.');

const compact = read('producao-v2/js/mug-command-library-compact-v2.js');
requireText(compact, 'iniciar_ativo', 'Comandos não preservam a opção de iniciar ativado.');
requireText(compact, "button.textContent = defaults.has(id) ? '★' : '☆'", 'Controle ★/☆ dos comandos padrão não está disponível.');

const phrasePicker = read('producao-v2/js/mug-phrase-picker-v2.js');
requireText(phrasePicker, 'const PAGE_SIZE = 20;', 'Seletor de frases não limita itens por página.');
requireText(phrasePicker, "cache: 'force-cache'", 'JSON de frases não aproveita cache do navegador.');
requireText(phrasePicker, 'dialog.showModal()', 'Biblioteca de frases não está isolada em janela própria.');
forbidText(phrasePicker, 'Date.now()', 'Seletor de frases invalida o cache em cada abertura.');

if (failures.length) {
  console.error(`Criador de Canecas: ${failures.length} falha(s) na cadeia de publicação.`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Criador de Canecas V10 validado: modelos em cards verticais, três mockups em slide manual, carrossel horizontal, sem nome/código e sem autoplay.');
}