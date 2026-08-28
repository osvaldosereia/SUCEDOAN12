import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files={
  productionBridge:'producao-v2/js/mug-make-native-openai-bridge.js',
  productionClient:'producao-v2/js/mug-personalizer-v16-2mockups.js',
  productionGallery:'producao-v2/js/mug-studio-gallery.js',
  publicRuntime:'app-next/src/mug-public-runtime-v6.js',
  publicClient:'app-next/src/mug-public-personalization-v7.js',
  publicContract:'app-next/src/mug-public-personalization-contract-v25.js',
  publicMedia:'app-next/src/product-media.js',
  publicThumbs:'app-next/src/mug-public-thumbnails-v2.js',
  mobileIndex:'caneca10/index.html',
  mobileClient:'caneca10/app-v5-2mockups.js',
  mobileRecovery:'caneca10/art-recovery-v1.js',
  print:'caneca-print/index.html',
  sharedTransport:'shared/mug-make-fast-ack-v1.js',
};
const src=Object.fromEntries(Object.entries(files).map(([key,path])=>[key,fs.readFileSync(path,'utf8')]));
const failures=[];
const need=(key,token,message)=>{if(!src[key].includes(token))failures.push(message)};
const reject=(key,token,message)=>{if(src[key].includes(token))failures.push(message)};
for(const path of Object.values(files).filter(path=>path.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(r.status!==0)failures.push(`${path}: ${r.stderr||r.stdout}`)}
const hook='cl3r1f56r9txezvltkkwlsspmnja6sw4';

// Produção: arte 2400x960 + exatamente dois mockups, sem vídeo automático.
need('productionBridge','./mug-personalizer-v16-2mockups.js','Produção não carrega o controlador de 2 mockups.');
need('productionBridge','./mug-make-art-recovery-v22.js','Produção não carrega recovery da arte.');
need('productionBridge','./mug-force-low-quality-v23.js','Produção não carrega trava LOW.');
reject('productionBridge','mug-video-generator-v1.js','Produção ainda carrega gerador automático de vídeo.');
reject('productionBridge','mug-video-result-player','Produção ainda carrega player do vídeo gerado.');
need('productionClient',hook,'Produção não usa o webhook oficial.');
need('productionClient',"action:'generate_mug_art'",'Produção não gera arte horizontal.');
need('productionClient',"action:'finalize_mug_product'",'Produção não finaliza a caneca.');
need('productionClient','mockup_1_url','Produção não reconhece mockup 1.');
need('productionClient','mockup_2_url','Produção não reconhece mockup 2.');
need('productionClient',"mockup_3:''",'Produção deve manter mockup 3 vazio no novo contrato.');
need('productionClient','imagens:[PH.m1,PH.m2]','Produção deve cadastrar exatamente 2 mockups.');
need('productionClient',"quality:'low'",'Produção não fixa qualidade LOW.');
need('productionClient','arte_horizontal','Produção não persiste arte horizontal.');
need('productionGallery',"admin-v2-products-invalidated",'Galeria do Produção não atualiza após criação.');

// Site público: 2 mockups + arte + Short manual; sem 3D ativo.
const transportPos=src.publicRuntime.indexOf('../../shared/mug-make-fast-ack-v1.js');
const clientPos=src.publicRuntime.indexOf('./mug-public-personalization-v7.js');
if(transportPos<0||clientPos<=transportPos)failures.push('Site público deve carregar transporte antes do personalizador V7.');
need('publicRuntime','mug-public-personalization-contract-v25.js','Site público perdeu contrato/recovery da personalização.');
reject('publicRuntime','mug-public-3d-v2.js','Runtime público ainda carrega o 3D antigo.');
need('publicClient',"action:'personalize_mug_model'",'Site público não personaliza o modelo.');
need('publicClient',"action:'finalize_mug_product'",'Site público não finaliza a criação.');
need('publicClient','mockup_left_base64','Site público não envia a referência esquerda.');
need('publicClient','mockup_right_base64','Site público não envia a referência direita.');
reject('publicClient','mockup_center_base64','Site público ainda envia terceiro recorte.');
reject('publicClient','mockup_3_url','Site público ainda espera terceiro mockup.');
need('publicContract',"payload.quality = 'low'",'Contrato público não fixa LOW.');
need('publicMedia','raw.mockup_1,raw.mockup_2','Galeria pública não prioriza os dois mockups.');
need('publicMedia','slice(0,2)','Galeria de caneca deve limitar a 2 mockups.');
need('publicMedia',"parts[marker]==='shorts'",'Site não reconhece URL de YouTube Shorts.');
need('publicMedia','aspect-ratio:9/16','Short não usa proporção vertical 9:16.');
need('publicMedia','youtube-nocookie.com/embed','Player não usa embed do YouTube.');
need('publicMedia','playsinline=1','Player mobile não usa playsinline.');
need('publicMedia','html.mug-product-route .product-detail-media>img{display:block!important}','CSS antigo do 3D ainda pode esconder a galeria.');

// Caneca10: mesmo contrato do Produção.
const mobileTransportPos=src.mobileIndex.indexOf('../shared/mug-make-fast-ack-v1.js');
const mobileRecoveryPos=src.mobileIndex.indexOf('./art-recovery-v1.js');
const mobileAppPos=src.mobileIndex.indexOf('./app-v5-2mockups.js');
const mobileGalleryPos=src.mobileIndex.indexOf('./gallery-v4.js');
if(!(mobileTransportPos>=0&&mobileRecoveryPos>mobileTransportPos&&mobileAppPos>mobileRecoveryPos&&mobileGalleryPos>mobileAppPos))failures.push('Caneca10 deve carregar transporte -> recovery -> app 2 mockups -> galeria.');
need('mobileClient',hook,'Caneca10 não usa o mesmo webhook do Produção.');
need('mobileClient','mockup_1_url','Caneca10 não reconhece mockup 1.');
need('mobileClient','mockup_2_url','Caneca10 não reconhece mockup 2.');
need('mobileClient',"mockup_3:''",'Caneca10 deve manter terceiro mockup vazio.');
need('mobileClient',"quality:'low'",'Caneca10 não força LOW.');
need('mobileRecovery',"RESULT_NODE = 'canecas/geracoes'",'Caneca10 perdeu recovery Firebase.');

// Impressão: nunca usa mockup como arte de impressão.
need('print','arte_horizontal','CanecaPrint não usa arte_horizontal.');
need('sharedTransport',"inner.quality = 'low'",'Transporte compartilhado não força LOW.');
if(fs.existsSync('ceneca10'))failures.push('A pasta ceneca10 antiga ainda existe.');

if(failures.length){console.error(`Stack atual de canecas FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('Stack atual OK: Produção e Caneca10 geram 2 mockups + arte; site mostra 2 mockups + arte + Short manual; CanecaPrint imprime arte_horizontal.');
