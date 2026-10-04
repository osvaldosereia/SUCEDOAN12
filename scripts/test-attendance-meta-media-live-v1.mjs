import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/sql/20261004_admin_attendance_meta_media_live_v1.sql';
assert.equal(fs.existsSync(path),true,'deve existir migration de graduação da mídia Meta para live');
const sql=fs.readFileSync(path,'utf8');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_admin_attendance_media_canary_guard_v1/i,'deve substituir o mesmo guard do trigger existente');
assert.match(sql,/meta_media_live_enabled/i,'deve existir flag explícita de mídia live');
assert.match(sql,/meta_media_canary_enabled/i,'modo canário deve continuar disponível como fallback controlado');
assert.match(sql,/meta_media_canary_to_e164/i,'allowlist do canário deve continuar preservada');
assert.match(sql,/message_type\s+in\s*\(\s*'image'\s*,\s*'audio'\s*,\s*'video'\s*,\s*'document'\s*\)/i,'guard deve proteger imagem, áudio, vídeo e documento');
assert.match(sql,/if\s+not\s+v_live[\s\S]*if\s+not\s+v_canary[\s\S]*meta_media_canary_not_enabled/i,'sem live, gate deve continuar fail-closed exigindo canário');
assert.match(sql,/if\s+not\s+v_live[\s\S]*meta_canary_destination_blocked/i,'allowlist só pode ser aplicada fora do modo live');
assert.match(sql,/meta_media_mode[\s\S]*(?:live|canary)/i,'outbox deve registrar se envio ocorreu em live ou canário');
assert.match(sql,/meta_media_live_enabled[\s\S]*to_jsonb\(true\)/i,'migration deve habilitar explicitamente mídia live');
assert.match(sql,/meta_media_canary_enabled[\s\S]*to_jsonb\(false\)/i,'migration deve encerrar o canário operacional nos canais graduados');
assert.match(sql,/\+5565998150975/,'deve graduar o canal 0975');
assert.match(sql,/\+5565984491018/,'deve graduar o canal 1018');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.ops2_admin_attendance_media_canary_guard_v1\(\)/i,'função trigger não pode ficar executável por papéis públicos');
assert.doesNotMatch(sql,/service_window_closed\s*:=|last_inbound_at\s*:=/i,'migration não pode contornar a janela de 24h');

console.log('PASS test-attendance-meta-media-live-v1');
