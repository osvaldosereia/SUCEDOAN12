import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/sql/20261004_order_whatsapp_meta_accept_v1.sql';
const dispatcherPath='supabase/functions/admin-orders-v1/index.ts';
const transportPath='supabase/functions/_shared/whatsapp-meta-transport-v1.mjs';

for(const path of [dispatcherPath,transportPath]) assert.equal(fs.existsSync(path),true,`${path} deve existir`);
assert.equal(fs.existsSync(migrationPath),true,'migration de aceite Meta do pedido deve existir');

const sql=fs.readFileSync(migrationPath,'utf8');
const dispatcher=fs.readFileSync(dispatcherPath,'utf8');
const transport=fs.readFileSync(transportPath,'utf8');

assert.match(transport,/export async function sendTemplateViaMeta/,'transporte Meta compartilhado deve suportar template');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.ops2_accept_order_whatsapp_meta_v1/i,'aceite canônico específico do pedido deve existir');
assert.match(sql,/whatsapp_resolve_conversation_v1/i,'aceite deve resolver ou criar conversa canônica quando o pedido ainda não tiver conversa');
assert.match(sql,/whatsapp_messages_v1/i,'aceite deve persistir outbound no histórico canônico');
assert.match(sql,/message_type[^\n]*template/i,'outbound canônico deve ser do tipo template');
assert.match(sql,/provider[^\n]*meta/i,'outbound canônico deve identificar provider Meta');
assert.match(sql,/sender_kind[^\n]*automation/i,'confirmação automática do checkout deve ser identificada como automação');
assert.match(sql,/whatsapp_record_status_v1/i,'aceite deve registrar status accepted no pipeline canônico');
assert.match(sql,/raise\s+exception[\s\S]{0,220}accepted_status_record_failed/i,'falha ao registrar accepted deve abortar atomicamente o aceite');
assert.match(sql,/ops2_whatsapp_outbox_v1/i,'aceite deve finalizar a outbox específica do pedido');
assert.match(sql,/external_message_id/i,'WAMID deve permanecer auditável na outbox do pedido');
assert.match(sql,/security\s+definer/i,'aceite deve executar server-side');
assert.match(sql,/revoke\s+all\s+on\s+function\s+public\.ops2_accept_order_whatsapp_meta_v1/i,'RPC deve nascer fechada');
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.ops2_accept_order_whatsapp_meta_v1[^;]*to\s+service_role/i,'somente service role deve executar o aceite');

assert.match(dispatcher,/sendTemplateViaMeta/,'dispatcher deve reutilizar o transporte Meta homologado');
assert.match(dispatcher,/MetaTransportError/,'dispatcher deve tratar erros tipados do transporte Meta');
assert.match(dispatcher,/META_WHATSAPP_ACCESS_TOKEN/,'token Meta deve continuar somente server-side');
assert.match(dispatcher,/META_WHATSAPP_GRAPH_VERSION/,'Graph version deve ser configuração server-side');
assert.match(dispatcher,/phone_number_id/,'dispatcher deve resolver Phone Number ID do canal canônico');
assert.match(dispatcher,/pedidoorganizadosite0975v2/,'0975 deve usar o template utilitário homologado');
assert.match(dispatcher,/pedidoorganizadosite1018v2/,'1018 deve usar o template utilitário homologado');
assert.match(dispatcher,/sendTemplateViaMeta\s*\(/,'confirmação deve chamar diretamente o adapter Meta compartilhado');
assert.match(dispatcher,/ops2_accept_order_whatsapp_meta_v1/,'WAMID aceito deve ser persistido pelo RPC canônico do pedido');
for(const value of ['orderNumber','totalFormatted','deliverySummary','paymentLabel']) assert.match(dispatcher,new RegExp(`\\b${value}\\b`),`${value} deve alimentar o template de confirmação`);
assert.match(dispatcher,/uncertain[\s\S]{0,700}failed/i,'resultado Meta incerto não pode ser reenviado cegamente');

assert.doesNotMatch(dispatcher,/PAPOAI_ORDER_TEMPLATE_WEBHOOK_(0975|1018)_URL/,'confirmação de pedido não pode depender de webhook PapoAI');
assert.doesNotMatch(dispatcher,/PAPOAI_ORDER_WEBHOOK_TOKEN/,'confirmação de pedido não pode depender de token PapoAI');
assert.doesNotMatch(dispatcher,/ops2_papoai_order_provider_url_v1/,'dispatcher não pode resolver provider de pedido via PapoAI');
assert.doesNotMatch(dispatcher,/papoai-order-signals-v1|ops2_enqueue_papoai_order_signals_v1/i,'caminho do pedido não deve disparar automações PapoAI residuais');
assert.doesNotMatch(dispatcher,/fetch\s*\(\s*url\s*,/,'dispatcher não deve chamar URL dinâmica de provedor legado');

console.log('checkout order Meta cutover contract: ok');
