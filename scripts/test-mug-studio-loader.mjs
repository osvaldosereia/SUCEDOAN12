import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT=process.cwd(),failures=[];
const read=relative=>{const file=path.join(ROOT,relative);if(!existsSync(file)){failures.push(`Arquivo ausente: ${relative}`);return''}return readFileSync(file,'utf8')};
const need=(source,marker,message)=>{if(!source.includes(marker))failures.push(message)};
const reject=(source,marker,message)=>{if(source.includes(marker))failures.push(message)};
const syntaxFiles=[
 'producao-v2/js/mug-make-native-openai-bridge.js','producao-v2/js/mug-personalizer-v16-2mockups.js','producao-v2/js/mug-make-art-recovery-v22.js','producao-v2/js/mug-force-low-quality-v23.js','producao-v2/js/mug-art-command-compat-v2.js','producao-v2/js/mug-studio-gallery.js','producao-v2/js/mug-model-carousel-v10.js','producao-v2/js/mug-command-library-v1.js','producao-v2/js/mug-command-library-compact-v2.js','producao-v2/js/mug-command-library-restore-v3.js','producao-v2/js/mug-command-layout-v4-force.js','producao-v2/js/mug-config-compact-v4-1.js','producao-v2/js/mug-phrase-picker-v2.js'
];
for(const file of syntaxFiles){if(!existsSync(path.join(ROOT,file))){failures.push(`Arquivo ausente: ${file}`);continue}const check=spawnSync(process.execPath,['--check',file],{cwd:ROOT,encoding:'utf8'});if(check.status!==0)failures.push(`Erro de sintaxe em ${file}: ${check.stderr||check.stdout}`)}

const productive=read('producao-v2/admin-produtivo.html');
need(productive,"params.get('admin_build')",'Admin produtivo não recebe a build ativa.');
need(productive,'20260828-canecas-2mockups-v25-final','Admin produtivo não está na release de 2 mockups.');
need(productive,'./js/mug-make-native-openai-bridge.js','Admin produtivo não carrega o bridge de canecas.');

const bridge=read('producao-v2/js/mug-make-native-openai-bridge.js');
need(bridge,'meta[name="admin-save-build"]','Bridge não herda a build ativa.');
for(const moduleName of ['./mug-make-art-recovery-v22.js','./mug-personalizer-v16-2mockups.js','./mug-art-command-compat-v2.js','./mug-force-low-quality-v23.js','./mug-studio-gallery.js','./mug-command-library-v1.js','./mug-command-library-compact-v2.js','./mug-command-library-restore-v3.js','./mug-command-layout-v4-force.js','./mug-config-compact-v4-1.js','./mug-model-carousel-v10.js'])need(bridge,moduleName,`Bridge não carrega ${moduleName}.`);
need(bridge,'for (const path of MODULES) await import(withBuild(path));','Bridge não carrega módulos sequencialmente.');
reject(bridge,'mug-video-generator-v1.js','Bridge ainda carrega gerador automático de vídeo.');
reject(bridge,'mug-video-result-player','Bridge ainda carrega player de vídeo gerado.');

const personalizer=read('producao-v2/js/mug-personalizer-v16-2mockups.js');
for(const marker of ["const BUILD='20260828-producao-canecas-2mockups-v2'",'MASTER_WIDTH=2400,MASTER_HEIGHT=960',"PRINT_LABEL='24 × 9,5 cm'","MUG_CATEGORY='Caneca de Porcelana'",'MUG_PRICE=24.90',"action:'generate_mug_art'","action:'finalize_mug_product'",'mockup_1_url','mockup_2_url','imagens:[PH.m1,PH.m2]',"mockup_3:''",'arte_horizontal',"quality:'low'"])need(personalizer,marker,`Controlador de 2 mockups incompleto: ${marker}`);
reject(personalizer,'mockup_center_base64','Produção ainda envia referência de terceiro mockup.');
need(personalizer,'renderResult','Produção não apresenta o resultado gerado.');

const recovery=read('producao-v2/js/mug-make-art-recovery-v22.js'),forceLow=read('producao-v2/js/mug-force-low-quality-v23.js');
need(recovery,'canecas/geracoes','Recovery não consulta canecas/geracoes.');
need(recovery,'generate_mug_art','Recovery não cobre a arte inicial.');
need(forceLow,"inner.quality = 'low'",'Transporte não fixa LOW.');
need(forceLow,'finalize_mug_product','LOW guard não cobre os mockups.');

const gallery=read('producao-v2/js/mug-studio-gallery.js');
need(gallery,'const RECENT_LIMIT = 6;','Histórico rápido não está limitado a 6 canecas.');
need(gallery,"const MODELS_NODE = 'canecas/modelos_criacao';",'Modelos não possuem nó dedicado.');
need(gallery,'data-use-mug-model=','Galeria não permite reutilizar modelo.');
need(gallery,'archiveProduct','Exclusão da galeria não usa arquivamento seguro.');

const layout=read('producao-v2/js/mug-command-layout-v4-force.js');
need(layout,'minmax(0,4fr)','Layout não mantém coluna ampla de comandos.');
const phrasePicker=read('producao-v2/js/mug-phrase-picker-v2.js');
need(phrasePicker,'const PAGE_SIZE = 20;','Seletor de frases não limita itens.');
need(phrasePicker,"cache: 'force-cache'",'Seletor de frases não aproveita cache.');

if(failures.length){console.error(`Criador de Canecas atual: ${failures.length} falha(s).`);failures.forEach((f,i)=>console.error(`${i+1}. ${f}`));process.exit(1)}
console.log('Criador de Canecas validado: Produção com arte 2400×960 + 2 mockups LOW, recovery e ferramentas atuais; sem vídeo automático.');
