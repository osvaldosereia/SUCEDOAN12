import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files={bridge:'producao-v2/js/mug-make-native-openai-bridge.js',recovery:'producao-v2/js/mug-make-art-recovery-v22.js',admin:'producao-v2/admin-produtivo.html'};
const src=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,fs.readFileSync(file,'utf8')]));
const failures=[];
const need=(key,token,message)=>{if(!src[key].includes(token))failures.push(message)};
const reject=(key,token,message)=>{if(src[key].includes(token))failures.push(message)};
for(const file of [files.bridge,files.recovery]){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)failures.push(`${file}: ${r.stderr||r.stdout}`)}
need('bridge',"'./mug-make-art-recovery-v22.js'",'Bridge não carrega recovery da arte.');
const recoveryPos=src.bridge.indexOf('./mug-make-art-recovery-v22.js');
const clientPos=src.bridge.indexOf('./mug-personalizer-v16-2mockups.js');
if(recoveryPos<0||clientPos<=recoveryPos)failures.push('Recovery da arte precisa ser carregado antes do controlador de 2 mockups.');
need('recovery',"inner?.action === 'generate_mug_art'",'Recovery não está restrito à geração da arte.');
need('recovery',"RESULT_NODE = 'canecas/geracoes'",'Nó temporário de recovery não está definido.');
need('recovery','waitForArt(payload)','Recovery não acompanha o Firebase após queda da resposta síncrona.');
need('recovery','art_source_base64','Recovery não aceita arte em Base64.');
need('recovery','art_source_url','Recovery não aceita arte por URL.');
need('recovery',"cache: 'no-store'",'Polling pode ler cache antigo.');
reject('recovery','finalize_mug_product','Recovery da etapa de arte não deve interceptar a finalização dos mockups.');
need('admin','20260828-canecas-2mockups-v25-final','Admin não invalida cache para a release de 2 mockups.');
if(failures.length){console.error(`Recuperação de arte V22 FALHOU (${failures.length}):\n- ${failures.join('\n- ')}`);process.exit(1)}
console.log('Recovery OK: generate_mug_art sobrevive ao timeout via Firebase antes da finalização de arte + 2 mockups.');
