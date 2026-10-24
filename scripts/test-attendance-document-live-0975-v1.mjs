import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/sql/20261008_admin_attendance_document_live_0975_v1.sql','utf8');
assert.match(sql,/new\.message_type='document'[\s\S]*meta_document_live_enabled/,'documento tem flag independente');
assert.match(sql,/new\.message_type='image'[\s\S]*meta_image_live_enabled/,'imagem live existente preservada');
assert.match(sql,/elsif v_image_live or v_document_live then/,'documento so ignora allowlist sob flag especifica');
assert.match(sql,/new\.message_type in \('image','audio','document'\)/,'guard de midia mantido');
assert.match(sql,/new.status='claimed'/,'revalida na transicao para claim');
assert.match(sql,/meta_canary_destination_blocked/,'canario continua bloqueando destinatarios nao autorizados');
assert.match(sql,/ops2_attendance_media_live_readiness_v1\(v_account_id\)/,'graduacao exige evidencia Meta valida');
assert.match(sql,/a.phone_e164='\+5565998150975'/,'somente canal 0975 e graduado');
assert.match(sql,/a.phone_e164='\+5565984491018'[\s\S]*and a.is_active=true/,'1018 permanece restrito');
assert.doesNotMatch(sql,/\{meta_media_live_enabled\}[\s\S]{0,150}to_jsonb\(true\)/,'live global nao foi ativado');
assert.doesNotMatch(sql,/\{meta_media_canary_enabled\}[\s\S]{0,150}to_jsonb\(false\)/,'canario continua disponivel');
console.log('PASS test-attendance-document-live-0975-v1');
