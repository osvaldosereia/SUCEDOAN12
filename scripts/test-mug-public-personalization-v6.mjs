import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const personalizationFile='app-next/src/mug-public-personalization-v6.js';
const runtimeFile='app-next/src/mug-public-runtime-v6.js';
const resultFile='caneca10/resultado.html';
const [personalization,runtime,result]=await Promise.all([readFile(personalizationFile,'utf8'),readFile(runtimeFile,'utf8'),readFile(resultFile,'utf8')]);
for(const file of [personalizationFile,runtimeFile]){const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(check.status,0,check.stderr||check.stdout||`Erro de sintaxe em ${file}`);}
assert.match(runtime,/mug-public-personalization-v6\.js/,'runtime não carrega personalização V6');
assert.doesNotMatch(runtime,/mug-public-personalization-v5\.js/,'runtime ainda carrega V5 antiga');
assert.match(personalization,/action:'personalize_mug_model'/,'personalização não chama a geração de arte');
assert.match(personalization,/action:'finalize_mug_product'/,'personalização não finaliza a arte');
assert.match(personalization,/arte_horizontal/,'produto personalizado não guarda arte horizontal');
assert.match(personalization,/preview_esquerda:''/,'contrato novo não prevê preview_esquerda');
assert.match(personalization,/preview_direita:''/,'contrato novo não prevê preview_direita');
assert.match(personalization,/render_3d_version:'mug-public-3d-v2'/,'produto não marca render 3D v2');
assert.doesNotMatch(personalization,/mockup_left_base64|mockup_right_base64|mockup_center_base64/,'V6 ainda envia recortes de mockup ao Make');
assert.doesNotMatch(personalization,/prompt_mockup_1|prompt_mockup_2|prompt_mockup_3/,'V6 ainda pede mockups ao Make');
assert.doesNotMatch(personalization,/cropReference\(/,'V6 ainda recorta referências para mockup');
assert.match(personalization,/A automação aceitou a criação, mas a arte horizontal não apareceu/,'espera assíncrona não está art-only');
assert.match(result,/mug-public-3d-v2\.js/,'página de resultado não usa o 3D v2');
assert.match(result,/generatePreviews/,'página de resultado não gera duas vistas');
assert.match(result,/Ver caneca em 360°/,'página de resultado não oferece 360°');
assert.doesNotMatch(result,/mockup_1|mockup_2|mockup_3|três prévias|quatro imagens/i,'página de resultado ainda depende de mockups antigos');
console.log('OK · Personalização pública V6: arte horizontal única + previews/360° no site.');