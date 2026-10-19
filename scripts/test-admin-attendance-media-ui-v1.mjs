import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync('vitrine/admin/atendimento/attendance-app.js','utf8');
const css=fs.readFileSync('vitrine/admin/atendimento/attendance.css','utf8');

assert.match(js,/async function\s+resolveMedia\s*\(/);
assert.match(js,/api\(['"]media['"]\s*,\s*\{\s*message_id:/,'media must be resolved by the authenticated gateway');
assert.match(js,/function mediaMessage\(/);
assert.match(js,/function renderResolvedMedia\(/);
assert.match(js,/createElement\(['"]img['"]\)/,'images must use an actual img element');
assert.match(js,/createElement\(['"]audio['"]\)/,'audio must use an actual audio player');
assert.match(js,/\.controls\s*=\s*true/,'audio player must expose controls');
assert.match(js,/media-file-name|filename/,'documents must display their file name');
assert.match(js,/Não foi possível carregar esta mídia agora\./,'failed media load must provide a retry message');
assert.match(js,/openImageViewer/,'images must open in a viewer');
assert.match(js,/\['image','audio','document'\]\.includes\(msg\.message_type\)/,'supported media types must be explicit');
assert.match(js,/Mensagem recebida, mas o conteúdo não está disponível/,'unsupported incoming content must have a safe fallback');
assert.doesNotMatch(js,/function renderLocationMessage\(/,'location map rendering is not implemented in this scope');

for(const selector of ['message-media-image','message-audio','media-file','media-unavailable','media-viewer'])assert.match(css,new RegExp(`\\.${selector}\\{`),`missing style: ${selector}`);
assert.match(css,/max-width:100%/,'media must not overflow the conversation width');

console.log('Attendance media contract: image, audio, documents and safe fallback verified.');
