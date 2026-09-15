import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const edge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const migration=readFileSync('supabase/migrations/20260915143000_web_checkout_customer_v1.sql','utf8');

assert.match(edge,/action==='lookup_customer'/);
assert.match(edge,/profile:/,'lookup encontrado deve devolver perfil sanitizado');
assert.match(edge,/customer_addresses/,'lookup deve incluir endereços necessários ao checkout');
const lookup=edge.match(/if\(action==='lookup_customer'\)[\s\S]*?(?=\n\s*if\(action===)/)?.[0]||'';
assert.doesNotMatch(lookup,/cpf_cnpj/,'lookup web não pode devolver CPF');
assert.doesNotMatch(lookup,/whatsapp_url/,'lookup web não deve mandar cliente para verificação intermediária no WhatsApp');
assert.doesNotMatch(lookup,/verification_required/,'lookup web não deve exigir confirmação intermediária');
assert.match(edge,/action==='commit_customer'/,'backend deve confirmar cliente no clique final');
assert.match(edge,/room_commit_web_customer_v1/,'commit web deve usar RPC restrita');

assert.match(migration,/create or replace function public\.room_commit_web_customer_v1/);
assert.match(migration,/web_pending_customer_id/,'RPC só pode usar cliente previamente localizado na sessão');
assert.doesNotMatch(migration,/customer_document_required/,'fluxo web não exige CPF para confirmar cliente');
assert.match(migration,/primary_whatsapp_e164/,'RPC pode persistir telefone corrigido');
assert.match(migration,/customer_identity_conflict/,'RPC deve impedir reassociação de telefone de outro cliente');
assert.match(migration,/customer_id=v_customer_id/,'vínculos da sessão devem apontar para o cliente confirmado');

console.log('comprar_checkout_profile_v1_contract_ok');
