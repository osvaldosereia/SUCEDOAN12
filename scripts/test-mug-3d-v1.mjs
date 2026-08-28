import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const viewerFile='app-next/src/mug-public-3d-v1.js';
const thumbFile='app-next/src/mug-public-thumbnails-v1.js';
const [viewer,thumbs,runtime]=await Promise.all([readFile(viewerFile,'utf8'),readFile(thumbFile,'utf8'),readFile('app-next/src/mug-public-runtime-v6.js','utf8')]);
for(const file of [viewerFile,thumbFile]){const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||`Erro de sintaxe em ${file}`);}
assert.match(runtime,/mug-public-3d-v1\.js/,'runtime público não carrega o módulo 3D');
assert.match(runtime,/mug-public-thumbnails-v1\.js/,'runtime público não carrega miniaturas de caneca');
assert.match(viewer,/THREE_URL/);
assert.match(viewer,/MeshPhysicalMaterial/,'caneca não usa material físico PBR');
assert.match(viewer,/ACESFilmicToneMapping/,'render não usa tone mapping cinematográfico');
assert.match(viewer,/PCFSoftShadowMap/,'render não usa sombra suave');
assert.match(viewer,/generatePreviews/,'não gera as duas vistas estáticas');
assert.match(viewer,/Ver caneca em 360°/,'botão 360 não existe');
assert.match(viewer,/pointermove/,'giro por arraste não existe');
assert.match(viewer,/wheel/,'zoom não existe');
assert.match(viewer,/Math\.max\(6\.1,Math\.min\(11/,'zoom não está limitado');
assert.match(viewer,/rotation\+=/,'rotação horizontal não está implementada');
assert.doesNotMatch(viewer,/setInterval\(/,'viewer não deve manter loop/polling contínuo');
assert.match(viewer,/requestAnimationFrame/,'viewer deve renderizar sob demanda');
assert.match(viewer,/\.mug-result-mockups\{display:none!important\}/,'mockups antigos do resultado público não foram ocultados');
assert.match(thumbs,/IntersectionObserver/,'miniaturas não são processadas de forma lazy');
assert.match(thumbs,/toDataURL\('image\/webp'/,'miniatura não é gerada em WebP pelo próprio site');
assert.match(thumbs,/arte_horizontal/,'miniatura não parte da arte horizontal');
assert.doesNotMatch(thumbs,/THREE_URL|three\.module/,'grade de produtos não deve carregar Three.js');
console.log('OK · Canecas públicas: miniatura leve + 2 previews do render + 360° PBR sob demanda.');