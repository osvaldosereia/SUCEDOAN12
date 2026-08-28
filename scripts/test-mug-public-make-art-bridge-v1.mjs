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
assert.match(client,/action:'personalize_mug_model'/,'cliente não chama personalize_mug_model');
assert.match(client,/images_json:JSON\.stringify\(photos\)/,'cliente não envia as fotos escolhidas');
assert.match(client,/image_base64:photos\[0\]\?\.image_base64\|\|''/,'cliente não envia a primeira foto em image_base64');

assert.match(bridge,/direct-pass-through/,'bridge legado não está neutralizado');
assert.match(bridge,/nativeFetch\(input,init\)/,'bridge legado não está em pass-through');
assert.doesNotMatch(bridge,/action:'generate_mug_art'/,'bridge voltou a converter personalização para generate_mug_art');
assert.doesNotMatch(bridge,/image_base64:board|prompt_art:prompt/,'bridge ainda monta quadro art-only');

assert.match(contract,/payload\.action === 'personalize_mug_model'/,'contrato não intercepta personalização direta');
assert.match(contract,/payload\.action === 'generate_mug_art' && payload\.personalization_action === 'personalize_mug_model'/,'contrato não protege chamadas antigas convertidas');
assert.match(contract,/waitForPersonalizedArt/,'contrato perdeu recovery Firebase');

console.log('OK · Site público mantém personalize_mug_model intacto; bridge legado está neutralizado e recovery continua ativo.');
