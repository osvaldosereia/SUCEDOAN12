import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperPath='supabase/functions/_shared/admin-attendance-library-v1.mjs';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
assert.ok(fs.existsSync(helperPath),`${helperPath} deve existir`);
const helper=fs.readFileSync(helperPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');

for(const exported of [
  'listAttendanceLibrary','prepareAttendanceLibraryUpload','completeAttendanceLibraryUpload',
  'signAttendanceLibraryPreview','updateAttendanceLibraryItem','deactivateAttendanceLibraryItem',
  'loadActiveAttendanceLibraryItem'
]) assert.match(helper,new RegExp(`export\\s+async\\s+function\\s+${exported}`),`deve exportar ${exported}`);

assert.match(api,/READ_ACTIONS[^\n]*library_list[^\n]*library_preview/,'ações de leitura da biblioteca devem ser autenticadas pelo gateway');
for(const action of ['library_upload_prepare','library_upload_complete','library_update','library_deactivate','library_send']){
  assert.match(api,new RegExp(`SAFE_POST_ACTIONS[^\\n]*${action}`),`${action} deve estar nas ações POST seguras`);
}
assert.match(api,/admin-attendance-library-v1\.mjs/,'gateway deve importar helper dedicado da biblioteca');
assert.match(api,/adminAuth\(req\)/,'gateway deve manter autenticação administrativa central');

assert.match(helper,/attendance-library-v1/,'helper deve usar bucket privado dedicado');
assert.match(helper,/createSignedUploadUrl/,'prepare deve emitir signed upload');
assert.match(helper,/items\/|storage_path/,'path deve ser derivado da reserva canônica');
assert.match(helper,/ops2_admin_attendance_library_reserve_v1/,'prepare deve reservar item via RPC');
assert.match(helper,/ops2_admin_attendance_library_finalize_v1/,'complete deve finalizar via RPC que confere storage.objects');
assert.match(helper,/createSignedUrl/,'preview deve usar URL assinada curta');
assert.match(helper,/ops2_admin_attendance_library_update_v1/,'edição deve usar RPC limitado');
assert.match(helper,/ops2_admin_attendance_library_deactivate_v1/,'remoção deve ser soft delete via RPC');
assert.match(helper,/is_active[\s\S]*upload_status[\s\S]*ready/,'load/list deve exigir item ativo e pronto');
assert.doesNotMatch(helper,/getPublicUrl|publicUrl/,'biblioteca não pode gerar URL pública');

assert.match(api,/action==="library_upload_prepare"/);
assert.match(api,/action==="library_upload_complete"/);
assert.match(api,/action==="library_list"/);
assert.match(api,/action==="library_preview"/);
assert.match(api,/action==="library_update"/);
assert.match(api,/action==="library_deactivate"/);

// library_send já é reservado na API nesta tarefa, mas o transporte completo entra na Task 4.
const sendStart=api.indexOf('action==="library_send"');
assert.ok(sendStart>=0,'library_send deve existir no gateway');
const sendSlice=api.slice(sendStart,sendStart+1800);
assert.match(sendSlice,/destination_fields_not_allowed/,'library_send deve rejeitar campos de destino vindos do navegador');
assert.doesNotMatch(sendSlice,/to_phone_e164\s*:/,'library_send não pode montar destino a partir do browser');

console.log('PASS test-admin-attendance-library-api-v1');
