import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const thumbFile='app-next/src/mug-public-thumbnails-v2.js';
const runtimeFile='app-next/src/mug-public-runtime-v6.js';
const uxFile='app-next/src/mug-public-ux-v1.js';
const mediaFile='app-next/src/product-media.js';
const indexFile='index.html';
const [thumbs,runtime,ux,media,indexHtml]=await Promise.all([
  readFile(thumbFile,'utf8'),readFile(runtimeFile,'utf8'),readFile(uxFile,'utf8'),readFile(mediaFile,'utf8'),readFile(indexFile,'utf8')
]);
for(const file of [thumbFile,runtimeFile,uxFile,mediaFile]){const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||`Erro de sintaxe em ${file}`);}

assert.doesNotMatch(runtime,/mug-public-3d-v2\.js/,'runtime voltou a carregar o antigo 3D');
assert.doesNotMatch(indexHtml,/three@|type="importmap"/,'shell público voltou a carregar Three.js');
assert.match(runtime,/mug-public-thumbnails-v2\.js/,'runtime não carrega miniaturas reais');
assert.match(runtime,/mug-public-ux-v1\.js/,'runtime não carrega UX profissional');
assert.match(thumbs,/raw\.mockup_1/,'grid não prioriza mockup real');
assert.match(thumbs,/IntersectionObserver/,'miniaturas não são lazy');
assert.doesNotMatch(thumbs,/three\.module|THREE_URL/,'grade não deve carregar Three.js');

assert.match(media,/raw\.mockup_1,raw\.mockup_2/,'galeria não usa exatamente os dois mockups');
assert.match(media,/Arte da caneca/,'arte horizontal não possui seção própria');
assert.match(media,/aspect-ratio:9\/16/,'Short não usa formato vertical');

assert.match(ux,/mug-card-polish/,'cards de caneca não recebem acabamento próprio');
assert.match(ux,/mug-gallery-polish/,'galeria não recebe organização responsiva');
assert.match(ux,/grid-template-columns:86px minmax\(0,1fr\)/,'desktop não posiciona miniaturas ao lado da principal');
assert.match(ux,/flex-basis:70px/,'mobile não usa miniaturas compactas');
assert.match(ux,/mug-public-steps/,'formulário não apresenta etapas claras');
assert.match(ux,/Você confere antes de comprar\./,'formulário perdeu mensagem de confiança');
assert.match(ux,/prefers-reduced-motion/,'UX não respeita preferência de movimento reduzido');

console.log('OK · Site público: 2 mockups reais, arte horizontal, Short manual e UX profissional responsiva; sem 3D.');
