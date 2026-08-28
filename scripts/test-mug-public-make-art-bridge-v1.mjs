import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const bridgeFile='app-next/src/mug-public-personalization-make-bridge-v1.js';
const runtimeFile='app-next/src/mug-public-runtime-v6.js';
const [bridge,runtime]=await Promise.all([readFile(bridgeFile,'utf8'),readFile(runtimeFile,'utf8')]);
for(const file of [bridgeFile,runtimeFile]){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout||`Erro de sintaxe em ${file}`);}
assert.match(runtime,/mug-public-personalization-contract-v25\.js/);
assert.match(runtime,/mug-public-personalization-make-bridge-v1\.js/);
assert.match(runtime,/mug-public-personalization-v6\.js/);
assert.ok(runtime.indexOf('mug-public-personalization-contract-v25.js') < runtime.indexOf('mug-public-personalization-make-bridge-v1.js'),'contrato deve carregar antes do bridge');
assert.ok(runtime.indexOf('mug-public-personalization-make-bridge-v1.js') < runtime.indexOf('mug-public-personalization-v6.js'),'bridge deve carregar antes do controlador V6');
assert.match(bridge,/inner\?\.action==='personalize_mug_model'/,'bridge não intercepta personalização pública');
assert.match(bridge,/action:'generate_mug_art'/,'bridge não converte para a ação art-only suportada pelo Make');
assert.match(bridge,/image_base64:board/,'bridge não envia o quadro visual como referência única');
assert.match(bridge,/prompt_art:prompt/,'bridge não constrói prompt art-only');
assert.match(bridge,/MODELO BASE/,'quadro não identifica a arte-base');
assert.match(bridge,/REFERÊNCIAS DO CLIENTE/,'quadro não inclui referências do cliente');
assert.match(bridge,/arte_horizontal/,'bridge não procura a arte horizontal do modelo');
assert.match(bridge,/2400 × 960/,'prompt não fixa a proporção final');
assert.match(bridge,/não desenhe caneca/i,'prompt não proíbe mockup na arte');
assert.doesNotMatch(bridge,/mockup_left_base64|mockup_right_base64|mockup_center_base64/,'bridge não deve recriar o fluxo de três mockups');
console.log('OK · Site público converte personalização em generate_mug_art com referência composta e sem mockups.');