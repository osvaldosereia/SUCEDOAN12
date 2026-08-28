import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const read = relative => {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) {
    failures.push(`Arquivo ausente: ${relative}`);
    return '';
  }
  return readFileSync(file, 'utf8');
};
const need = (source, marker, message) => { if (!source.includes(marker)) failures.push(message); };
const reject = (source, marker, message) => { if (source.includes(marker)) failures.push(message); };

const syntaxFiles = [
  'producao-v2/js/mug-make-native-openai-bridge.js',
  'producao-v2/js/mug-personalizer-v15-clean.js',
  'producao-v2/js/mug-make-art-recovery-v22.js',
  'producao-v2/js/mug-force-low-quality-v23.js',
  'producao-v2/js/mug-art-command-compat-v2.js',
  'producao-v2/js/mug-studio-gallery.js',
  'producao-v2/js/mug-model-carousel-v10.js',
  'producao-v2/js/mug-command-library-v1.js',
  'producao-v2/js/mug-command-library-compact-v2.js',
  'producao-v2/js/mug-command-library-restore-v3.js',
  'producao-v2/js/mug-command-layout-v4-force.js',
  'producao-v2/js/mug-config-compact-v4-1.js',
  'producao-v2/js/mug-phrase-picker-v2.js'
];
for (const file of syntaxFiles) {
  if (!existsSync(path.join(ROOT, file))) { failures.push(`Arquivo ausente: ${file}`); continue; }
  const check = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, encoding: 'utf8' });
  if (check.status !== 0) failures.push(`Erro de sintaxe em ${file}: ${check.stderr || check.stdout}`);
}

// Entradas oficiais: release estável e carregador produtivo.
const productionEntry = read('producao/index.html');
const adminEntry = read('admin/index.html');
for (const [name, source] of [['producao/index.html', productionEntry], ['admin/index.html', adminEntry]]) {
  need(source, 'var RELEASE = ', `${name} não declara uma release estável do Admin.`);
  need(source, 'mug-model-carousel-v10', `${name} não referencia a release atual da área de canecas.`);
  need(source, "destination.searchParams.set('admin_build', RELEASE)", `${name} não envia admin_build ao Admin produtivo.`);
  need(source, "destination.searchParams.set('save_build', RELEASE)", `${name} não sincroniza save_build com admin_build.`);
  reject(source, 'var build = String(Date.now());', `${name} voltou a invalidar toda a aplicação em cada abertura.`);
}

const productive = read('producao-v2/admin-produtivo.html');
need(productive, "params.get('admin_build')", 'admin-produtivo.html não recebe a build ativa.');
need(productive, 'normalizeProductiveBuild', 'admin-produtivo.html não normaliza a build dos assets.');
need(productive, 'meta name="admin-save-build"', 'admin-produtivo.html não publica a build ativa.');
need(productive, "cache: 'no-store'", 'admin-produtivo.html deve revalidar o shell base antes de montar a versão produtiva.');
need(productive, './js/mug-make-native-openai-bridge.js', 'Admin produtivo não carrega o bridge atual das canecas.');

// Bridge atual: recuperação + personalizador V15 art-only + LOW, carregados sequencialmente.
const bridge = read('producao-v2/js/mug-make-native-openai-bridge.js');
need(bridge, 'meta[name="admin-save-build"]', 'Bridge das canecas não herda a build ativa.');
for (const moduleName of [
  './mug-make-art-recovery-v22.js',
  './mug-personalizer-v15-clean.js',
  './mug-art-command-compat-v2.js',
  './mug-force-low-quality-v23.js',
  './mug-studio-gallery.js',
  './mug-command-library-v1.js',
  './mug-command-library-compact-v2.js',
  './mug-command-library-restore-v3.js',
  './mug-command-layout-v4-force.js',
  './mug-config-compact-v4-1.js',
  './mug-model-carousel-v10.js'
]) need(bridge, moduleName, `Bridge não carrega ${moduleName}.`);
need(bridge, 'for (const path of MODULES) await import(withBuild(path));', 'Bridge não carrega os módulos sequencialmente com a mesma build.');
reject(bridge, './mug-personalizer-v7.js', 'Bridge voltou a carregar o personalizador V7 legado.');

