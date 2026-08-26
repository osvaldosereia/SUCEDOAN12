import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = {
  productionGuard:'producao-v2/js/mug-make-client-guard-v14.js',
  productionBridge:'producao-v2/js/mug-make-native-openai-bridge.js',
  publicGuard:'app-next/src/mug-make-client-guard-v3.js',
  publicConfig:'app-next/src/config.js',
  publicClient:'app-next/src/mug-public-personalization-v2.js',
  mobileGuard:'ceneca10/make-client-guard-v5.js',
  mobileIndex:'ceneca10/index.html',
  mobileClient:'ceneca10/app-v2.js'
};
const src = Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.readFileSync(p,'utf8')]));
const failures=[];
const need=(k,s,m)=>{ if(!src[k].includes(s)) failures.push(m); };
for(const p of [files.productionGuard,files.publicGuard,files.mobileGuard,files.publicConfig,files.publicClient,files.mobileClient]){
  const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  if(r.status!==0) failures.push(`${p}: ${r.stderr||r.stdout}`);
}
const hook='cl3r1f56r9txezvltkkwlsspmnja6sw4';
need('productionGuard',hook,'Produção não usa o webhook oficial.');
need('publicGuard',hook,'Site público não usa o webhook oficial.');
need('mobileGuard',hook,'Caneca10 não usa o webhook oficial.');
need('productionBridge','mug-make-client-guard-v14.js','Produção não carrega o guard antes do gerador.');
need('publicConfig','mug-make-client-guard-v3.js','Site público não carrega o guard.');
need('mobileIndex','make-client-guard-v5.js','Caneca10 não carrega o guard.');
for(const k of ['productionGuard','publicGuard','mobileGuard']){
  need(k,'personalize_mug_model',`${k} não reconhece personalização.`);
  need(k,'payload.image_base64',`${k} não promove foto do cliente.`);
  need(k,'Automação Make falhou',`${k} não normaliza resposta não-JSON.`);
  need(k,'finalize_mug_product',`${k} não reconhece a etapa final.`);
  need(k,'waitFinalProduct',`${k} não possui recuperação assíncrona da finalização.`);
  need(k,'accepted',`${k} não reconhece HTTP 200 Accepted.`);
  need(k,'arte_horizontal',`${k} não procura a arte final no Firebase.`);
  need(k,'mockup_1',`${k} não procura mockup 1 no Firebase.`);
  need(k,'mockup_2',`${k} não procura mockup 2 no Firebase.`);
  need(k,'mockup_3',`${k} não procura mockup 3 no Firebase.`);
  need(k,"cache:'no-store'",`${k} pode ler produto final em cache durante polling.`);
}
need('publicClient',"action:'personalize_mug_model'",'Site público não chama personalize_mug_model.');
need('publicClient',"action:'finalize_mug_product'",'Site público não finaliza com 3 mockups.');
need('mobileClient',"action: 'generate_mug_art'",'Caneca10 não gera arte.');
need('mobileClient',"action: 'finalize_mug_product'",'Caneca10 não finaliza caneca.');
if(failures.length){ console.error(failures.join('\n')); process.exit(1); }
console.log('Stack de canecas validado: HTTP 200 Accepted é recuperado via polling do Firebase nos três geradores.');
