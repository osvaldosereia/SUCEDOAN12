import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/sql/20261003_whatsapp_ana_review_observability_v4.sql';
const apiPath='supabase/functions/admin-whatsapp-ana-preview-v1/index.ts';
const uiPath='vitrine/admin/atendimento/attendance-ana-preview.js';

assert.equal(fs.existsSync(migrationPath),true,'migration de avaliação/observabilidade da ANA deve existir');
for(const path of [apiPath,uiPath])assert.equal(fs.existsSync(path),true,`${path} deve existir`);

const sql=fs.readFileSync(migrationPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');

assert.match(sql,/ops2_admin_ana_preview_review_v1/i,'deve existir RPC autenticada para revisão humana');
assert.match(sql,/ops2_admin_ana_preview_observe_v1/i,'deve existir RPC para persistir telemetria da geração');
assert.match(sql,/ops2_admin_ana_preview_metrics_v1/i,'deve existir read-model de métricas da prévia');
assert.match(sql,/auth\.uid\(\)/i,'RPCs administrativas devem identificar o usuário autenticado');
assert.match(sql,/admin_users[\s\S]*is_active\s*=\s*true/i,'somente admin ativo pode avaliar/consultar métricas');
assert.match(sql,/dry_run\s+is\s+true|dry_run=true/i,'somente jobs dry-run podem receber avaliação');
assert.match(sql,/status\s*=\s*'completed'|status='completed'/i,'avaliação deve exigir geração concluída');
assert.match(sql,/used|helpful|rejected/i,'deve registrar resultados explícitos da revisão');
assert.match(sql,/review_outcome/i,'resultado da revisão deve ficar auditável');
assert.match(sql,/reviewed_by/i,'revisor deve ficar auditável');
assert.match(sql,/reviewed_at/i,'horário da revisão deve ficar auditável');
assert.match(sql,/latency_ms/i,'latência deve ser persistida para observabilidade');
assert.match(sql,/revoke all on function public\.ops2_admin_ana_preview_review_v1/i,'review RPC deve nascer fechada');
assert.match(sql,/grant execute on function public\.ops2_admin_ana_preview_review_v1/i,'review RPC deve ser concedida somente ao papel previsto');
assert.doesNotMatch(sql,/whatsapp_outbox_v1|ops2_admin_attendance_enqueue|sendMeta|graph\.facebook\.com/i,'avaliação nunca pode enviar WhatsApp');

assert.match(api,/action\s*===\s*["']review["']|case\s+["']review["']/i,'Edge deve aceitar ação review sem gerar nova resposta');
assert.match(api,/action\s*===\s*["']metrics["']|case\s+["']metrics["']/i,'Edge deve expor métricas administrativas');
assert.match(api,/ops2_admin_ana_preview_review_v1/i,'Edge deve persistir revisão via RPC');
assert.match(api,/ops2_admin_ana_preview_observe_v1/i,'Edge deve persistir telemetria da geração');
assert.match(api,/ops2_admin_ana_preview_metrics_v1/i,'Edge deve ler métricas via RPC');
assert.match(api,/dry_run_not_sendable:true/,'review/metrics devem manter o contrato de segurança');

assert.match(ui,/requestReview/,'UI deve possuir chamada explícita de revisão');
assert.match(ui,/Útil|Util/,'UI deve permitir marcar sugestão útil');
assert.match(ui,/Não usar|Nao usar/,'UI deve permitir rejeitar sugestão');
assert.match(ui,/used/,'Usar no rascunho deve ser observável como uso humano');
assert.match(ui,/Métricas|Metricas|avaliaç/i,'aba Assistente deve mostrar observabilidade agregada');
assert.doesNotMatch(ui,/sendBtn\.click|send_text|send_media/i,'revisão da ANA não pode disparar envio');

console.log('PASS test-whatsapp-ana-review-observability-v1');
