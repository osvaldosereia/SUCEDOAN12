import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const need = (source, token, message) => { if (!source.includes(token)) failures.push(message); };
const reject = (source, token, message) => { if (source.includes(token)) failures.push(message); };
const count = (source, token) => source.split(token).length - 1;

const syntaxFiles = [
  'app-next/src/mug-public-personalization-v5.js',
  'app-next/src/image-performance.js',
  'app-next/src/config.js',
  'caneca10/app-v4-clean.js',
  'caneca10/gallery-v4.js',
  'caneca10/art-recovery-v1.js',
  'producao-v2/js/mug-personalizer-v15-clean.js',
  'producao-v2/js/mug-make-native-openai-bridge.js',
  'producao/catalog-sync-admin.js',
  'scripts/sincronizar-produtos-home-firebase.mjs',
  'scripts/estabilizar-catalogo-publico.mjs',
  'scripts/filtrar-produtos-home-publicos.mjs'
];
for (const file of syntaxFiles) {
  const check = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding:'utf8' });
  if (check.status !== 0) failures.push(`${file}: ${check.stderr || check.stdout}`);
}

// SITE PÚBLICO: um único controlador, montagem SPA e respostas Make explícitas.
const rootIndex = read('index.html');
const publicRuntime = read('app-next/src/mug-public-runtime-v6.js');
const config = read('app-next/src/config.js');
const publicClient = read('app-next/src/mug-public-personalization-v5.js');
const imagePerformance = read('app-next/src/image-performance.js');
need(rootIndex, 'mug-public-runtime-v6.js', 'Raiz não carrega o runtime público atual de canecas.');
need(publicRuntime, './mug-public-personalization-v5.js', 'Runtime público não carrega o personalizador V5 atual.');
reject(rootIndex, '<script src="./app-next/src/mug-public-personalization-v5.js', 'Raiz não deve carregar o personalizador V5 diretamente fora do runtime.');
reject(rootIndex, 'mug-public-personalization-v2.js', 'Raiz ainda carrega o personalizador público V2 antigo.');
reject(config, 'queueMicrotask', 'config.js ainda executa carregamento lateral de canecas.');
reject(config, 'mug-public-personalization', 'config.js ainda importa controlador de canecas por efeito colateral.');
need(publicClient, 'isImageSource', 'Site público não aceita arte intermediária URL/Base64.');
need(publicClient, 'data:image', 'Site público não aceita Base64 intermediário da automação.');
need(publicClient, "action:'personalize_mug_model'", 'Site público não chama personalize_mug_model.');
need(publicClient, "action:'finalize_mug_product'", 'Site público não finaliza a caneca.');
need(publicClient, "window.addEventListener('da:route-rendered'", 'Personalizador não acompanha a renderização real da SPA.');
need(publicClient, 'waitFinalProduct', 'Personalizador público não acompanha Accepted pelo Firebase.');
need(publicClient, 'FINAL_WAIT_MS = 180000', 'Personalizador público não possui limite explícito de 3 minutos.');
need(publicClient, 'frase:phraseValue', 'Campo frase ainda depende de variável implícita/ambígua.');
reject(publicClient, 'window.fetch =', 'Personalizador público ainda monkey-patcha window.fetch.');

// IMAGENS: apenas branch main vira caminho local; canecas-media deve continuar absoluta.
need(imagePerformance, "branch === 'main' && path ? `/${path}` : raw", 'Otimizador ainda reescreve URLs de branches não-main.');
need(imagePerformance, "dataset.imageSourceMode = 'branch-aware'", 'Otimizador não declara modo branch-aware.');
const mediaExample = 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/canecas-media/canecas/imagens/mockups/2026-08-26/m1.webp';
const mainExample = 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/site/img/produtos/m1.webp';
const simulatedLocalAsset = raw => {
  const match = String(raw).match(/^https?:\/\/raw\.githubusercontent\.com\/osvaldosereia\/SUCEDOAN12\/([^/]+)\/(.+)$/i);
  if (!match) return raw;
  return match[1] === 'main' ? `/${match[2]}` : raw;
};
if (simulatedLocalAsset(mediaExample) !== mediaExample) failures.push('Simulação: canecas-media foi convertida incorretamente para caminho local.');
if (simulatedLocalAsset(mainExample) !== '/site/img/produtos/m1.webp') failures.push('Simulação: asset da main deixou de ser convertido para caminho local.');

