import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = {
  productionNavigation: 'producao-v2/js/navigation-v12.js',
  productionCatalogSync: 'producao-v2/js/catalog-auto-sync.js',
  productionMedia: 'producao-v2/js/mug-product-media-enhancement-v19.js',
  productionBridge: 'producao-v2/js/mug-make-native-openai-bridge.js',
  productionClient: 'producao-v2/js/mug-personalizer-v15-clean.js',
  productionGallery: 'producao-v2/js/mug-studio-gallery.js',
  publicRuntime: 'app-next/src/mug-public-runtime-v6.js',
  publicClient: 'app-next/src/mug-public-personalization-v6.js',
  public3d: 'app-next/src/mug-public-3d-v2.js',
  publicThumbs: 'app-next/src/mug-public-thumbnails-v2.js',
  mobileIndex: 'caneca10/index.html',
  mobileClient: 'caneca10/app-v4-clean.js',
  mobileRecovery: 'caneca10/art-recovery-v1.js',
  sharedTransport: 'shared/mug-make-fast-ack-v1.js',
};

const src = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, fs.readFileSync(path, 'utf8')]));
const failures = [];
const need = (key, token, message) => { if (!src[key].includes(token)) failures.push(message); };
const reject = (key, token, message) => { if (src[key].includes(token)) failures.push(message); };
const count = (key, token) => src[key].split(token).length - 1;
for (const path of Object.values(files).filter(path => path.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding:'utf8' });
  if (result.status !== 0) failures.push(`${path}: ${result.stderr || result.stdout}`);
}

const hook='cl3r1f56r9txezvltkkwlsspmnja6sw4';

// PRODUÇÃO: um único controlador e resultado interno somente com arte horizontal.
need('productionNavigation', './mug-product-media-enhancement-v19.js', 'Navegação não carrega o módulo leve de mídia atual.');
reject('productionNavigation', './mug-products-enhancement.js', 'Navegação ainda carrega o gerador legado de mídia.');
need('productionNavigation', 'somente a arte horizontal', 'Texto da rota não descreve o fluxo art-only.');
need('productionCatalogSync', './mug-product-media-enhancement-v19.js', 'Sincronizador ainda não usa o módulo leve de mídia.');
reject('productionCatalogSync', './mug-products-enhancement.js', 'Sincronizador global ainda carrega o gerador legado.');
need('productionMedia', 'const MASTER_WIDTH = 2400', 'Editor de mídia usa largura incorreta.');
need('productionMedia', 'const MASTER_HEIGHT = 960', 'Editor de mídia usa altura incorreta.');
reject('productionMedia', 'installMugPanel', 'Módulo de mídia não pode montar um segundo gerador.');
need('productionBridge', './mug-personalizer-v15-clean.js', 'Produção não carrega o controlador atual.');
need('productionBridge', './mug-make-art-recovery-v22.js', 'Produção não carrega recuperação da arte.');
need('productionBridge', './mug-force-low-quality-v23.js', 'Produção não carrega trava LOW.');
need('productionBridge', './mug-command-library-v1.js', 'Produção não carrega biblioteca de comandos.');
need('productionBridge', 'function ensureStudioPanelShell()', 'Loader não cria a estrutura do painel.');
reject('productionBridge', 'mug-make-fast-ack-v1.js', 'Produção voltou a instalar ACK sintético compartilhado.');
if (count('productionBridge','mug-personalizer-') !== 1) failures.push('Produção deve carregar exatamente um controlador mug-personalizer.');
need('productionClient', hook, 'Produção não usa o webhook oficial configurado.');
need('productionClient', "action:'generate_mug_art'", 'Produção não gera arte horizontal.');
need('productionClient', "action:'finalize_mug_product'", 'Produção não finaliza a arte.');
need('productionClient', 'waitFinalProduct', 'Produção perdeu polling de finalização Accepted.');
need('productionClient', 'artFromProduct', 'Produção não resolve arte_horizontal do produto.');
need('productionClient', 'artOnlyProduct', 'Produção não limpa o cadastro final para art-only.');
need('productionClient', "p.mockup_1=''", 'Produção não limpa mockup_1 no produto final.');
need('productionClient', 'renderResult(resultBox,art,catalog)', 'Produção não renderiza somente a arte final.');
need('productionClient', "new CustomEvent('admin-v2-products-invalidated'", 'Produção não invalida a lista após salvar.');
reject('productionClient', 'window.fetch =', 'Controlador do Produção não deve monkey-patchar window.fetch.');
need('productionGallery', "window.addEventListener('admin-v2-products-invalidated'", 'Galeria do Produção não reage à criação sem F5.');

