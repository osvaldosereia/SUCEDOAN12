import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const mediaFile='app-next/src/customer-mug-media-v28.js';
const runtimeFile='app-next/src/mug-public-runtime-v6.js';
const [media,runtime]=await Promise.all([readFile(mediaFile,'utf8'),readFile(runtimeFile,'utf8')]);
for(const file of [mediaFile,runtimeFile]){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout||`Erro de sintaxe em ${file}`);}
assert.match(runtime,/customer-favorites-v27\.js/,'runtime perdeu biblioteca de favoritos');
assert.match(runtime,/customer-mug-media-v28\.js/,'runtime não carrega mídia V28');
assert.match(media,/product\.thumbnail/,'mídia não prioriza thumbnail');
assert.match(media,/product\.preview_esquerda/,'mídia não usa preview esquerdo');
assert.match(media,/product\.preview_direita/,'mídia não usa preview direito');
assert.match(media,/product\.arte_horizontal/,'mídia não aceita arte horizontal');
assert.ok(media.indexOf('product.thumbnail') < media.indexOf('product.mockup_1'),'thumbnail deve preceder mockup legado');
assert.ok(media.indexOf('product.preview_esquerda') < media.indexOf('product.mockup_1'),'preview deve preceder mockup legado');
assert.match(media,/IntersectionObserver/,'cards não são atualizados de forma lazy');
assert.match(media,/MutationObserver/,'biblioteca dinâmica não é acompanhada');
assert.doesNotMatch(media,/setInterval\(/,'addon não deve usar polling contínuo');
console.log('OK · Minhas canecas usa thumbnail/preview novo com fallback legado/art-only.');