// PRODUÇÃO: exatamente um controlador completo, com recovery e trava LOW.
const productionLoader = read('producao-v2/js/mug-make-native-openai-bridge.js');
const productionClient = read('producao-v2/js/mug-personalizer-v15-clean.js');
need(productionLoader, './mug-personalizer-v15-clean.js', 'Produção não carrega o controlador único V15 limpo.');
need(productionLoader, './mug-make-art-recovery-v22.js', 'Produção não carrega recuperação assíncrona da arte.');
need(productionLoader, './mug-force-low-quality-v23.js', 'Produção não carrega a trava de qualidade LOW.');
reject(productionLoader, './mug-personalizer-v7.js', 'Produção ainda carrega V7 concorrente.');
reject(productionLoader, './mug-personalizer-v12.js', 'Produção ainda carrega V12 concorrente.');
reject(productionLoader, './mug-catalog-no-block-v13.js', 'Produção ainda carrega patch V13 concorrente.');
reject(productionLoader, './mug-make-client-guard-v14.js', 'Produção ainda carrega guard global V14.');
reject(productionLoader, 'mug-make-fast-ack-v1.js', 'Produção ainda instala Accepted sintético antes da resposta real do Make.');
if (count(productionLoader, 'mug-personalizer-') !== 1) failures.push('Produção deve carregar exatamente um mug-personalizer.');
need(productionClient, 'waitFinalProduct', 'Produção não acompanha finalização Accepted no Firebase.');
need(productionClient, 'FINAL_WAIT_MS = 180000', 'Produção não possui limite explícito de 3 minutos.');
need(productionClient, 'analyzeCatalogSoft', 'Catalogação do Produção voltou a ser bloqueante.');
need(productionClient, "[urls.art,urls.m1,urls.m2,urls.m3].every(isHttpUrl)", 'Produção não valida as quatro URLs finais.');
need(productionClient, 'renderResult(resultBox,urls,catalog);', 'Produção não renderiza as quatro imagens quando a finalização retorna.');
need(productionClient, 'button.disabled=false', 'Produção não libera o botão no finally.');
reject(productionClient, 'window.fetch =', 'Controlador limpo do Produção ainda monkey-patcha window.fetch.');

