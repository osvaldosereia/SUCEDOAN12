import assert from 'node:assert/strict';
import fs from 'node:fs';
import {maskProfileSuggestion,isUsableProfileSuggestion,profileProgress,buildCustomerConfirmationMessage} from '../vitrine/admin/atendimento/attendance-customer-profile.js';

assert.equal(maskProfileSuggestion('cpf_cnpj','12345678909'),'***8909','CPF deve ficar mascarado na revisão');
assert.equal(maskProfileSuggestion('name','Gustavo Pereira'),'Gustavo Pereira');
assert.equal(isUsableProfileSuggestion({recommendation:'ignore',confidence:0.99}),false,'ignore não deve ser utilizável');
assert.equal(isUsableProfileSuggestion({recommendation:'confirm',confidence:0.79}),false,'baixa confiança não deve ser utilizável');
assert.equal(isUsableProfileSuggestion({recommendation:'confirm',confidence:0.95}),true,'sugestão válida deve ser utilizável');
assert.deepEqual(profileProgress({name:'Gustavo',phone:'+5565999999999',cpf:'',email:'',address:{street:'',number:'',district:'',city:''}}),{complete:2,total:8},'progresso deve contar nome + WhatsApp');
assert.equal(buildCustomerConfirmationMessage([{field_name:'name',normalized_value:'Telma Fernandes',confidence:0.95},{field_name:'cpf_cnpj',normalized_value:'12345678909',confidence:0.95}]),'Oi, Telma Fernandes! Para deixar seu cadastro certinho, você pode confirmar estes dados?\nNome: Telma Fernandes\nCPF/CNPJ: ***8909\nResponda “SIM” se estiver correto ou escreva a correção. 😊','a mensagem deve usar dados seguros e mascarar documento');
assert.equal(buildCustomerConfirmationMessage([]),'','sem dados não gera pedido');

const profile=fs.readFileSync('vitrine/admin/atendimento/attendance-customer-profile.js','utf8');
const api=fs.readFileSync('vitrine/admin/atendimento/attendance-customer-api.js','utf8');
const view=fs.readFileSync('vitrine/admin/atendimento/attendance-customer-view.js','utf8');
const customer=fs.readFileSync('vitrine/admin/atendimento/attendance-customer.js','utf8');

for(const copy of ['ANA buscar dados na conversa','Revisar sugestões','Pedir confirmação ao cliente','Usar no formulário','Descartar','Rascunho pronto'])assert.match(profile,new RegExp(copy),`UI deve conter ${copy}`);
assert.match(profile,/renderCustomerForm/,'usar sugestão deve reutilizar formulário existente');
assert.doesNotMatch(profile,/customerSave\s*\(/,'módulo de sugestões não pode salvar automaticamente');
assert.match(profile,/evidence_message_ids|Evidência/i,'UI deve indicar origem/evidência');
assert.match(profile,/confidence|confiança/i,'UI deve indicar confiança');
assert.doesNotMatch(profile,/chain.of.thought|raciocínio interno/i,'UI não deve exibir raciocínio interno');
assert.match(profile,/data-attendance-customer-profile|attendanceCustomerProfile/i,'deve marcar bloco para impedir duplicação em re-render');

assert.match(api,/admin-whatsapp-ana-customer-profile-v1/,'API do Atendimento deve chamar Edge de perfil');
assert.match(api,/customerProfileExtract/,'API deve exportar extração');
assert.match(api,/customerProfileList/,'API deve exportar listagem');
assert.match(api,/customerConfirmationCreate/,'API deve criar pedido limitado a sugestões selecionadas');
assert.match(api,/customerConfirmationBind/,'API deve vincular somente o outbound que o Admin aceitou');
assert.match(view,/renderCustomerProfileAssistant/,'card de cliente vinculado deve receber bloco de perfil');
assert.match(customer,/decorateLinkedCustomer/,'orquestrador continua decorando card vinculado');

const send=fs.readFileSync('vitrine/admin/atendimento/attendance-send.js','utf8');
assert.match(send,/messageId:result\?\.message_id/,'evento de envio deve expor ID canônico para vincular confirmação');
const bindingMigration='supabase/migrations/20261006100000_ana_customer_confirmation_bind_outbound_v1.sql';
assert.ok(fs.existsSync(bindingMigration),'vínculo do outbound deve ter migration própria');
const bindingSql=fs.readFileSync(bindingMigration,'utf8');
assert.match(bindingSql,/direction\s*<>'outbound'[\s\S]*provider\s*<>'meta'[\s\S]*conversation_id[\s\S]*sent_at/i,'vínculo deve aceitar apenas outbound Meta da mesma conversa já enviado');
assert.match(bindingSql,/ops2_admin_attendance_customer_access_v1\(false\)/,'vínculo exige admin autenticado');
assert.match(bindingSql,/grant\s+execute[\s\S]*authenticated/i,'admin autenticado pode vincular o envio confirmado');
assert.equal(fs.readFileSync('supabase/sql/20261006_ana_customer_confirmation_bind_outbound_v1.sql','utf8'),bindingSql,'migration e espelho SQL devem ser idênticos');

console.log('Attendance ANA customer profile UI contract OK');
