import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyCustomerConfirmation } from '../supabase/functions/_shared/ana-customer-confirmation-v1.mjs';

const edge='supabase/functions/whatsapp-meta-webhook-v1/index.ts';
const migration='supabase/migrations/20261006051000_ana_customer_confirmation_apply_signal_v1.sql';
const mirror='supabase/sql/20261006_ana_customer_confirmation_apply_signal_v1.sql';
const workflow='.github/workflows/whatsapp-meta-central-ci.yml';

const outbound='2026-10-06T10:00:00.000Z';
const expires='2026-10-06T10:30:00.000Z';
const pending={id:'req-1',conversation_id:'conv-1',status:'pending',expires_at:expires,outbound_sent_at:outbound,suggestions:[]};
const inbound=(text,created_at='2026-10-06T10:01:00.000Z')=>({id:'msg-1',conversation_id:'conv-1',direction:'inbound',text_body:text,received_at:created_at});
const decision=(message,request=pending)=>classifyCustomerConfirmation({message,pendingRequest:request});

for(const text of ['sim','está correto','confirmo','Isso mesmo!'])assert.equal(decision(inbound(text)).decision,'confirm',`${text} deve confirmar pedido ativo`);
for(const text of ['não','corrigir','está errado'])assert.equal(decision(inbound(text)).decision,'correct',`${text} deve abrir correção`);
assert.equal(decision(inbound('sim'),null).decision,'none','sem pedido pendente não confirma');
assert.equal(decision(inbound('sim'),{...pending,expires_at:'2026-10-06T10:00:30.000Z'}).decision,'none','pedido expirado não confirma');
assert.equal(decision(inbound('sim','2026-10-06T09:59:59.000Z')).decision,'none','mensagem anterior ao envio não confirma');
assert.equal(decision(inbound('sim','2026-10-06T10:30:01.000Z')).decision,'none','mensagem após a expiração não confirma');
assert.equal(decision(inbound('sim, me explique melhor')).decision,'none','sim genérico em frase não confirma');
assert.equal(decision(inbound('Na verdade, meu CPF correto é 99988877766'),{...pending,suggestions:[{field_name:'cpf_cnpj',normalized_value:'00011122233'}]}).decision,'correct','CPF diferente invalida a sugestão antiga');
assert.equal(decision(inbound('Na verdade o endereço correto é Rua Beta, 20'),{...pending,suggestions:[{field_name:'street',normalized_value:'Rua Alfa'}]}).decision,'correct','endereço corrigido invalida a sugestão antiga');

assert.ok(fs.existsSync(migration),'RPC de sinal deve ter migration');
assert.ok(fs.existsSync(mirror),'espelho SQL do RPC de sinal deve existir');
const sql=fs.readFileSync(migration,'utf8');
assert.match(sql,/ops2_ana_customer_confirmation_apply_signal_v1/);
assert.match(sql,/outbound_message_id[\s\S]*sent_at[\s\S]*created_at/i,'sinal deve exigir timestamp posterior ao envio canônico');
assert.match(sql,/confirmation_inbound_message_id[\s\S]*status\s*=\s*'pending'/i,'sinal deve persistir idempotentemente');
assert.match(sql,/grant\s+execute[\s\S]*service_role/i,'RPC de webhook deve ser service-role only');
assert.equal(fs.readFileSync(mirror,'utf8'),sql,'migration e espelho SQL devem ser idênticos');

const webhook=fs.readFileSync(edge,'utf8');
assert.match(webhook,/ops2_ana_customer_confirmation_apply_signal_v1/,'webhook deve persistir decisão após ingestão canônica');
assert.match(webhook,/message_id/,'webhook deve usar ID da mensagem canônica');
assert.match(webhook,/customer_profile_confirmation_requests_v1/,'webhook deve ler somente pedido pendente canônico');

const wf=fs.readFileSync(workflow,'utf8');
assert.match(wf,/test-ana-customer-confirmation-v1\.mjs/,'classifier contract deve rodar no CI');

console.log('ANA customer confirmation classifier contract OK');