// Contrato do personalizador: uma arte horizontal é a fonte final. Mockups IA não fazem parte da conclusão.
const personalizer = read('producao-v2/js/mug-personalizer-v15-clean.js');
for (const marker of [
  "const BUILD='20260828-producao-canecas-art-only-v1'",
  'MASTER_WIDTH=2400,MASTER_HEIGHT=960',
  "PRINT_LABEL='24 × 9,5 cm'",
  "MUG_CATEGORY='Caneca de Porcelana'",
  "MUG_CAPACITY='350ml'",
  'MUG_PRICE=24.90',
  "material:'Porcelana'",
  'buildArtPrompt',
  'somente arte plana horizontal',
  'Não mostre caneca, mãos, mesa, embalagem ou interface',
  "action:'generate_mug_art'",
  "action:'finalize_mug_product'",
  'waitFinalProduct',
  'artFromProduct',
  'artOnlyProduct',
  "p.mockup_1=''",
  "p.mockup_2=''",
  "p.mockup_3=''",
  'p.arte_personalizacao=p.arte_horizontal=art',
  'renderResult(resultBox,art,catalog)'
]) need(personalizer, marker, `Personalizador art-only incompleto: ${marker}`);
need(personalizer, 'if(isHttpUrl(art))return', 'Finalização ainda não aceita arte_horizontal como condição suficiente.');
reject(personalizer, 'mockup_center_base64:', 'Produção voltou a enviar mockup central ao Make.');
reject(personalizer, 'prompt_mockup_3:', 'Produção voltou a exigir prompt do terceiro mockup no transporte.');
reject(personalizer, "action: 'generate_mug_name'", 'Produção voltou a criar uma etapa Make separada apenas para nome.');

// Recuperação e qualidade de transporte continuam protegidas.
const recovery = read('producao-v2/js/mug-make-art-recovery-v22.js');
const forceLow = read('producao-v2/js/mug-force-low-quality-v23.js');
need(recovery, 'canecas/geracoes', 'Recuperação não consulta canecas/geracoes.');
need(recovery, 'generate_mug_art', 'Recuperação não reconhece a geração de arte.');
need(forceLow, "inner.quality = 'low'", 'Transporte do Criador não fixa qualidade LOW.');
need(forceLow, 'generate_mug_art', 'LOW guard não cobre geração da arte.');
need(forceLow, 'finalize_mug_product', 'LOW guard não cobre finalização.');

// Recursos de produtividade permanecem funcionais, mas não definem o contrato de mídia final.
const gallery = read('producao-v2/js/mug-studio-gallery.js');
need(gallery, "const BUILD = '20260825-mug-studio-gallery-v8'", 'Galeria não está na V8.');
need(gallery, 'const RECENT_LIMIT = 6;', 'Histórico rápido não está limitado a 6 canecas.');
need(gallery, "const MODELS_NODE = 'canecas/modelos_criacao';", 'Modelos não possuem armazenamento dedicado no Firebase.');
need(gallery, 'data-toggle-mug-model=', 'Cards recentes não permitem marcar/desmarcar Modelo.');
need(gallery, 'data-use-mug-model=', 'Card de modelo recente não permite reutilização rápida.');
need(gallery, "archiveProduct(loadConfig(), key", 'Botão Apagar não usa arquivamento seguro.');

const modelCarousel = read('producao-v2/js/mug-model-carousel-v10.js');
need(modelCarousel, "const BUILD = '20260825-mug-model-carousel-v10'", 'Carrossel visual dos modelos não está na V10.');
need(modelCarousel, 'data-model-carousel-prev', 'Carrossel de modelos não possui navegação anterior.');
need(modelCarousel, 'data-model-carousel-next', 'Carrossel de modelos não possui navegação seguinte.');
reject(modelCarousel, 'setInterval(', 'Carrossel visual não pode ter autoplay.');

const layout = read('producao-v2/js/mug-command-layout-v4-force.js');
need(layout, 'minmax(0,4fr)', 'Layout desktop não mantém aproximadamente 20%/80%.');
need(layout, 'repeat(3,minmax(0,1fr))', 'Biblioteca de comandos não usa múltiplas colunas no desktop.');
reject(layout, 'observer.observe(document.documentElement', 'Layout voltou a observar o DOM inteiro continuamente.');

const config = read('producao-v2/js/mug-config-compact-v4-1.js');
need(config, 'id="mugv7Webhook"', 'Webhook Make não está disponível no Criador.');
need(config, 'localStorage.setItem(WEBHOOK_KEY', 'Webhook Make não é persistido localmente.');

const compact = read('producao-v2/js/mug-command-library-compact-v2.js');
need(compact, 'iniciar_ativo', 'Comandos não preservam a opção de iniciar ativado.');
need(compact, "button.textContent = defaults.has(id) ? '★' : '☆'", 'Controle ★/☆ dos comandos padrão não está disponível.');

const phrasePicker = read('producao-v2/js/mug-phrase-picker-v2.js');
need(phrasePicker, 'const PAGE_SIZE = 20;', 'Seletor de frases não limita itens por página.');
need(phrasePicker, "cache: 'force-cache'", 'JSON de frases não aproveita cache do navegador.');
need(phrasePicker, 'dialog.showModal()', 'Biblioteca de frases não está isolada em janela própria.');
reject(phrasePicker, 'Date.now()', 'Seletor de frases invalida o cache em cada abertura.');

if (failures.length) {
  console.error(`Criador de Canecas atual: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Criador de Canecas validado: Produção V15 art-only, recuperação assíncrona, LOW e ferramentas de produtividade atuais.');
}
