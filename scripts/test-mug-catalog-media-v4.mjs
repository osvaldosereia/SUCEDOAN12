import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files=['app-next/src/catalog.js','scripts/sincronizar-produtos-home-firebase.mjs','scripts/estabilizar-catalogo-publico.mjs'];
const [catalog,sync,stabilizer]=await Promise.all(files.map(file=>readFile(file,'utf8')));
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout||`Erro de sintaxe em ${file}`);}
for(const [name,source] of [['catalog',catalog],['sync',sync],['stabilizer',stabilizer]]){
  assert.match(source,/thumbnail/,`${name} não preserva thumbnail`);
  assert.match(source,/preview_esquerda/,`${name} não preserva preview_esquerda`);
  assert.match(source,/preview_direita/,`${name} não preserva preview_direita`);
  assert.match(source,/arte_horizontal/,`${name} não preserva arte_horizontal`);
}
assert.ok(catalog.indexOf('push(raw.thumbnail') < catalog.indexOf('push(raw.url_imagem)'), 'catálogo deve priorizar thumbnail antes da imagem genérica');
assert.ok(sync.indexOf('product.thumbnail') < sync.indexOf('product.url_imagem'), 'sincronizador deve priorizar thumbnail na lista de mídia');
assert.ok(stabilizer.indexOf('product.thumbnail') < stabilizer.indexOf('product.url_imagem'), 'estabilizador deve priorizar thumbnail na lista de mídia');
assert.match(catalog,/render_3d_version/,'produto normalizado não expõe versão do 3D');
assert.match(catalog,/render_status/,'produto normalizado não expõe status do render');
assert.match(sync,/render_3d_version/,'sync não preserva versão do 3D');
assert.match(stabilizer,/render_3d_version/,'estabilizador não preserva versão do 3D');
console.log('OK · Catálogo público preserva thumbnail + duas vistas + arte horizontal das canecas.');