// CANECA10: caminho correto, app único, recovery da arte, transporte LOW e galeria sem refresh paralelo.
if (fs.existsSync(path.join(root, 'ceneca10'))) failures.push('A pasta antiga ceneca10 ainda existe.');
const mobileIndex = read('caneca10/index.html');
const mobile = read('caneca10/app-v4-clean.js');
const mobileRecovery = read('caneca10/art-recovery-v1.js');
const mobileGallery = read('caneca10/gallery-v4.js');
const sharedTransport = read('shared/mug-make-fast-ack-v1.js');
need(mobileIndex, './app-v4-clean.js', 'Caneca10 não carrega app V4 limpo.');
need(mobileIndex, './art-recovery-v1.js', 'Caneca10 não carrega recovery da arte.');
need(mobileIndex, '../shared/mug-make-fast-ack-v1.js', 'Caneca10 não carrega transporte LOW compartilhado.');
reject(mobileIndex, 'gallery-refresh-v5.js', 'Caneca10 ainda carrega refresh duplicado.');
reject(mobileIndex, 'make-client-guard', 'Caneca10 ainda carrega Make guard duplicado.');
reject(mobileIndex, 'make-response-compat', 'Caneca10 ainda carrega compatibilizador fetch duplicado.');
reject(mobileIndex, 'app-v3.js', 'Caneca10 ainda carrega app V3 antigo.');
const transportPos = mobileIndex.indexOf('../shared/mug-make-fast-ack-v1.js');
const recoveryPos = mobileIndex.indexOf('./art-recovery-v1.js');
const appPos = mobileIndex.indexOf('./app-v4-clean.js');
const galleryPos = mobileIndex.indexOf('./gallery-v4.js');
if (!(transportPos >= 0 && recoveryPos > transportPos && appPos > recoveryPos && galleryPos > appPos)) failures.push('Caneca10 não respeita ordem transporte -> recovery -> app -> galeria.');
need(mobile, 'isImageSource', 'Caneca10 não aceita Base64 intermediário.');
need(mobile, 'waitFinalProduct', 'Caneca10 não acompanha Accepted no Firebase.');
need(mobile, 'FINAL_WAIT_MS = 180000', 'Caneca10 não possui limite explícito de 3 minutos.');
need(mobile, "action:'generate_mug_art'", 'Caneca10 não gera a arte inicial.');
need(mobile, "action:'analyze_mug_product'", 'Caneca10 não faz catalogação visual.');
need(mobile, "action:'finalize_mug_product'", 'Caneca10 não finaliza os 3 mockups.');
need(mobile, 'mockup_left_base64', 'Caneca10 não envia mockup esquerdo.');
need(mobile, 'mockup_right_base64', 'Caneca10 não envia mockup direito.');
need(mobile, 'mockup_center_base64', 'Caneca10 não envia mockup central.');
reject(mobile, 'window.fetch =', 'Caneca10 limpo ainda monkey-patcha window.fetch diretamente.');
need(mobileRecovery, "const RESULT_NODE = 'canecas/geracoes'", 'Caneca10 não usa nó temporário da arte.');
need(mobileRecovery, 'waitForArt', 'Caneca10 não recupera a arte assíncrona pelo Firebase.');
need(mobileRecovery, 'progressDetail', 'Recovery não informa andamento na interface mobile.');
need(sharedTransport, "inner.quality = 'low'", 'Transporte compartilhado não força LOW.');
need(sharedTransport, 'ACK_AFTER_MS = 10000', 'Transporte compartilhado não possui ACK de finalização.');
need(mobileGallery, 'new MutationObserver', 'Galeria ativa não reage ao resultado concluído.');
need(mobileGallery, 'setTimeout(() => refresh(true, false), 700)', 'Galeria não agenda refresh único após conclusão.');

