import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/sql/20261003_whatsapp_ana_preview_stale_claim_recovery_v3.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration de recovery de claim stale deve existir');

const sql=fs.readFileSync(migrationPath,'utf8');
assert.match(sql,/create or replace function public\.ops2_admin_ana_preview_start_v1/i,'recovery deve atuar no start administrativo existente');
assert.match(sql,/v_job\.status='claimed'/i,'deve tratar claim já existente');
assert.match(sql,/claimed_at\s*>\s*now\(\)\s*-\s*interval\s*'2 minutes'/i,'claim recente deve continuar busy por lease de 2 minutos');
assert.match(sql,/ana_preview_busy/i,'claim recente deve continuar fail-closed como busy');
assert.match(sql,/coalesce\(v_job\.metadata->>'source',''\)<>'admin_preview'/i,'claim que não veio da prévia administrativa deve permanecer bloqueado');
assert.match(sql,/dry_run_not_sendable/i,'recovery deve permanecer estritamente dry-run e não enviável');
assert.match(sql,/stale_claim_recovery_count/i,'recovery deve deixar trilha auditável de contagem');
assert.match(sql,/last_stale_claim_recovered_at/i,'recovery deve registrar quando recuperou claim órfão');
assert.match(sql,/attempt_count=j\.attempt_count\+1/i,'nova tentativa deve incrementar attempt_count');
assert.match(sql,/auth\.uid\(\)/i,'start continua exigindo usuário autenticado');
assert.match(sql,/admin_users[\s\S]*is_active=true/i,'start continua exigindo admin ativo');
assert.match(sql,/ops2_attendance_ai_gate_v1/i,'start continua respeitando gate Humano × IA');
assert.doesNotMatch(sql,/whatsapp_outbox_v1|ops2_admin_attendance_enqueue|sendMeta|graph\.facebook\.com/i,'recovery não pode criar caminho de envio WhatsApp');
assert.doesNotMatch(sql,/cron|pg_cron|net\.http/i,'recovery deve ser oportunística no start, sem automação paralela');

console.log('PASS test-whatsapp-ana-preview-stale-claim-v1');
