import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const viewerFile='app-next/src/mug-public-3d-v2.js';
const thumbFile='app-next/src/mug-public-thumbnails-v2.js';
const runtimeFile='app-next/src/mug-public-runtime-v6.js';
const indexFile='index.html';
const resultFile='caneca10/resultado.html';
const [viewer,thumbs,runtime,indexHtml,resultHtml]=await Promise.all([
  readFile(viewerFile,'utf8'),readFile(thumbFile,'utf8'),readFile(runtimeFile,'utf8'),readFile(indexFile,'utf8'),readFile(resultFile,'utf8')
]);
for(const file of [viewerFile,thumbFile,runtimeFile]){const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||`Erro de sintaxe em ${file}`);}
assert.match(runtime,/mug-public-3d-v2\.js/,'runtime não carrega o 3D v2');
assert.match(runtime,/mug-public-thumbnails-v2\.js/,'runtime não carrega miniaturas v2');
assert.match(runtime,/v21-printable-arc/,'runtime não renovou o cache do render com arco imprimível');
assert.match(viewer,/RoomEnvironment/,'3D v2 não usa ambiente de estúdio');
assert.match(viewer,/PMREMGenerator/,'3D v2 não prepara reflexos de ambiente');
assert.match(viewer,/MeshPhysicalMaterial/,'caneca não usa material físico');
assert.match(viewer,/LatheGeometry/,'corpo da caneca não usa perfil refinado');
assert.match(viewer,/TubeGeometry/,'alça da caneca não usa geometria própria');
assert.match(viewer,/preview_esquerda/,'viewer não lê preview_esquerda');
assert.match(viewer,/preview_direita/,'viewer não lê preview_direita');
assert.match(viewer,/arte_horizontal/,'viewer não parte da arte horizontal');
assert.match(viewer,/pointers=new Map/,'pinch zoom não foi implementado');
assert.match(viewer,/Math\.max\(6\.05,Math\.min\(11/,'limites de zoom ausentes');
assert.match(viewer,/requestAnimationFrame/,'render sob demanda ausente');
assert.doesNotMatch(viewer,/setInterval\(/,'viewer não deve manter loop contínuo');

assert.match(viewer,/PRINT_WIDTH_MM=235/,'largura operacional de impressão não foi usada na calibração visual');
assert.match(viewer,/MUG_CIRCUMFERENCE_MM=260/,'circunferência de referência não foi declarada');
assert.match(viewer,/PRINT_ARC_RAD=Math\.PI\*2\*\(PRINT_WIDTH_MM\/MUG_CIRCUMFERENCE_MM\)/,'arco imprimível não é calculado pela proporção física');
assert.match(viewer,/HANDLE_GAP_RAD=Math\.PI\*2-PRINT_ARC_RAD/,'faixa branca da alça não é derivada do arco imprimível');
assert.match(viewer,/ART_SHELL_THETA_START/,'posição da faixa próxima à alça não foi declarada');
assert.match(viewer,/ART_SHELL_THETA_START,\s*PRINT_ARC_RAD/,'geometria da arte ainda não usa o arco parcial');
assert.match(viewer,/ClampToEdgeWrapping/,'textura pode vazar pela borda da faixa sem impressão');
assert.match(viewer,/pequena faixa sem impressão próxima à alça/,'interface não explica a simulação da faixa sem impressão');
assert.doesNotMatch(viewer,/new THREE\.CylinderGeometry\(1\.525,1\.49,2\.82,128,1,true\)/,'arte voltou a cobrir 360 graus completos');

assert.match(thumbs,/thumbnail/,'miniaturas não leem campo thumbnail');
assert.match(thumbs,/IntersectionObserver/,'miniaturas não são lazy');
assert.match(thumbs,/arte_horizontal/,'fallback de miniatura não usa arte horizontal');
assert.doesNotMatch(thumbs,/three\.module|THREE_URL/,'grade não deve carregar Three.js');

for(const [name,html] of [[indexFile,indexHtml],[resultFile,resultHtml]]){
  assert.match(html,/type="importmap"/,`${name} não possui import map para os addons do Three.js`);
  assert.match(html,/"three":"https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.180\.0\/build\/three\.module\.js"/,`${name} não resolve o specifier bare three usado pelo RoomEnvironment`);
}
assert.match(indexHtml,/mug-product-route/,'site não possui proteção anti-flash para rotas de canecas');
assert.match(indexHtml,/\^mug-/,'site não identifica IDs públicos de caneca antes do primeiro render');
assert.match(indexHtml,/product-detail-media>img/,'site não oculta a mídia legada enquanto o 3D monta a caneca');
assert.match(resultHtml,/mug-3d-loader-v5/,'página de resultado não renovou a versão do loader 3D');

console.log('OK · Site público: 3D PBR, dependência Three.js resolvida, duas vistas/360° e sem flash da mídia legada.');