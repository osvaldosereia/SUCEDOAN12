import assert from 'node:assert/strict';
import fs from 'node:fs';
import {linkedCustomerFirstName} from '../supabase/functions/_shared/ana-customer-context-v1.mjs';
import {isSimpleAnaGreeting,buildAnaCatalogWelcome} from '../supabase/functions/_shared/ana-policy-v1.mjs';

const conversationId='a5b2f10d-2362-4bcb-b563-115bfa123456';
function mockDb({customerId='0c638a6f-6b4b-4e2f-8f0c-46d6ba123456',name='Telma Fernandes'}={}){
  return {
    from(table){
      return {select(){
        return {eq(_column,id){
          return {maybeSingle:async()=>{
            if(table==='conversations'&&id===conversationId)return {data:{customer_id:customerId},error:null};
            if(table==='customers'&&id===customerId)return {data:{name},error:null};
            return {data:null,error:null};
          }};
        }};
      }};
    }
  };
}

assert.equal(await linkedCustomerFirstName(mockDb(),conversationId),'Telma','usa primeiro nome somente do cadastro vinculado');
assert.equal(await linkedCustomerFirstName(mockDb({name:'Telma123 Fernandes'}),conversationId),'','não tenta limpar ou adivinhar nome malformado');
assert.equal(await linkedCustomerFirstName(mockDb({customerId:null}),conversationId),'','não inventa nome sem vínculo');
assert.equal(await linkedCustomerFirstName(mockDb(),'not-a-uuid'),'','valida o id da conversa');
assert.equal(isSimpleAnaGreeting('Olá!'),true,'reconhece cumprimento simples');
assert.equal(isSimpleAnaGreeting('Oi, meu pedido atrasou'),false,'não desvia problema para fluxo de saudação');
assert.match(buildAnaCatalogWelcome({firstName:'Telma',catalogPath:'/catalogo_1234'}),/Olá Telma[\s\S]*telefone|catálogo/i,'saudação usa nome conhecido e link curto');
assert.equal(buildAnaCatalogWelcome({firstName:'Telma',catalogPath:'//exemplo.com'}),'','não monta link externo a partir de retorno inválido');

const policy=fs.readFileSync('supabase/functions/_shared/ana-policy-v1.mjs','utf8');
const worker=fs.readFileSync('supabase/functions/whatsapp-ana-worker-v1/index.ts','utf8');
const preview=fs.readFileSync('supabase/functions/admin-whatsapp-ana-preview-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261006113000_attendance_product_interest_labels_v1.sql','utf8');
const sqlMirror=fs.readFileSync('supabase/sql/20261006_attendance_product_interest_labels_v1.sql','utf8');
const attendance=fs.readFileSync('vitrine/admin/atendimento/attendance-app.js','utf8');

assert.match(policy,/known_customer_first_name/,'a política recebe apenas o primeiro nome autorizado');
assert.match(worker,/isSimpleGreetingForNewDay/,'saudação diária tem gatilho isolado');
assert.match(worker,/ops2_issue_storefront_catalog_link_v1/,'saudação oferece link identificado do catálogo');
assert.match(worker,/America\/Cuiaba/,'o dia é calculado no fuso da operação');
assert.match(preview,/linkedCustomerFirstName/,'prévia aplica o mesmo contexto de nome');
assert.match(migration,/customer_subsubcategory/,'etiqueta depende da categoria real comprada');
assert.match(migration,/customer_taxonomy_confidence[\s\S]*high/,'a etiqueta exige taxonomia de alta confiança');
assert.match(migration,/product_purchase/,'a compra fica como origem automática auditável');
assert.doesNotMatch(migration,/marketing_consent_events_v1|marketing_opt_in\s*=\s*true/i,'etiqueta não concede consentimento');
assert.equal(sqlMirror,migration,'o espelho SQL precisa corresponder à migration');
assert.match(attendance,/telefone preenchido/,'o texto do link explica o telefone pré-preenchido');
assert.match(attendance,/monto por aqui/,'a mensagem oferece pedido assistido fora do site');

console.log('ANA attendance launch contract OK');
