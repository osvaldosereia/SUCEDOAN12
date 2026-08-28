import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const htmlPath=path.join(root,'caneca10','index.html');
const appPath=path.join(root,'caneca10','app-v4-clean.js');
const galleryPath=path.join(root,'caneca10','gallery-v4.js');
const recoveryPath=path.join(root,'caneca10','art-recovery-v1.js');
const transportPath=path.join(root,'shared','mug-make-fast-ack-v1.js');
const lightPath=path.join(root,'caneca10','light-v4.css');
const html=fs.readFileSync(htmlPath,'utf8');
const app=fs.readFileSync(appPath,'utf8');
const gallery=fs.readFileSync(galleryPath,'utf8');
const recovery=fs.readFileSync(recoveryPath,'utf8');
const transport=fs.readFileSync(transportPath,'utf8');
const light=fs.readFileSync(lightPath,'utf8');
const failures=[];
const requireText=(source,needle,message)=>{if(!source.includes(needle))failures.push(message);};
const forbidText=(source,needle,message)=>{if(source.includes(needle))failures.push(message);};

for(const file of [appPath,galleryPath,recoveryPath,transportPath]){const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(syntax.status!==0)failures.push(`${path.basename(file)} possui erro de sintaxe:\n${syntax.stderr||syntax.stdout}`);}

requireText(html,'Gerador interno de canecas','A tela não está identificada como gerador interno.');
requireText(html,'20260828-caneca10-art-only-v1','Caneca10 não usa a build de arte única atual.');
requireText(html,'Arte horizontal 2400 × 960','Resultado não identifica a arte horizontal.');
requireText(html,'../shared/mug-make-fast-ack-v1.js','Caneca10 não carrega o transporte compartilhado.');
requireText(html,'./art-recovery-v1.js','Caneca10 não carrega recuperação da arte.');
requireText(html,'./app-v4-clean.js','Caneca10 não carrega controlador principal.');
requireText(html,'./gallery-v4.js','Caneca10 não carrega galeria ativa.');
forbidText(html,'3 mockups','Interface ainda anuncia três mockups.');
forbidText(html,'id="mockup1"','Interface ainda possui mockup 1.');
forbidText(html,'id="mockup2"','Interface ainda possui mockup 2.');
forbidText(html,'id="mockup3"','Interface ainda possui mockup 3.');
forbidText(html,'mockupCarousel','Interface ainda possui carrossel de mockups.');

requireText(html,'id="modelsTrack"','Caneca10 não mostra modelos salvos.');
requireText(html,'id="createdList"','Caneca10 não mostra canecas criadas.');
requireText(html,'id="createdLoadMore"','Histórico não possui Carregar mais.');
requireText(light,'color-scheme:light','Caneca10 não está forçando tema claro.');

requireText(app,"const MAKE_WEBHOOK='https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4'",'Webhook oficial não está configurado.');
requireText(app,"action:'generate_mug_art'",'Gerador não chama generate_mug_art.');
requireText(app,"action:'analyze_mug_product'",'Catalogação visual não está integrada.');
requireText(app,'function artOnlyProduct','Caneca10 não possui normalização final somente para arte.');
requireText(app,"p.mockup_1=''",'Cadastro final não limpa mockup_1.');
requireText(app,"p.mockup_2=''",'Cadastro final não limpa mockup_2.');
requireText(app,"p.mockup_3=''",'Cadastro final não limpa mockup_3.');
requireText(app,'p.midias_admin=[art]','Mídias internas não foram reduzidas à arte horizontal.');
requireText(app,'function renderResult(art,catalog,key)','Resultado ainda parece depender de mockups.');
requireText(app,"$('#artResult').src=art",'Resultado não exibe a arte horizontal.');
requireText(app,"situacao:'I'",'Produto não é salvo inativo.');
requireText(app,'ativo:false','Produto não possui ativo=false.');
requireText(app,'modelo_caneca:true','Nova caneca não vira modelo interno.');
requireText(app,'modelo_publico:false','Nova caneca está sendo publicada automaticamente.');
requireText(app,'waitFinalProduct','Caneca10 não acompanha publicação assíncrona da arte.');
requireText(app,'FINAL_WAIT_MS=180000','Caneca10 não possui limite explícito de 3 minutos.');

// Compatibilidade temporária com o cenário Make atual: referências de mockup ainda podem ser enviadas até a próxima etapa do projeto.
requireText(app,'Compatibilidade temporária','Camada temporária de compatibilidade com o Make não está documentada no código.');
requireText(app,'mockup_left_base64','Compatibilidade temporária não envia a referência esquerda esperada pelo cenário atual.');
requireText(app,'mockup_right_base64','Compatibilidade temporária não envia a referência direita esperada pelo cenário atual.');
requireText(app,'mockup_center_base64','Compatibilidade temporária não envia a referência central esperada pelo cenário atual.');

requireText(recovery,"const RESULT_NODE = 'canecas/geracoes'",'Recovery não usa o nó temporário oficial.');
requireText(recovery,"inner?.action === 'generate_mug_art'",'Recovery não identifica generate_mug_art.');
requireText(gallery,'const PAGE_SIZE = 4','Galeria não inicia com 4 canecas.');
requireText(gallery,'async function loadMore()','Galeria não possui carregamento progressivo.');
requireText(gallery,"const ARCHIVE_NODE = 'produtos_excluidos'",'Exclusão não usa arquivo seguro do Produção.');

if(failures.length){console.error(`Caneca10 arte única FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1);}
console.log('Caneca10 OK: interface interna somente com arte horizontal, produto inativo e compatibilidade temporária com o Make legado.');