// CATÁLOGO: modelo público sob encomenda e suas 4 mídias precisam sobreviver ao pipeline.
const catalog = read('app-next/src/catalog.js');
need(catalog, 'isPublicMugModel', 'Catálogo do navegador não reconhece modelo público de caneca.');
need(catalog, 'raw.mockup_1', 'Catálogo do navegador não considera mockup_1.');
need(catalog, 'raw.imagens_site', 'Catálogo do navegador não considera imagens_site.');
const sync = read('scripts/sincronizar-produtos-home-firebase.mjs');
need(sync, 'isPublicMugModel', 'Sincronizador Firebase não reconhece modelo público de caneca.');
need(sync, 'produto_sob_encomenda', 'Sincronizador não marca caneca sob encomenda.');
need(sync, 'mockup_3', 'Sincronizador não preserva os 3 mockups.');
const stabilizer = read('scripts/estabilizar-catalogo-publico.mjs');
need(stabilizer, "situacao: madeToOrder ? 'A'", 'Estabilizador não torna modelo sob encomenda disponível no catálogo derivado.');
need(stabilizer, 'Math.max(1, integer(product.estoque))', 'Estabilizador não fornece disponibilidade virtual ao modelo sob encomenda.');
need(stabilizer, 'modelo_publico', 'Estabilizador remove flag modelo_publico.');
need(stabilizer, 'arte_horizontal', 'Estabilizador remove arte horizontal.');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mug-clean-v16-'));
const home = path.join(tmp, 'produtos-home.json');
const admin = path.join(tmp, 'produtos-admin.json');
const version = path.join(tmp, 'catalog-version.json');
const mediaBase = 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/canecas-media/canecas/imagens/mockups/2026-08-26';
const fixture = {
  'mug-publica': {
    id:'mug-publica', nome:'Caneca Modelo Público', categoria:'Caneca de Porcelana', preco:29.9,
    estoque:0, situacao:'I', ativo:false, visivel:false, modelo_caneca:true, modelo_publico:true, personalizacao_publica:true,
    mockup_1:`${mediaBase}/m1.webp`, mockup_2:`${mediaBase}/m2.webp`, mockup_3:`${mediaBase}/m3.webp`,
    arte_horizontal:'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/canecas-media/canecas/imagens/artes-geradas/2026-08-26/a.webp'
  },
  'produto-comum': { id:'produto-comum', nome:'Produto comum', categoria:'Outros', preco:10, estoque:0, situacao:'I', ativo:false }
};
fs.writeFileSync(home, JSON.stringify(fixture));
fs.writeFileSync(admin, JSON.stringify(fixture));
fs.writeFileSync(version, '{}');
let run = spawnSync(process.execPath, ['scripts/estabilizar-catalogo-publico.mjs'], {
  cwd:root, encoding:'utf8', env:{ ...process.env, PRODUCTS_HOME_PATH:home, PRODUCTS_ADMIN_PATH:admin, CATALOG_VERSION_PATH:version }
});
if (run.status !== 0) failures.push(`Estabilizador falhou no fixture: ${run.stderr || run.stdout}`);
const stabilized = JSON.parse(fs.readFileSync(home, 'utf8'));
const mug = stabilized['mug-publica'];
if (!mug) failures.push('Modelo público sumiu no estabilizador.');
else {
  if (mug.situacao !== 'A') failures.push(`Modelo público deveria sair como A, saiu ${mug.situacao}.`);
  if (Number(mug.estoque) < 1) failures.push('Modelo público deveria ter disponibilidade virtual >=1.');
  if (mug.modelo_publico !== true || mug.personalizacao_publica !== true) failures.push('Flags públicas não foram preservadas.');
  if (!Array.isArray(mug.imagens) || mug.imagens.length !== 3) failures.push('Os três mockups não foram preservados.');
  if (!String(mug.url_imagem || '').includes('/canecas-media/')) failures.push('URL da imagem não preservou a branch canecas-media.');
  if (!String(mug.arte_horizontal || '').includes('/canecas-media/')) failures.push('Arte horizontal não preservou a branch canecas-media.');
}

fs.writeFileSync(home, JSON.stringify(fixture));
fs.writeFileSync(version, '{}');
run = spawnSync(process.execPath, ['scripts/filtrar-produtos-home-publicos.mjs'], {
  cwd:root, encoding:'utf8', env:{ ...process.env, PRODUCTS_HOME_PATH:home, CATALOG_VERSION_PATH:version }
});
if (run.status !== 0) failures.push(`Filtro pós-ofertas falhou no fixture: ${run.stderr || run.stdout}`);
const filtered = JSON.parse(fs.readFileSync(home, 'utf8'));
if (!filtered['mug-publica']) failures.push('Filtro pós-ofertas removeu modelo público com estoque 0.');
if (filtered['produto-comum']) failures.push('Filtro pós-ofertas manteve produto comum inativo/sem estoque.');
fs.rmSync(tmp, { recursive:true, force:true });

if (failures.length) {
  console.error(`\nCanecas CLEAN V16 FALHOU (${failures.length}):\n- ${failures.join('\n- ')}\n`);
  process.exit(1);
}
console.log('Canecas CLEAN V16 OK: site público, Produção e Caneca10 canônico com LOW, recovery Firebase, finalização assíncrona, 4 URLs e catálogo sob encomenda validados.');
