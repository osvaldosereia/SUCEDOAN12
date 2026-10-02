import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync('vitrine/admin/atendimento/attendance.js','utf8');
const css=fs.readFileSync('vitrine/admin/atendimento/attendance.css','utf8');

assert.match(js,/async function\s+resolveMedia\s*\(/);
assert.match(js,/api\(['"]media['"]\s*,\s*\{\s*message_id:/,'mídia deve ser resolvida pelo gateway autenticado');
assert.match(js,/function\s+renderMediaMessage\s*\(/);
assert.match(js,/function\s+renderLocationMessage\s*\(/);
assert.match(js,/createElement\(['"]img['"]\)/,'imagem deve renderizar img real');
assert.match(js,/createElement\(['"]audio['"]\)/,'áudio deve renderizar player real');
assert.match(js,/\.controls\s*=\s*true/,'player de áudio deve ter controles');
assert.match(js,/media-file-name|filename/,'documento deve mostrar nome de arquivo');
assert.match(js,/Mídia indisponível/,'falha do cache deve ter fallback legível');
assert.match(js,/Number\.isFinite\(latitude\).*Number\.isFinite\(longitude\)/s,'localização deve validar coordenadas numéricas');
assert.match(js,/maps\?q=|maps\/search|google\.com\/maps/,'localização deve gerar link de mapa por coordenadas');
assert.match(js,/Copiar localização/);
assert.match(js,/Compartilhar link/);
assert.match(js,/openImageViewer/,'imagem deve ter visualização ampliada');
assert.doesNotMatch(js,/holder\.textContent=\{audio:'🎤 Áudio',image:'🖼 Imagem',document:'📄 Documento'\}/,'placeholders antigos não podem ser o renderer principal');

for(const selector of ['message-media-image','message-audio','media-file','location-card','media-unavailable','media-viewer'])assert.match(css,new RegExp(`\\.${selector}\\{`),`estilo ausente: ${selector}`);
assert.match(css,/max-width:100%/,'mídia não pode estourar a largura da conversa');

console.log('OK · timeline renderiza imagem, áudio, arquivo e localização com fallback seguro.');
