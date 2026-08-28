import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const viewerFile='app-next/src/mug-public-3d-v2.js';
const thumbFile='app-next/src/mug-public-thumbnails-v2.js';
const runtimeFile='app-next/src/mug-public-runtime-v6.js';
const [viewer,thumbs,runtime]=await Promise.all([readFile(viewerFile,'utf8'),readFile(thumbFile,'utf8'),readFile(runtimeFile,'utf8')]);
for(const file of [viewerFile,thumbFile,runtimeFile]){const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||`Erro de sintaxe em ${file}`);}
assert.match(runtime,/mug-public-3d-v2\.js/,'runtime não carrega o 3D v2');
assert.match(runtime,/mug-public-thumbnails-v2\.js/,'runtime não carrega miniaturas v2');
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
assert.match(thumbs,/thumbnail/,'miniaturas não leem campo thumbnail');
assert.match(thumbs,/IntersectionObserver/,'miniaturas não são lazy');
assert.match(thumbs,/arte_horizontal/,'fallback de miniatura não usa arte horizontal');
assert.doesNotMatch(thumbs,/three\.module|THREE_URL/,'grade não deve carregar Three.js');
console.log('OK · Site público: thumbnail persistido/fallback, previews persistidos/fallback e 360° PBR v2.');