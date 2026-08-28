import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const failures=[];
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(source,token,message)=>{if(!source.includes(token))failures.push(message);};
const reject=(source,token,message)=>{if(source.includes(token))failures.push(message);};

const syntaxFiles=[
  'app-next/src/mug-public-runtime-v6.js',
  'app-next/src/mug-public-personalization-v6.js',
  'app-next/src/mug-public-3d-v2.js',
  'app-next/src/mug-public-thumbnails-v2.js',
  'app-next/src/config.js',
  'caneca10/app-v4-clean.js',
  'caneca10/art-recovery-v1.js',
  'producao-v2/js/mug-personalizer-v15-clean.js',
  'producao-v2/js/mug-make-native-openai-bridge.js',
  'scripts/estabilizar-catalogo-publico.mjs',
  'scripts/filtrar-produtos-home-publicos.mjs'
];
for(const file of syntaxFiles){const check=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});if(check.status!==0)failures.push(`${file}: ${check.stderr||check.stdout}`);}

// SITE PÚBLICO: personalização gera somente arte; apresentação usa thumbnail + duas vistas + 360°.
const rootIndex=read('index.html');
const publicRuntime=read('app-next/src/mug-public-runtime-v6.js');
const publicClient=read('app-next/src/mug-public-personalization-v6.js');
const public3d=read('app-next/src/mug-public-3d-v2.js');
const publicThumbs=read('app-next/src/mug-public-thumbnails-v2.js');
const resultPage=read('caneca10/resultado.html');
const config=read('app-next/src/config.js');
need(rootIndex,'mug-public-runtime-v6.js','Raiz não carrega o runtime público atual de canecas.');
need(publicRuntime,'./mug-public-personalization-v6.js','Runtime público não carrega o personalizador art-only V6.');
need(publicRuntime,'./mug-public-thumbnails-v2.js','Runtime público não carrega miniaturas V2.');
need(publicRuntime,'./mug-public-3d-v2.js','Runtime público não carrega 3D V2.');
reject(rootIndex,'<script src="./app-next/src/mug-public-personalization-v6.js','Raiz não deve carregar o personalizador diretamente.');
reject(config,'queueMicrotask','config.js ainda executa carregamento lateral de canecas.');
need(publicClient,"action:'personalize_mug_model'",'Site público não chama a geração personalizada.');
need(publicClient,"action:'finalize_mug_product'",'Site público não finaliza a arte.');
need(publicClient,'waitFinalProduct','Site público não acompanha Accepted pelo Firebase.');
need(publicClient,'arte_horizontal','Site público não usa arte_horizontal como fonte final.');
need(publicClient,"preview_esquerda:''",'Contrato do produto não prevê preview esquerdo.');
need(publicClient,"preview_direita:''",'Contrato do produto não prevê preview direito.');
need(publicClient,"thumbnail:''",'Contrato do produto não prevê thumbnail.');
need(publicClient,"render_3d_version:'mug-public-3d-v2'",'Produto não registra versão do render 3D.');
reject(publicClient,'mockup_left_base64','Site público voltou a enviar mockup esquerdo ao Make.');
reject(publicClient,'mockup_center_base64','Site público voltou a enviar mockup central ao Make.');
reject(publicClient,'prompt_mockup_1','Site público voltou a pedir mockups à IA.');
reject(publicClient,'cropReference(','Site público voltou a preparar recortes de mockup.');
need(public3d,'RoomEnvironment','3D público não usa iluminação/reflexos de estúdio.');
need(public3d,'MeshPhysicalMaterial','3D público não usa material físico.');
need(public3d,'generatePreviews','3D público não gera duas vistas.');
need(public3d,'preview_esquerda','3D público não reconhece preview persistido.');
need(public3d,'Ver caneca em 360°','3D público não oferece botão 360°.');
need(public3d,'pointers=new Map','3D público não oferece pinch zoom mobile.');
need(publicThumbs,'thumbnail','Grade não reconhece thumbnail persistido.');
need(publicThumbs,'arte_horizontal','Fallback da grade não parte da arte horizontal.');
need(publicThumbs,'IntersectionObserver','Grade não processa miniaturas de forma lazy.');
reject(publicThumbs,'THREE_URL','Grade não deve carregar Three.js.');
need(resultPage,'arte_horizontal','Página da criação não carrega a arte horizontal.');
need(resultPage,'generatePreviews','Página da criação não gera duas vistas.');
need(resultPage,'Ver caneca em 360°','Página da criação não oferece 360°.');
reject(resultPage,'mockup_1','Página da criação ainda depende de mockups antigos.');

