import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='vitrine/admin/atendimento/attendance-library-image.js';
assert.ok(fs.existsSync(path),'deve existir otimizador de imagem da Biblioteca');
const source=fs.readFileSync(path,'utf8');

assert.match(source,/export\s+async\s+function\s+optimizeLibraryImage\s*\(/,'deve exportar optimizeLibraryImage');
assert.match(source,/image\/jpeg/,'deve aceitar JPEG');
assert.match(source,/image\/png/,'deve aceitar PNG');
assert.match(source,/createImageBitmap/,'deve usar createImageBitmap quando disponível');
assert.match(source,/document\.createElement\(['"]canvas['"]\)|OffscreenCanvas/,'deve processar via Canvas');
assert.match(source,/const\s+LIBRARY_IMAGE_MAX_DIMENSION\s*=\s*1920/,'limite de dimensão deve ficar em constante única de 1920 px');
assert.match(source,/const\s+LIBRARY_THUMBNAIL_MAX_DIMENSION\s*=\s*320/,'thumbnail deve ter constante dedicada de 320 px');
assert.match(source,/1500\s*\*\s*1024|1536000/,'JPEG deve mirar no máximo operacional de 1,5 MB');
assert.match(source,/5\s*\*\s*1024\s*\*\s*1024|5242880/,'resultado nunca pode superar 5 MB');
assert.match(source,/hasAlpha|alpha/i,'deve detectar/preservar transparência relevante');
assert.match(source,/thumbnail/,'deve gerar thumbnail separado');
assert.match(source,/image_orientation|imageOrientation|from-image/,'deve corrigir orientação quando suportado');
assert.match(source,/library_image_(?:decode|encode|optimize|too_large|unsupported)/,'falhas devem produzir erro explícito');
assert.doesNotMatch(source,/return\s*\{[^}]*file\s*:\s*file[^}]*thumbnail\s*:\s*file/s,'não pode fazer fallback silencioso usando original como asset e thumbnail');
assert.match(source,/originalBytes/,'retorno deve informar tamanho original');
assert.match(source,/storedBytes/,'retorno deve informar tamanho final');
assert.match(source,/width/,'retorno deve informar largura final');
assert.match(source,/height/,'retorno deve informar altura final');

console.log('PASS test-admin-attendance-library-image-v1');
