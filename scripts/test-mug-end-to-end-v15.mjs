import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd(),failures=[];
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(source,token,message)=>{if(!source.includes(token))failures.push(message)};
const reject=(source,token,message)=>{if(source.includes(token))failures.push(message)};
const syntaxFiles=[
 'app-next/src/mug-public-runtime-v6.js','app-next/src/mug-public-personalization-v7.js','app-next/src/mug-public-personalization-contract-v25.js','app-next/src/product-media.js','app-next/src/mug-public-thumbnails-v2.js','app-next/src/config.js',
 'caneca10/app-v5-2mockups.js','caneca10/art-recovery-v1.js','producao-v2/js/mug-personalizer-v16-2mockups.js','producao-v2/js/mug-make-native-openai-bridge.js','scripts/estabilizar-catalogo-publico.mjs','scripts/filtrar-produtos-home-publicos.mjs'
];
for(const file of syntaxFiles){const c=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});if(c.status!==0)failures.push(`${file}: ${c.stderr||c.stdout}`)}

const rootIndex=read('index.html');
const runtime=read('app-next/src/mug-public-runtime-v6.js');
const publicClient=read('app-next/src/mug-public-personalization-v7.js');
const contract=read('app-next/src/mug-public-personalization-contract-v25.js');
const media=read('app-next/src/product-media.js');
const resultPage=read('caneca10/resultado.html');
const config=read('app-next/src/config.js');
need(rootIndex,'mug-public-runtime-v6.js','Raiz não carrega runtime público de canecas.');
need(runtime,'./mug-public-personalization-v7.js','Runtime público não carrega personalizador de 2 mockups.');
need(runtime,'./mug-public-thumbnails-v2.js','Runtime público não carrega miniaturas leves.');
reject(runtime,'mug-public-3d-v2.js','Runtime público ainda carrega 3D legado.');
reject(config,'queueMicrotask','config.js ainda executa carregamento lateral de canecas.');
need(contract,"payload.quality = 'low'",'Contrato público não fixa LOW.');
need(contract,'fallbackModelImage','Contrato público não usa arte oficial como fallback.');
need(publicClient,"action:'personalize_mug_model'",'Site não chama personalização.');
need(publicClient,"action:'finalize_mug_product'",'Site não finaliza criação.');
need(publicClient','mockup_left_base64','Site não envia referência esquerda para mockup.');
need(publicClient','mockup_right_base64','Site não envia referência direita para mockup.');
reject(publicClient,'mockup_center_base64','Site ainda envia terceiro recorte.');
reject(publicClient,'mockup_3_url','Site ainda espera terceiro mockup.');
need(media,'raw.mockup_1,raw.mockup_2','Página do produto não prioriza os dois mockups.');
need(media,'slice(0,2)','Página da caneca não limita galeria a dois mockups.');
need(media,'Arte da caneca','Página não mostra arte horizontal em bloco próprio.');
need(media,"parts[marker]==='shorts'",'Página não reconhece Shorts.');
need(media,'aspect-ratio:9/16','Short não usa 9:16.');
need(media,'youtube-nocookie.com/embed','Página não incorpora YouTube sob demanda.');
need(media,'product-video-poster','Vídeo não usa poster antes do iframe.');
need(media,'display:block!important','CSS antigo pode continuar escondendo os mockups.');
need(resultPage,'mockup_1','Página da criação não lê mockup 1.');
need(resultPage,'mockup_2','Página da criação não lê mockup 2.');
need(resultPage,'arte_horizontal','Página da criação não lê arte horizontal.');
reject(resultPage,'mockup_3','Página da criação ainda depende de terceiro mockup.');
reject(resultPage,'360°','Página da criação ainda oferece 3D/360 antigo.');

const productionLoader=read('producao-v2/js/mug-make-native-openai-bridge.js');
const production=read('producao-v2/js/mug-personalizer-v16-2mockups.js');
need(productionLoader,'./mug-personalizer-v16-2mockups.js','Produção não carrega controlador atual.');
reject(productionLoader,'mug-video-generator-v1.js','Produção ainda carrega vídeo automático.');
need(production,'mockup_1_url','Produção não aguarda mockup 1.');
need(production,'mockup_2_url','Produção não aguarda mockup 2.');
need(production,'imagens:[PH.m1,PH.m2]','Produção não salva exatamente dois mockups.');
need(production,'arte_horizontal','Produção não salva arte horizontal.');
need(production,"quality:'low'",'Produção não usa LOW.');

if(fs.existsSync(path.join(root,'ceneca10')))failures.push('Pasta antiga ceneca10 ainda existe.');
const mobileIndex=read('caneca10/index.html'),mobile=read('caneca10/app-v5-2mockups.js'),recovery=read('caneca10/art-recovery-v1.js');
need(mobileIndex,'20260828-caneca10-2mockups-v2','Caneca10 não está no build de 2 mockups.');
need(mobile,'mockup_1_url','Caneca10 não reconhece mockup 1.');
need(mobile,'mockup_2_url','Caneca10 não reconhece mockup 2.');
need(mobile,'arte_horizontal','Caneca10 não mantém arte horizontal.');
need(recovery,'waitForArt','Caneca10 não recupera arte assíncrona.');

const catalog=read('app-next/src/catalog.js'),sync=read('scripts/sincronizar-produtos-home-firebase.mjs'),stabilizer=read('scripts/estabilizar-catalogo-publico.mjs');
need(catalog,'isPublicMugModel','Catálogo não reconhece modelo público de caneca.');
need(catalog,'arte_horizontal','Catálogo não preserva arte horizontal.');
need(sync,'isPublicMugModel','Sincronizador não reconhece modelo público.');
need(stabilizer,'modelo_publico','Estabilizador não preserva modelo_publico.');

const printPage=read('caneca-print/index.html');
need(printPage,'arte_horizontal','CanecaPrint não resolve arte_horizontal.');

if(failures.length){console.error(`Canecas ponta a ponta FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('OK · Canecas ponta a ponta: 2 mockups + arte horizontal; Short manual no site; impressão usa somente arte_horizontal.');
