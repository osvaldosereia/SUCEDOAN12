import assert from 'node:assert/strict';
import {normalizePersonalizationConfig,validatePersonalizationInput,buildPersonalizationPrompt,makeUploadDescriptors} from '../loja-integrada/personalizar/personalization-contract-v1.js';

const nameCfg=normalizePersonalizationConfig({personalizacao:{ativa:true,campos:{nome:{ativo:true,obrigatorio:true,rotulo:'Nome da pessoa'}},prompt_base_texto:'Troque apenas o nome.',prompt_especifico:'Mantenha o nome centralizado.'}});
assert.deepEqual(nameCfg.fields.map(f=>f.id),['nome']);
assert.deepEqual(validatePersonalizationInput(nameCfg,{nome:'Maria'},{}),[]);
assert.match(validatePersonalizationInput(nameCfg,{telefone:'123'},{}).join(' '),/Campo não autorizado/);
assert.match(buildPersonalizationPrompt(nameCfg,{nome:'Maria'},{}),/Nome da pessoa: Maria/);

const image='data:image/png,teste';
const photoCfg=normalizePersonalizationConfig({personalizacao:{ativa:true,campos:{nome:{ativo:true,obrigatorio:true},foto:{ativo:true,obrigatorio:true}}}});
assert.match(validatePersonalizationInput(photoCfg,{nome:'Ana'},{}).join(' '),/Foto é obrigatório/);
assert.deepEqual(validatePersonalizationInput(photoCfg,{nome:'Ana'},{foto:image}),[]);
assert.deepEqual(makeUploadDescriptors(photoCfg,{foto:image,logo:image}).map(x=>x.field_id),['foto']);

const companyCfg=normalizePersonalizationConfig({personalizacao:{ativa:true,obrigatoria:true,campos:{logo:{ativo:true,obrigatorio:true},endereco:{ativo:true},telefone:{ativo:true},site:{ativo:true}}}});
assert.equal(companyCfg.requiredForPurchase,true);
assert.deepEqual(companyCfg.fields.map(f=>f.id),['logo','endereco','telefone','site']);
assert.deepEqual(validatePersonalizationInput(companyCfg,{endereco:'Rua A',telefone:'123',site:'empresa.com'},{logo:image}),[]);
assert.match(validatePersonalizationInput(companyCfg,{nome:'X'},{logo:image}).join(' '),/Campo não autorizado/);

const explicitlyDisabled=normalizePersonalizationConfig({personalizavel:true,loja_integrada_personalizavel:true,personalizacao:{ativa:false,campos:{nome:{ativo:true}}}});
assert.equal(explicitlyDisabled.active,false,'personalizacao.ativa=false deve vencer flags legados');

console.log('OK personalization-contract: campos permitidos, bloqueio e precedência da configuração nova.');
