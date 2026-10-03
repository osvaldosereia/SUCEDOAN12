import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/atendimento/index.html','utf8');
const app=fs.readFileSync('vitrine/admin/atendimento/attendance-app.js','utf8');
const css=fs.readFileSync('vitrine/admin/atendimento/attendance.css','utf8');
const api=fs.readFileSync('supabase/functions/admin-whatsapp-ops-v1/index.ts','utf8');
const migrationPath='supabase/migrations/20261003_admin_attendance_recent_filters_v1.sql';
assert.ok(fs.existsSync(migrationPath),'migração da fila com janela de 3 dias deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

// Dropdown customizado: filtros operacionais primeiro, etiquetas abaixo, editor no rodapé.
assert.match(html,/id="queueFilterMenuBtn"/);
assert.match(html,/id="queueFilterMenu"/);
assert.match(html,/data-queue-filter="recent"[^>]*>RECENTE</i);
assert.match(html,/data-queue-filter="order"[^>]*>PEDIDOS</i);
assert.match(html,/data-queue-filter="pending"[^>]*>CADASTRO</i);
assert.match(html,/id="queueLabelFilters"/);
assert.match(html,/id="manageLabelsBtn"/);
assert.doesNotMatch(html,/id="labelFilter"/,'não deve depender de select nativo para etiquetas');
assert.doesNotMatch(html,/data-queue-filter="unread"/,'Não lidas saiu dos filtros principais');

// RECENTE é padrão e não exibe contador; PEDIDOS/CADASTRO usam pedido recente.
assert.match(app,/quickFilter:'recent'/);
assert.match(app,/state\.quickFilter==='recent'\?true/);
assert.match(app,/state\.quickFilter==='order'\?Boolean\(item\.has_recent_order\)/);
assert.match(app,/state\.quickFilter==='pending'\?Boolean\(item\.has_recent_order&&item\.registration_incomplete\)/);
assert.match(app,/canonical_last_message_at[\s\S]*sort\(\(a,b\)=>new Date\(b\./,'fila deve continuar ordenada pela conversa mais recente');
assert.doesNotMatch(app,/quickCounts\(/,'filtros não devem mostrar contagens');

// Editor de etiquetas precisa ser funcional de verdade.
assert.match(app,/label_save/);
assert.match(app,/label_deactivate/);
assert.match(app,/labelManager/);
assert.match(app,/labelForm/);
assert.match(app,/renderLabelManager/);

// Regra de 3 dias de calendário em Cuiabá calculada no banco.
assert.match(sql,/ops2_admin_attendance_queue_v4/i);
assert.match(sql,/America\/Cuiaba/i);
assert.match(sql,/current_date|::date/i);
assert.match(sql,/\-\s*2/,'janela deve incluir hoje e os 2 dias anteriores');
assert.match(sql,/has_recent_order/i);
assert.match(sql,/recent_order_at/i);
assert.match(api,/ops2_admin_attendance_queue_v4/,'gateway deve usar fila v4');

// Hierarquia visual: dropdown customizado e áreas com fundos distintos.
for(const token of ['queue-filter-menu','queue-filter-trigger','--queue-bg','--conversation-bg','--context-bg','--composer-bg']) assert.match(css,new RegExp(token));

console.log('attendance filter menu + 3-day recent order contract OK');
