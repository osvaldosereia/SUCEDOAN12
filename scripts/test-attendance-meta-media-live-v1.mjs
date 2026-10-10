import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/sql/20261004_admin_attendance_meta_media_live_v1.sql';
const compatPath='supabase/sql/20261004_admin_attendance_meta_media_readiness_compat_v2.sql';
const imageLivePath='supabase/sql/20261004_admin_attendance_image_live_0975_v1.sql';
assert.equal(fs.existsSync(path),true,'deve existir migration de readiness da mídia Meta para live');
assert.equal(fs.existsSync(compatPath),true,'deve existir hotfix compatível com evidência histórica do canário');
assert.equal(fs.existsSync(imageLivePath),true,'deve existir graduação independente de imagem live somente no 0975');
const sql=fs.readFileSync(path,'utf8');
const compat=fs.readFileSync(compatPath,'utf8');
const imageLive=fs.readFileSync(imageLivePath,'utf8');
const effective=`${sql}\n${compat}\n${imageLive}`;

assert.match(effective,/create\s+or\s+replace\s+function\s+public\.ops2_attendance_media_live_readiness_v1/i,'deve existir readiness server-side independente de UI');
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_admin_attendance_media_canary_guard_v1/i,'deve preservar o guard no enqueue e no claim');
assert.match(sql,/meta_media_live_enabled/i,'deve existir flag explícita e dormente de mídia live');
assert.match(sql,/meta_media_canary_enabled/i,'modo canário deve continuar disponível');
assert.match(sql,/meta_media_canary_to_e164/i,'allowlist estrita do canário deve continuar preservada');
assert.match(effective,/message_type\s+in\s*\(\s*'image'\s*,\s*'audio'\s*,\s*'document'\s*\)/i,'readiness/guard deve cobrir os três tipos homologados pelo pipeline');
assert.match(effective,/message_type\s*=\s*'audio'|count\s*\([^)]*\)\s*filter\s*\(\s*where[^)]*message_type\s*=\s*'audio'/i,'readiness deve exigir evidência real de áudio Meta');
assert.match(effective,/provider_message_id\s+is\s+not\s+null/i,'readiness deve exigir WAMID/provider_message_id');
assert.match(effective,/status_current\s+in\s*\(\s*'delivered'\s*,\s*'read'\s*\)|status_current\s+in\s*\(\s*'sent'\s*,\s*'delivered'\s*,\s*'read'\s*\)/i,'readiness deve exigir estado canônico observado');
assert.match(compat,/coalesce\s*\(\s*o\.metadata->>'meta_media_canary'\s*,\s*o\.metadata->>'meta_canary'\s*,\s*'false'\s*\)/i,'hotfix deve aceitar canário histórico somente como fallback do marcador novo');
assert.match(compat,/meta_media_canary_to_e164/i,'compatibilidade histórica deve continuar limitada à allowlist atual');
assert.match(sql,/meta_media_live_not_ready/i,'ativar live sem evidência deve permanecer fail-closed');
assert.match(sql,/if\s+v_live[\s\S]*ops2_attendance_media_live_readiness_v1/i,'guard live deve revalidar readiness no servidor');
assert.match(sql,/meta_media_mode[\s\S]*(?:live|canary)/i,'outbox deve registrar se o envio foi live ou canário');
assert.match(sql,/meta_media_live_enabled[\s\S]*to_jsonb\(false\)/i,'migration não pode abrir live automaticamente');
assert.match(sql,/meta_media_canary_enabled[\s\S]*to_jsonb\(true\)/i,'migration deve manter canário ligado até homologação');
assert.match(sql,/\+5565998150975[\s\S]*\+5565984491018|\+5565984491018[\s\S]*\+5565998150975/,'allowlist persistida deve permanecer exclusivamente 0975↔1018');
assert.doesNotMatch(effective,/'\{meta_media_live_enabled\}'\s*,\s*to_jsonb\(true\)/i,'readiness/hotfix não pode ativar live global');
assert.doesNotMatch(effective,/service_window_closed\s*:=|last_inbound_at\s*:=/i,'readiness/hotfix não pode contornar a janela de 24h');

assert.match(imageLive,/create\s+or\s+replace\s+function\s+public\.ops2_admin_attendance_media_canary_guard_v1/i,'graduação de imagem deve continuar no guard server-side');
assert.match(imageLive,/meta_image_live_enabled/i,'imagem deve ter flag live independente da mídia geral');
assert.match(imageLive,/new\.message_type\s*=\s*'image'/i,'liberação independente deve valer somente para image');
assert.match(imageLive,/meta_canary_destination_blocked/i,'áudio/documento devem continuar usando bloqueio do canário');
assert.match(imageLive,/\{meta_image_live_enabled\}[\s\S]{0,120}to_jsonb\(false\)[\s\S]{0,220}a\.phone_e164\s*=\s*'\+5565984491018'/i,'canal 1018 deve permanecer explicitamente fechado para imagem live');
assert.match(imageLive,/\{meta_image_live_enabled\}[\s\S]{0,120}to_jsonb\(true\)[\s\S]{0,220}a\.phone_e164\s*=\s*'\+5565998150975'/i,'somente o canal 0975 deve ser graduado para imagem live');
assert.doesNotMatch(imageLive,/\{meta_media_live_enabled\}[\s\S]{0,120}to_jsonb\(true\)/i,'áudio/documento não podem ser liberados junto com imagem');

console.log('PASS test-attendance-meta-media-live-v1');
