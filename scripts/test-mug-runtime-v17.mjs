import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files={root:'index.html',runtime:'app-next/src/mug-public-runtime-v6.js',ux:'app-next/src/mug-public-ux-v1.js',media:'app-next/src/product-media.js',performance:'app-next/src/image-performance.js',client:'app-next/src/mug-public-personalization-v7.js',contract:'app-next/src/mug-public-personalization-contract-v25.js',result:'caneca10/resultado.html'};
const src=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,fs.readFileSync(file,'utf8')]));
const failures=[];
const need=(key,token,message)=>{if(!src[key].includes(token))failures.push(message)};
const reject=(key,token,message)=>{if(src[key].includes(token))failures.push(message)};
for(const file of Object.values(files).filter(file=>file.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)failures.push(`${file}: ${r.stderr||r.stdout}`)}

// Shell público atual: personalização ativa e nenhum loader/placeholder Three.js.
need('root','2026-08-28-mug-active-personalization-v2','index.html não declara a release ativa de personalização.');
need('root','image-performance.js?v=20260828-2mockups-shorts-v2-final','index.html não força cache da mídia atual.');
need('root','mug-public-runtime-v6.js?v=20260828-active-personalization-v24','index.html não carrega o runtime público atual.');
need('root','da_mug_active_personalization_v2_20260828','Migração de cache da personalização ativa não está configurada.');
reject('root','three@','index.html ainda carrega Three.js.');
reject('root','type="importmap"','index.html ainda possui importmap legado do 3D.');
reject('root','Preparando visualização da caneca','index.html ainda esconde a galeria aguardando 3D.');

// Runtime: biblioteca/favoritos + thumbnails + UX + personalização direta, sem 3D e sem bridge que desviava para generate_mug_art.
need('runtime',"const BUILD = '20260828-site-mug-runtime-v26-direct-personalize'",'Runtime público não está na release de personalização direta.');
need('runtime','customer-favorites-v27.js','Runtime perdeu Favoritos/Minhas canecas.');
need('runtime','customer-mug-media-v28.js','Runtime perdeu capa das criações.');
need('runtime','mug-public-thumbnails-v2.js','Runtime perdeu miniaturas leves.');
need('runtime','mug-public-ux-v1.js','Runtime não carrega a camada visual profissional.');
need('runtime','mug-public-personalization-contract-v25.js','Runtime perdeu contrato/recovery.');
need('runtime','mug-public-personalization-v7.js','Runtime não carrega personalização de 2 mockups.');
reject('runtime','mug-public-personalization-make-bridge-v1.js','Runtime ainda desvia personalize_mug_model para generate_mug_art.');
reject('runtime','mug-public-3d-v2.js','Runtime ainda carrega visualizador 3D.');

// UX profissional: cards, galeria responsiva e formulário com hierarquia clara.
need('ux','mug-card-polish','UX não diferencia cards de caneca.');
need('ux','Personalizável','Card não identifica a caneca como personalizável.');
need('ux','mug-gallery-polish','UX não reorganiza a galeria da caneca.');
need('ux','grid-template-columns:86px minmax(0,1fr)','Desktop não posiciona miniaturas ao lado da imagem principal.');
need('ux','flex-basis:70px','Mobile não usa miniaturas compactas.');
need('ux','mug-public-steps','Formulário não apresenta etapas de personalização.');
need('ux','Você confere antes de comprar.','Formulário perdeu mensagem de confiança.');
need('ux','min-height:56px','CTA mobile não mantém alvo de toque confortável.');
need('ux','prefers-reduced-motion','UX não respeita redução de movimento.');

// Mídia do produto: 2 vistas, arte horizontal e Short sob demanda.
need('media','raw.mockup_1,raw.mockup_2','Galeria não prioriza os dois mockups.');
need('media','slice(0,2)','Galeria da caneca não limita a duas imagens.');
need('media','Arte da caneca','Arte horizontal não possui bloco próprio.');
need('media',"parts[marker]==='shorts'",'URL de Shorts não é reconhecida.');
need('media','aspect-ratio:9/16','Short não usa 9:16.');
need('media','product-video-poster','Short não usa poster antes do player.');
need('media','youtube-nocookie.com/embed','Short não usa embed do YouTube.');
need('media','playsinline=1','Player mobile não usa playsinline.');
need('media','display:block!important','Galeria não neutraliza CSS legado que escondia as imagens.');
need('performance','product-media.js?v=20260828-2mockups-shorts-v2-final','image-performance não invalida cache da mídia atual.');

// Personalização: arte + exatamente dois mockups, LOW e recovery.
need('client',"action:'personalize_mug_model'",'Personalização não envia modelo + dados ao Make.');
need('client',"action:'finalize_mug_product'",'Personalização não finaliza os dois mockups.');
need('client','images_json:JSON.stringify(photos)','Personalização não envia as fotos escolhidas pelo cliente.');
need('client',"image_base64:photos[0]?.image_base64||''",'Personalização não envia a primeira foto como image_base64.');
need('client','mockup_left_base64','Personalização não envia recorte esquerdo.');
need('client','mockup_right_base64','Personalização não envia recorte direito.');
need('client','mockup_1_url','Personalização não recebe mockup 1.');
need('client','mockup_2_url','Personalização não recebe mockup 2.');
reject('client','mockup_center_base64','Personalização ainda gera terceiro recorte.');
reject('client','mockup_3_url','Personalização ainda depende de terceiro mockup.');
need('client',"quality:'low'",'Personalização não declara LOW.');
need('contract',"payload.quality = 'low'",'Contrato não força LOW.');
need('contract','firstCustomerPhoto','Contrato não repassa a foto do cliente.');
need('contract','fallbackModelImage','Contrato não usa arte horizontal do modelo como fallback.');
need('contract',"RESULT_NODE = 'canecas/geracoes'",'Contrato perdeu recuperação assíncrona pelo Firebase.');
need('contract','waitForPersonalizedArt','Contrato não aguarda arte após timeout/falha de rede.');
need('contract',"payload.action === 'generate_mug_art' && payload.personalization_action === 'personalize_mug_model'",'Contrato não protege abas antigas que ainda converteram a personalização.');

need('result','mockup_1','Página da criação não mostra mockup 1.');
need('result','mockup_2','Página da criação não mostra mockup 2.');
need('result','arte_horizontal','Página da criação não mostra arte horizontal.');
reject('result','mockup_3','Página da criação ainda depende de terceiro mockup.');
reject('result','360°','Página da criação ainda oferece 3D/360.');

if(failures.length){console.error(`Runtime público de canecas FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('Runtime público OK: personalização direta do modelo + foto do cliente, recovery Firebase, 2 mockups + arte horizontal + Short manual; sem desvio para generate_mug_art.');
