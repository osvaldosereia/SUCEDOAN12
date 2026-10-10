import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath='supabase/sql/20261002_admin_attendance_media_cache_v1.sql';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
const helperPath='supabase/functions/_shared/attendance-media-v1.mjs';
assert.ok(fs.existsSync(sqlPath),`${sqlPath} deve existir`);
assert.ok(fs.existsSync(helperPath),`${helperPath} deve existir`);
const sql=fs.readFileSync(sqlPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const media=await import(new URL('../supabase/functions/_shared/attendance-media-v1.mjs',import.meta.url));

assert.match(sql,/create table if not exists public\.attendance_media_cache_v1/i);
assert.match(sql,/message_id\s+uuid\s+primary\s+key/i);
assert.match(sql,/references\s+public\.whatsapp_messages_v1\s*\(id\)/i);
assert.match(sql,/object_path\s+text\s+not\s+null/i);
assert.match(sql,/expires_at\s+timestamptz\s+not\s+null/i);
assert.match(sql,/alter table public\.attendance_media_cache_v1 enable row level security/i);
for(const role of ['public','anon','authenticated'])assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.attendance_media_cache_v1\\s+from\\s+${role}`,'i'));
assert.match(sql,/grant\s+(select|insert|update|delete|all)[^;]*attendance_media_cache_v1[^;]*to\s+service_role/i);
assert.match(sql,/attendance-media-v1/i);
assert.match(sql,/public\s*=\s*false/i,'bucket deve permanecer privado');

assert.equal(media.isAllowedProviderMediaUrl('https://storageserver.bkpppai.me/papoai/tempfiles/a.ogg'),true);
assert.equal(media.isAllowedProviderMediaUrl('http://storageserver.bkpppai.me/papoai/tempfiles/a.ogg'),false,'HTTP deve ser rejeitado');
assert.equal(media.isAllowedProviderMediaUrl('https://evil.example/a.ogg'),false,'host fora da allowlist deve ser rejeitado');
assert.equal(media.isAllowedProviderMediaUrl('https://storageserver.bkpppai.me.evil.example/a.ogg'),false,'subdomínio malicioso deve ser rejeitado');
assert.equal(media.isAllowedAttendanceMime('image/jpeg'),true);
assert.equal(media.isAllowedAttendanceMime('audio/ogg; codecs=opus'),true);
assert.equal(media.isAllowedAttendanceMime('application/pdf'),true);
assert.equal(media.isAllowedAttendanceMime('text/html'),false,'HTML ativo não deve ser cacheado como mídia');
assert.equal(media.safeAttendanceFilename('../../Comprovante.pdf'),'Comprovante.pdf');
assert.equal(media.safeAttendanceFilename('Achocolatado-em-Pó-Nescau-550-g.jpg'),'Achocolatado-em-Po-Nescau-550-g.jpg','chave do Storage não pode manter acentos');
assert.equal(media.safeAttendanceFilename('Água-Sanitária-Cloro-Ativo-Ypê-5-L.jpg'),'Agua-Sanitaria-Cloro-Ativo-Ype-5-L.jpg','acentos portugueses devem ser transliterados para ASCII');
assert.equal(media.safeAttendanceFilename('Açúcar Cristal 2 kg.png'),'Acucar Cristal 2 kg.png','cedilha deve ser removida sem perder o nome');
assert.doesNotMatch(media.safeAttendanceFilename('Água Sanitária Ypê.jpg'),/[^\x20-\x7E]/,'filename seguro precisa ser ASCII para chave do Supabase Storage');

assert.match(api,/READ_ACTIONS[^\n]*"media"/);
assert.match(api,/MEDIA_BUCKET\s*=\s*["']attendance-media-v1["']/);
assert.match(api,/MEDIA_RETENTION_DAYS\s*=\s*30/);
assert.match(api,/MEDIA_SIGNED_URL_SECONDS\s*=\s*600/);
assert.match(api,/20\s*\*\s*1024\s*\*\s*1024/,'download deve ter limite de 20 MiB');
assert.match(api,/legacy_capture_id/,'mídia deve ser resolvida server-side pela captura canônica');
assert.match(api,/isAllowedProviderMediaUrl/,'endpoint deve aplicar allowlist de URL');
assert.match(api,/createSignedUrl/,'browser deve receber somente URL interna assinada');
assert.doesNotMatch(api,/json\([^\n]*media_url/i,'endpoint não pode devolver provider media_url diretamente');

console.log('OK · cache de mídia é privado, limitado e não expõe URL temporária do PapoAI.');
