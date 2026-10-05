import assert from 'node:assert/strict';
import fs from 'node:fs';
import {maskProfileSuggestion,isUsableProfileSuggestion,profileProgress} from '../vitrine/admin/atendimento/attendance-customer-profile.js';

assert.equal(maskProfileSuggestion('cpf_cnpj','12345678909'),'***8909','CPF deve ficar mascarado na revisão');
assert.equal(maskProfileSuggestion('name','Gustavo Pereira'),'Gustavo Pereira');
assert.equal(isUsableProfileSuggestion({recommendation:'ignore',confidence:0.99}),false,'ignore não deve ser utilizável');
assert.equal(isUsableProfileSuggestion({recommendation:'confirm',confidence:0.79}),false,'baixa confiança não deve ser utilizável');
assert.equal(isUsableProfileSuggestion({recommendation:'confirm',confidence:0.95}),true,'sugestão válida deve ser utilizável');
assert.deepEqual(profileProgress({name:'Gustavo',phone:'+5565999999999',cpf:'',email:'',address:{street:'',number:'',district:'',city:''}}),{complete:2,total:8},'progresso deve contar nome + WhatsApp');

const profile=fs.readFileSync('vitrine/admin/atendimento/attendance-customer-profile.js','utf8');
const api=fs.readFileSync('vitrine/admin/atendimento/attendance-customer-api.js','utf8');
const view=fs.readFileSync('vitrine/admin/atendimento/attendance-customer-view.js','utf8');
const customer=fs.readFileSync('vitrine/admin/atendimento/attendance-customer.js','utf8');

for(const copy of ['ANA buscar dados na conversa','Revisar sugestões','Usar no formulário','Descartar'])assert.match(profile,new RegExp(copy),`UI deve conter ${copy}`);
assert.match(profile,/renderCustomerForm/,'usar sugestão deve reutilizar formulário existente');
assert.doesNotMatch(profile,/customerSave\s*\(/,'módulo de sugestões não pode salvar automaticamente');
assert.match(profile,/evidence_message_ids|Evidência/i,'UI deve indicar origem/evidência');
assert.match(profile,/confidence|confiança/i,'UI deve indicar confiança');
assert.doesNotMatch(profile,/chain.of.thought|raciocínio interno/i,'UI não deve exibir raciocínio interno');
assert.match(profile,/data-attendance-customer-profile|attendanceCustomerProfile/i,'deve marcar bloco para impedir duplicação em re-render');

assert.match(api,/admin-whatsapp-ana-customer-profile-v1/,'API do Atendimento deve chamar Edge de perfil');
assert.match(api,/customerProfileExtract/,'API deve exportar extração');
assert.match(api,/customerProfileList/,'API deve exportar listagem');
assert.match(view,/renderCustomerProfileAssistant/,'card de cliente vinculado deve receber bloco de perfil');
assert.match(customer,/decorateLinkedCustomer/,'orquestrador continua decorando card vinculado');

console.log('Attendance ANA customer profile UI contract OK');
