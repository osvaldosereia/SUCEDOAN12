import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath='supabase/sql/20261003_attendance_library_v1.sql';
assert.ok(fs.existsSync(sqlPath),`schema da Biblioteca Rápida deve existir em ${sqlPath}`);
const sql=fs.readFileSync(sqlPath,'utf8');

assert.match(sql,/attendance-library-v1/i,'deve criar o bucket attendance-library-v1');
assert.match(sql,/insert\s+into\s+storage\.buckets[\s\S]*attendance-library-v1[\s\S]*public[\s\S]*false/i,'bucket deve ser privado');
assert.match(sql,/file_size_limit[\s\S]*26214400/i,'bucket deve limitar arquivos a 25 MiB');

assert.match(sql,/create\s+table\s+if\s+not\s+exists\s+public\.attendance_library_items_v1/i,'deve criar catálogo da biblioteca');
for(const column of ['id','title','media_kind','mime_type','storage_path','thumbnail_path','original_filename','original_size_bytes','stored_size_bytes','width','height','duration_seconds','category','tags','sort_order','upload_status','upload_expires_at','is_active','created_by','updated_by','created_at','updated_at','deleted_at','deleted_by']){
  assert.match(sql,new RegExp(`\\b${column}\\b`,'i'),`catálogo deve conter ${column}`);
}
assert.match(sql,/media_kind[\s\S]{0,500}image[\s\S]{0,200}video[\s\S]{0,200}audio[\s\S]{0,200}document/i,'media_kind deve limitar image/video/audio/document');
assert.match(sql,/upload_status[\s\S]{0,500}pending[\s\S]{0,200}ready[\s\S]{0,200}failed/i,'upload_status deve limitar pending/ready/failed');

assert.match(sql,/create\s+table\s+if\s+not\s+exists\s+public\.attendance_library_audit_v1/i,'deve criar auditoria dedicada');
for(const column of ['admin_user_id','item_id','conversation_id','whatsapp_account_id','action','result','error_code','outbox_id','message_id','provider_message_id','metadata','created_at']){
  assert.match(sql,new RegExp(`\\b${column}\\b`,'i'),`auditoria deve conter ${column}`);
}

const rpcNames=[
  'ops2_admin_attendance_library_reserve_v1',
  'ops2_admin_attendance_library_finalize_v1',
  'ops2_admin_attendance_library_update_v1',
  'ops2_admin_attendance_library_deactivate_v1',
  'ops2_admin_attendance_library_audit_v1',
];
for(const rpc of rpcNames){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${rpc}`,'i'),`deve criar ${rpc}`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc}[\\s\\S]{0,800}from\\s+public`,'i'),`${rpc} deve ser revogada de public`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc}[\\s\\S]{0,800}from\\s+anon`,'i'),`${rpc} deve ser revogada de anon`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc}[\\s\\S]{0,800}from\\s+authenticated`,'i'),`${rpc} deve ser revogada de authenticated`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${rpc}[\\s\\S]{0,800}to\\s+service_role`,'i'),`${rpc} deve ser concedida apenas ao service_role`);
}

assert.match(sql,/ops2_admin_attendance_library_reserve_v1[\s\S]*items\/[\s\S]*asset/i,'reserve deve produzir path controlado por item');
assert.match(sql,/ops2_admin_attendance_library_finalize_v1[\s\S]*storage\.objects/i,'finalize deve conferir storage.objects');
assert.match(sql,/ops2_admin_attendance_library_finalize_v1[\s\S]*26214400/i,'finalize deve validar teto de 25 MiB');
assert.match(sql,/ops2_admin_attendance_library_deactivate_v1[\s\S]*is_active[\s\S]*false[\s\S]*deleted_at/i,'deactivate deve fazer soft delete');

console.log('PASS test-admin-attendance-library-schema-v1');
