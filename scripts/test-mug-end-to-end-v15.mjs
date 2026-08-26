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
  'ceneca10/app-v4-clean.js',
  'ceneca10/gallery-v4.js',
  'ceneca10/gallery-refresh-v5.js',
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
const config = read('app-next/src/config.js');
const publicClient = read('app-next/src/mug-public-personalization-v5.js');
const imagePerformance = read('app-next/src/image-performance.js');
need(rootIndex, 'mug-public-personalization-v5.js?v=20260826-canecas-clean-v16', 'Raiz não carrega o personalizador público V5 limpo.');
reject(rootIndex, 'mug-public-personalization-v2.js', 'Raiz ainda carrega o personalizador público V2 antigo.');
reject(config, 'queueMicrotask', 'config.js ainda executa carregamento lateral de canecas.');
reject(config, 'mug-public-personalization', 'config.js ainda importa controlador de canecas por efeito colateral.');
need(publicClient, 'isImageSource', 'Site público não aceita arte intermediária URL/Base64.');
need(publicClient, 'data:image', 'Site público não aceita Base64 intermediário da V9.5.');
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

// PRODUÇÃO: exatamente um controlador completo, sem guards globais concorrentes.
const productionLoader = read('producao-v2/js/mug-make-native-openai-bridge.js');
const productionClient = read('producao-v2/js/mug-personalizer-v15-clean.js');
need(productionLoader, './mug-personalizer-v15-clean.js', 'Produção não carrega o controlador único V15 limpo.');
reject(productionLoader, './mug-personalizer-v7.js', 'Produção ainda carrega V7 concorrente.');
reject(productionLoader, './mug-personalizer-v12.js', 'Produção ainda carrega V12 concorrente.');
reject(productionLoader, './mug-catalog-no-block-v13.js', 'Produção ainda carrega patch V13 concorrente.');
reject(productionLoader, './mug-make-client-guard-v14.js', 'Produção ainda carrega guard global V14.');
if (count(productionLoader, 'mug-personalizer-') !== 1) failures.push('Produção deve carregar exatamente um mug-personalizer.');
need(productionClient, 'waitFinalProduct', 'Produção não acompanha finalização Accepted no Firebase.');
need(productionClient, 'FINAL_WAIT_MS = 180000', 'Produção não possui limite explícito de 3 minutos.');
need(productionClient, 'analyzeCatalogSoft', 'Catalogação do Produção voltou a ser bloqueante.');
need(productionClient, "[urls.art,urls.m1,urls.m2,urls.m3].every(isHttpUrl)", 'Produção não valida as quatro URLs finais.');
need(productionClient, 'button.disabled=false', 'Produção não libera o botão no finally.');
reject(productionClient, 'window.fetch =', 'Controlador limpo do Produção ainda monkey-patcha window.fetch.');

// CANECA10: app único, sem guard/compat substituindo fetch.
const mobileIndex = read('ceneca10/index.html');
const mobile = read('ceneca10/app-v4-clean.js');
need(mobileIndex, 'app-v4-clean.js?v=20260826-clean-v4', 'Caneca10 não carrega app V4 limpo.');
reject(mobileIndex, 'make-client-guard', 'Caneca10 ainda carrega Make guard duplicado.');
reject(mobileIndex, 'make-response-compat', 'Caneca10 ainda carrega compatibilizador fetch duplicado.');
reject(mobileIndex, 'app-v3.js', 'Caneca10 ainda carrega app V3 antigo.');
need(mobile, 'isImageSource', 'Caneca10 não aceita Base64 intermediário.');
need(mobile, 'waitFinalProduct', 'Caneca10 não acompanha Accepted no Firebase.');
need(mobile, 'FINAL_WAIT_MS = 180000', 'Caneca10 não possui limite explícito de 3 minutos.');
need(mobile, "action:'finalize_mug_product'", 'Caneca10 não finaliza os 3 mockups.');
need(mobile, "ceneca10:mug-created", 'Caneca10 não avisa a galeria após criar.');
reject(mobile, 'window.fetch =', 'Caneca10 limpo ainda monkey-patcha window.fetch.');
need(read('ceneca10/gallery-refresh-v5.js'), '#createdRefresh', 'Histórico do Caneca10 não atualiza após geração.');

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
console.log('Canecas CLEAN V16 OK: stack única, SPA sem F5, Base64 intermediário, Accepted com timeout, branch canecas-media, 4 URLs finais e catálogo sob encomenda validados.');
