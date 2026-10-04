import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath='vitrine/admin/atendimento/attendance-product-send.js';
const appPath='vitrine/admin/atendimento/attendance-app.js';
const cssPath='vitrine/admin/atendimento/attendance.css';
const pagePath='vitrine/admin/atendimento/index.html';

assert.ok(fs.existsSync(modulePath),'deve existir módulo isolado de envio de produtos');
const source=fs.readFileSync(modulePath,'utf8');
const app=fs.readFileSync(appPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const page=fs.readFileSync(pagePath,'utf8');

assert.match(source,/export\s+const\s+MAX_PRODUCT_BATCH\s*=\s*10\b/,'lote deve limitar a 10 produtos');
assert.match(source,/attendanceAuthorizedFetch/,'imagem deve reutilizar o cliente autenticado compartilhado');
assert.match(source,/attendanceJsonApi/,'fallback de texto deve reutilizar API autenticada compartilhada');
assert.match(source,/createImageBitmap/,'foto do produto deve ser decodificada no navegador');
assert.match(source,/document\.createElement\(['"]canvas['"]\)/,'foto deve ser normalizada via canvas');
assert.match(source,/image\/jpeg/,'foto deve ser convertida para JPEG compatível com a Meta');
assert.match(source,/send_media/,'produto com imagem deve usar o transporte canônico send_media');
assert.match(source,/form\.set\(['"]caption['"]/,'nome e preço devem viajar como caption da imagem');
assert.match(source,/formatAttendanceProductCaption/,'deve existir formatador canônico de nome + preço');
assert.match(source,/send_text/,'produto sem imagem deve cair para texto canônico');
assert.match(source,/service_window_closed/,'fila deve reconhecer fechamento da janela de 24h');
assert.match(source,/SECURITY_STOP_ERRORS/,'erros de segurança devem interromper o restante do lote');
assert.match(source,/for\s*\([^)]*of[^)]*\)\s*\{[\s\S]*?await\s+sendAttendanceProduct/,'envio deve ser estritamente sequencial');
assert.doesNotMatch(source,/Promise\.all\s*\([\s\S]{0,700}(?:send_media|sendAttendanceProduct)/,'produtos não podem ser enviados em paralelo');
assert.match(source,/failed/,'fila deve preservar itens que falharam para retry');
assert.match(source,/idempotency/i,'cada item deve usar idempotência explícita');
assert.doesNotMatch(source,/to_phone_e164\s*:|phone_number_id\s*:|whatsapp_account_id\s*:/,'frontend não pode escolher destino técnico');

assert.match(app,/attendance-product-send\.js/,'app deve integrar o módulo de produtos');
assert.match(app,/Selecionar/,'card deve permitir selecionar produto');
assert.match(app,/Enviar\s+\$\{count\}\s+produto/,'painel deve exibir botão Enviar N produtos');
assert.match(app,/clearAttendanceProductSelection/,'troca de conversa deve limpar seleção');
assert.match(app,/service_window\?\.open/,'UI deve verificar janela de 24h antes do lote');
assert.match(css,/\.product-batch-bar/,'deve existir barra visual do lote');
assert.match(css,/\.product-card\.selected/,'produto selecionado deve ter estado visual');
assert.match(page,/attendance-product-send\.js|attendance-app\.js/,'página deve carregar integração de produtos');

console.log('PASS test-admin-attendance-product-media-batch-v1');
