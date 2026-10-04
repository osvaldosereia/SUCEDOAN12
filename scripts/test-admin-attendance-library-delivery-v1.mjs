import assert from 'node:assert/strict';
import fs from 'node:fs';

const gatewayPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
const senderPath='supabase/functions/_shared/admin-attendance-library-send-v1.mjs';
const libraryPath='supabase/functions/_shared/admin-attendance-library-v1.mjs';
const mediaSenderPath='supabase/functions/_shared/admin-attendance-media-send-v1.mjs';

const gateway=fs.readFileSync(gatewayPath,'utf8');
const library=fs.readFileSync(libraryPath,'utf8');
const mediaSender=fs.readFileSync(mediaSenderPath,'utf8');

assert.match(library,/export\s+async\s+function\s+loadActiveAttendanceLibraryItem/,'Biblioteca deve expor carregamento de item ativo');
assert.match(mediaSender,/export\s+async\s+function\s+sendAttendanceMediaBytesViaMeta/,'transporte comum por bytes deve existir');
assert.ok(fs.existsSync(senderPath),'deve existir helper dedicado de envio da Biblioteca');

const sender=fs.readFileSync(senderPath,'utf8');
assert.match(sender,/loadActiveAttendanceLibraryItem/,'sender deve carregar apenas item ativo/ready');
assert.match(sender,/attendance-library-v1/,'sender deve ler do bucket privado da Biblioteca');
assert.match(sender,/\.download\s*\(/,'sender deve baixar o objeto server-side');
assert.match(sender,/stored_size_bytes/,'sender deve validar tamanho persistido antes de enviar');
assert.match(sender,/sendAttendanceMediaBytesViaMeta/,'sender deve reutilizar exatamente o transporte Meta comum por bytes');
assert.match(sender,/attendance_library_audit_v1/,'sender deve auditar a tentativa de envio');
assert.match(sender,/item_send/,'auditoria deve registrar ação item_send');
assert.match(sender,/provider_message_id/,'auditoria deve guardar provider_message_id quando houver');
assert.match(sender,/outbox_id/,'auditoria deve guardar outbox_id quando houver');
assert.match(sender,/message_id/,'auditoria deve guardar message_id quando houver');

assert.match(gateway,/admin-attendance-library-send-v1\.mjs/,'gateway deve importar sender da Biblioteca');
assert.match(gateway,/action==="library_send"[\s\S]*sendAttendanceLibraryItemViaMeta/,'library_send deve chamar o sender canônico');
assert.doesNotMatch(gateway,/library_send_not_ready/,'library_send não pode continuar bloqueado por stub');
assert.match(gateway,/destination_fields_not_allowed/,'gateway deve continuar rejeitando destino informado pelo navegador');

console.log('PASS test-admin-attendance-library-delivery-v1');