// PRODUÇÃO: interface/cadastro final são art-only e comandos continuam disponíveis.
const productionLoader=read('producao-v2/js/mug-make-native-openai-bridge.js');
const productionClient=read('producao-v2/js/mug-personalizer-v15-clean.js');
need(productionLoader,'./mug-personalizer-v15-clean.js','Produção não carrega controlador V15.');
need(productionLoader,'./mug-command-library-v1.js','Produção não carrega biblioteca de comandos.');
need(productionLoader,'./mug-command-library-restore-v3.js','Produção não carrega recuperação dos comandos.');
need(productionClient,'waitFinalProduct','Produção não acompanha finalização Accepted.');
need(productionClient,'artOnlyProduct','Produção não materializa produto art-only.');
need(productionClient,"p.mockup_1=''",'Produção não limpa mockups do cadastro final.');
need(productionClient,'renderResult(resultBox,art,catalog)','Produção não exibe somente arte horizontal no resultado.');
reject(productionClient,'window.fetch =','Produção não deve monkey-patchar fetch.');

// CANECA10: app interno termina com arte horizontal, sem exigir mockup no cadastro final.
if(fs.existsSync(path.join(root,'ceneca10')))failures.push('A pasta antiga ceneca10 ainda existe.');
const mobileIndex=read('caneca10/index.html');
const mobile=read('caneca10/app-v4-clean.js');
const mobileRecovery=read('caneca10/art-recovery-v1.js');
need(mobileIndex,'20260828-caneca10-art-only-v1','Caneca10 não está no build art-only.');
need(mobile,"action:'generate_mug_art'",'Caneca10 não gera arte inicial.');
need(mobile,"action:'finalize_mug_product'",'Caneca10 não finaliza a arte.');
need(mobile,'waitFinalProduct','Caneca10 não acompanha Accepted.');
need(mobile,'artOnlyProduct','Caneca10 não materializa produto art-only.');
need(mobile,"p.mockup_1=''",'Caneca10 não limpa mockups do produto final.');
need(mobileRecovery,'waitForArt','Caneca10 não recupera arte assíncrona.');

// CATÁLOGO: canecas públicas continuam disponíveis sob encomenda e preservam a arte horizontal.
const catalog=read('app-next/src/catalog.js');
const sync=read('scripts/sincronizar-produtos-home-firebase.mjs');
const stabilizer=read('scripts/estabilizar-catalogo-publico.mjs');
need(catalog,'isPublicMugModel','Catálogo do navegador não reconhece modelo público de caneca.');
need(catalog,'arte_horizontal','Catálogo não possui fallback para arte horizontal.');
need(sync,'isPublicMugModel','Sincronizador Firebase não reconhece modelo público de caneca.');
need(sync,'produto_sob_encomenda','Sincronizador não marca caneca sob encomenda.');
need(stabilizer,"situacao: madeToOrder ? 'A'",'Estabilizador não mantém modelo público disponível.');
need(stabilizer,'Math.max(1, integer(product.estoque))','Estabilizador não fornece disponibilidade virtual.');
need(stabilizer,'modelo_publico','Estabilizador remove flag modelo_publico.');
need(stabilizer,'arte_horizontal','Estabilizador remove arte horizontal.');

// CANECA PRINT: contrato operacional exige arte horizontal, independentemente de mídias legadas ainda presentes no cache antigo.
const printPage=read('caneca-print/index.html');
const printCache=JSON.parse(read('site/canecas-print.json'));
need(printPage,'arte_horizontal','Caneca Print não resolve arte_horizontal.');
const printable=Object.values(printCache||{}).filter(item=>item?.arte_horizontal);
if(!printable.length)failures.push('Cache do Caneca Print não contém nenhuma arte horizontal imprimível.');

if(failures.length){console.error(`Canecas ponta a ponta FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1);}
console.log('OK · Canecas ponta a ponta: arte horizontal única no fluxo interno/público e apresentação 3D V2 no site.');