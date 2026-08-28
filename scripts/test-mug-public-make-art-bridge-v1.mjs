import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const bridgeFile='app-next/src/mug-public-personalization-make-bridge-v1.js';
const runtimeFile='app-next/src/mug-public-runtime-v6.js';
const clientFile='app-next/src/mug-public-personalization-v7.js';
const contractFile='app-next/src/mug-public-personalization-contract-v25.js';
const [bridge,runtime,client,contract]=await Promise.all([
  readFile(bridgeFile,'utf8'),readFile(runtimeFile,'utf8'),readFile(clientFile,'utf8'),readFile(contractFile,'utf8')
]);
for(const file of [bridgeFile,runtimeFile,clientFile,contractFile]){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout||`Erro de sintaxe em ${file}`);
}

assert.match(runtime,/mug-public-personalization-contract-v25\.js/,'runtime perdeu contrato de recovery');
assert.match(runtime,/mug-public-personalization-v7\.js/,'runtime perdeu controlador atual');
assert.doesNotMatch(runtime,/mug-public-personalization-make-bridge-v1\.js/,'runtime ainda carrega bridge que desviava a ação');

// Contrato público: todos os campos configurados como públicos precisam ser dinâmicos.
assert.match(client,/Array\.isArray\(config\.campos\)\?config\.campos:\[\]/,'cliente deixou de ler campos configuráveis');
assert.match(client,/filter\(f=>f&&f\.publico!==false\)/,'cliente deixou de filtrar os campos públicos ativos');
assert.match(client,/for\(const field of normalizeFields\(STATE\.config\|\|\{\}\)\)/,'coleta não percorre mais todos os campos ativos');
assert.match(client,/values\.push\(\{id:field\.id,label:field\.label,type:field\.tipo,value/,'coleta perdeu id, tipo ou valor do campo');

// Tipos de campo atualmente suportados pelo formulário público.
for(const tipo of ["'foto'","'texto_longo'","'select'","'data'","'numero'","'cor'"]){
  assert.ok(client.includes(`field.tipo===${tipo}`),`formulário perdeu suporte ao tipo ${tipo}`);
}

// Contrato enviado ao Make: ação correta, todos os valores e fotos.
assert.match(client,/action:'personalize_mug_model'/,'cliente não chama personalize_mug_model');
assert.match(client,/fields_json:JSON\.stringify\(Object\.fromEntries\(result\.values\.map\(item=>\[item\.id,item\.value\]\)\)\)/,'cliente não envia todos os campos em fields_json por id');
assert.match(client,/images_json:JSON\.stringify\(photos\)/,'cliente não envia as fotos escolhidas em images_json');
assert.match(client,/image_base64:photos\[0\]\?\.image_base64\|\|''/,'cliente não envia a primeira foto em image_base64');
assert.match(client,/photos\.push\(\{id:photo\.id,image_base64:/,'fotos perderam o id do campo de origem');

assert.match(bridge,/direct-pass-through/,'bridge legado não está neutralizado');
assert.match(bridge,/nativeFetch\(input,init\)/,'bridge legado não está em pass-through');
assert.doesNotMatch(bridge,/action:'generate_mug_art'/,'bridge voltou a converter personalização para generate_mug_art');
assert.doesNotMatch(bridge,/image_base64:board|prompt_art:prompt/,'bridge ainda monta quadro art-only');

assert.match(contract,/payload\.action === 'personalize_mug_model'/,'contrato não intercepta personalização direta');
assert.match(contract,/payload\.action === 'generate_mug_art' && payload\.personalization_action === 'personalize_mug_model'/,'contrato não protege chamadas antigas convertidas');
assert.match(contract,/waitForPersonalizedArt/,'contrato perdeu recovery Firebase');

console.log('OK · Site público envia todos os campos personalizados por id em fields_json, preserva fotos e mantém personalize_mug_model + recovery.');
