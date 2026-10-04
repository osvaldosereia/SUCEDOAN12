import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('vitrine/admin/index.html','utf8');
const edge = fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const sql = fs.readFileSync('supabase/sql/20261003_customer_identity_admin_phone_fix.sql','utf8');
const emailFix = fs.readFileSync('supabase/sql/20261003_customer_admin_email_generated_fix.sql','utf8');

assert.match(admin, /data-delete-customer=/, 'lista de clientes precisa oferecer exclusão');
assert.match(admin, /async function deleteCustomer\(/, 'admin precisa de handler de exclusão');
assert.match(admin, /vitrine_customer_delete/, 'admin precisa chamar ação autenticada de exclusão');
assert.match(admin, /customerApi\('vitrine_customer_delete',\{id,customer_id:id\}\)/, 'admin precisa enviar customer_id para compatibilidade com a Edge publicada');
assert.match(admin, /Não foi possível excluir o cadastro\./, 'falha de exclusão precisa ter mensagem específica');
assert.match(admin, /Os pedidos históricos serão mantidos/, 'confirmação deve explicar preservação do histórico');

assert.match(edge, /ops2_admin_customer_save_v2/, 'salvamento deve usar RPC transacional');
assert.match(edge, /vitrine_customer_delete/, 'edge admin precisa expor exclusão autenticada');
assert.match(edge, /ops2_admin_customer_delete_v1/, 'exclusão precisa usar RPC transacional');
assert.match(edge, /body\?\.id\s*\?\?\s*body\?\.customer_id/, 'exclusão precisa aceitar id e customer_id para compatibilidade com Admin já aberto');
assert.match(edge, /const savedCustomer=await vitrineGetCustomer\(sb,customerId\)/, 'salvamento precisa reler estado persistido');

assert.match(sql, /resolve_customer_by_phone_v1/, 'migração precisa de resolvedor determinístico');
assert.match(sql, /match_status','ambiguous'/, 'resolvedor precisa representar ambiguidade');
assert.match(sql, /create or replace function public\.lookup_customer_by_phone/, 'lookup público precisa ser corrigido');
assert.doesNotMatch(sql.match(/create or replace function public\.lookup_customer_by_phone[\s\S]*?\$function\$;/)?.[0] || '', /limit 1/i, 'lookup não pode escolher o primeiro cliente');
assert.match(sql, /ops2_admin_customer_save_v2/, 'migração precisa salvar cliente atomicamente');
assert.match(sql, /ops2_admin_customer_delete_v1/, 'migração precisa excluir cliente atomicamente');
assert.match(sql, /update public\.orders set customer_id=null/, 'exclusão precisa preservar pedidos');
assert.match(sql, /document_already_in_use/, 'CPF realmente pertencente a outra identidade continua protegido');
assert.match(emailFix, /email=v_email,is_primary=true/, 'correção precisa deixar email_normalized para o PostgreSQL gerar');
assert.match(emailFix, /customer_id,email,is_primary,source,updated_at/, 'insert corrigido não pode fornecer email_normalized');

console.log('customer identity/admin v2 regression contracts: OK');
