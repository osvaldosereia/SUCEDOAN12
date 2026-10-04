import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/sql/20261004_admin_attendance_meta_media_live_v1.sql';
assert.equal(fs.existsSync(path),true,'deve existir migration de readiness da mídia Meta para live');
const sql=fs.readFileSync(path,'utf8');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_attendance_media_live_readiness_v1/i,'deve existir readiness server-side independente de UI');
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_admin_attendance_media_canary_guard_v1/i,'deve preservar o guard no enqueue e no claim');
assert.match(sql,/meta_media_live_enabled/i,'deve existir flag explícita e dormente de mídia live');
assert.match(sql,/meta_media_canary_enabled/i,'modo canário deve continuar disponível');
assert.match(sql,/meta_media_canary_to_e164/i,'allowlist estrita do canário deve continuar preservada');
assert.match(sql,/message_type\s+in\s*\(\s*'image'\s*,\s*'audio'\s*,\s*'document'\s*\)/i,'readiness/guard deve cobrir os três tipos homologados pelo pipeline');
assert.match(sql,/message_type\s*=\s*'audio'|count\s*\([^)]*\)\s*filter\s*\(\s*where[^)]*message_type\s*=\s*'audio'/i,'readiness deve exigir evidência real de áudio Meta');
assert.match(sql,/provider_message_id\s+is\s+not\s+null/i,'readiness deve exigir WAMID/provider_message_id');
assert.match(sql,/status_current\s+in\s*\(\s*'delivered'\s*,\s*'read'\s*\)|status_current\s+in\s*\(\s*'sent'\s*,\s*'delivered'\s*,\s*'read'\s*\)/i,'readiness deve exigir estado canônico observado');
assert.match(sql,/meta_media_canary/i,'readiness deve usar somente evidência do canário de mídia');
assert.match(sql,/meta_media_live_not_ready/i,'ativar live sem evidência deve permanecer fail-closed');
assert.match(sql,/if\s+v_live[\s\S]*ops2_attendance_media_live_readiness_v1/i,'guard live deve revalidar readiness no servidor');
assert.match(sql,/meta_media_mode[\s\S]*(?:live|canary)/i,'outbox deve registrar se o envio foi live ou canário');
assert.match(sql,/meta_media_live_enabled[\s\S]*to_jsonb\(false\)/i,'migration não pode abrir live automaticamente');
assert.match(sql,/meta_media_canary_enabled[\s\S]*to_jsonb\(true\)/i,'migration deve manter canário ligado até homologação');
assert.match(sql,/\+5565998150975[\s\S]*\+5565984491018|\+5565984491018[\s\S]*\+5565998150975/,'allowlist persistida deve permanecer exclusivamente 0975↔1018');
assert.doesNotMatch(sql,/meta_media_live_enabled[^;]{0,300}to_jsonb\(true\)/i,'migration de readiness não pode ativar live');
assert.doesNotMatch(sql,/service_window_closed\s*:=|last_inbound_at\s*:=/i,'migration não pode contornar a janela de 24h');

console.log('PASS test-attendance-meta-media-live-v1');