// SITE PÚBLICO: arte única + render determinístico no navegador.
const publicTransportPos=src.publicRuntime.indexOf('../../shared/mug-make-fast-ack-v1.js');
const publicControllerPos=src.publicRuntime.indexOf('./mug-public-personalization-v6.js');
if(publicTransportPos<0||publicControllerPos<=publicTransportPos)failures.push('Site público deve carregar transporte antes do personalizador V6.');
need('publicRuntime','./mug-public-3d-v2.js','Site público não carrega o 3D V2.');
need('publicRuntime','./mug-public-thumbnails-v2.js','Site público não carrega miniaturas V2.');
need('publicClient',"action:'personalize_mug_model'",'Site público não gera a personalização.');
need('publicClient',"action:'finalize_mug_product'",'Site público não finaliza a arte horizontal.');
need('publicClient','waitFinalProduct','Site público não recupera finalização Accepted.');
need('publicClient','preview_esquerda','Site público não prevê preview esquerdo persistido.');
need('publicClient','preview_direita','Site público não prevê preview direito persistido.');
reject('publicClient','mockup_left_base64','Site público voltou a enviar recorte para mockup ao Make.');
reject('publicClient','prompt_mockup_1','Site público voltou a pedir mockup à IA.');
reject('publicClient','cropReference(','Site público voltou a preparar três recortes de mockup.');
need('public3d','RoomEnvironment','3D público não usa ambiente de estúdio.');
need('public3d','Ver caneca em 360°','3D público não oferece visualização 360.');
need('public3d','preview_esquerda','3D público não usa preview persistido.');
need('publicThumbs','thumbnail','Grade pública não reconhece thumbnail persistido.');
reject('publicThumbs','THREE_URL','Grade pública não deve carregar Three.js.');

// CANECA10: resultado final interno é somente arte; compatibilidade de transporte legado pode existir até a troca do cenário Make.
const mobileTransportPos=src.mobileIndex.indexOf('../shared/mug-make-fast-ack-v1.js');
const mobileRecoveryPos=src.mobileIndex.indexOf('./art-recovery-v1.js');
const mobileAppPos=src.mobileIndex.indexOf('./app-v4-clean.js');
const mobileGalleryPos=src.mobileIndex.indexOf('./gallery-v4.js');
if(!(mobileTransportPos>=0&&mobileRecoveryPos>mobileTransportPos&&mobileAppPos>mobileRecoveryPos&&mobileGalleryPos>mobileAppPos))failures.push('Caneca10 deve carregar transporte LOW -> recovery -> app -> galeria.');
reject('mobileIndex','gallery-refresh-v5.js','Caneca10 ainda carrega refresh paralelo.');
need('mobileClient',hook,'Caneca10 não usa o mesmo webhook oficial do Produção.');
need('mobileClient',"action:'generate_mug_art'",'Caneca10 não gera a arte inicial.');
need('mobileClient',"action:'analyze_mug_product'",'Caneca10 não cataloga a arte.');
need('mobileClient',"action:'finalize_mug_product'",'Caneca10 não finaliza a arte.');
need('mobileClient','waitFinalProduct','Caneca10 não recupera finalização Accepted.');
need('mobileClient','artOnlyProduct','Caneca10 não materializa produto art-only.');
need('mobileClient',"p.mockup_1=''",'Caneca10 não limpa mockups do produto final.');
need('mobileRecovery',"const RESULT_NODE = 'canecas/geracoes'",'Caneca10 não usa o nó de recuperação.');
need('mobileRecovery','waitForArt','Recovery mobile não acompanha o Firebase.');
need('sharedTransport','ACK_AFTER_MS = 10000','Transporte compartilhado perdeu ACK de 10s.');
need('sharedTransport',"inner.quality = 'low'",'Transporte compartilhado não força LOW.');

if(fs.existsSync('ceneca10'))failures.push('A pasta ceneca10 antiga ainda existe; caminho oficial é caneca10.');
if(failures.length){console.error(`Stack atual de canecas FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1);}
console.log('Stack atual OK: Produção/Caneca10 finalizam arte horizontal e site público usa thumbnails + previews + 360° V2.');