import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');
const index=read('admin-canecas','index.html');
const personalization=read('admin-canecas','personalization-config-v1.js');
const personalizationBadge=read('admin-canecas','mug-personalization-badge-v1.js');
const personalizationTestLink=read('admin-canecas','personalization-test-link-v1.js');
const personalizationSuggest=read('admin-canecas','personalization-prompt-suggest-v1.js');
const stability=read('admin-canecas','mugs-stability-v2.js');
const dual=read('admin-canecas','li-dual-sync-v3.js');
const recovery=read('admin-canecas','li-recovery-v3.js');
const coordinator=read('admin-canecas','li-sync-coordinator-v4.js');
const registration=read('admin-canecas','li-registration-status-v1.js');
const contract=read('loja-integrada','personalizar','personalization-contract-v1.js');
const makeContractV4=read('loja-integrada','personalizar','v4-make-contract-v1.js');
const appV4=read('loja-integrada','personalizar','app-v4.js');
const indexV4=read('loja-integrada','personalizar','index-v4.html');
const liWorker=read('scripts','sincronizar-loja-integrada.mjs');
const cropWorker=read('scripts','processar-vitrine-canecas.mjs');

const activeModules=[...index.matchAll(/<script\s+type="module"\s+src="\.\/([^"?]+)/g)].map(m=>m[1]);
assert.ok(index.includes('personalization-config-v1.js?v=20260831-1'),'Admin deve carregar configurador de personalização');
assert.equal((index.match(/personalization-config-v1\.js/g)||[]).length,1,'Admin deve carregar configurador uma única vez');
assert.ok(activeModules.includes('mug-personalization-badge-v1.js'),'grade deve mostrar resumo da personalização');
assert.ok(activeModules.includes('personalization-test-link-v1.js'),'drawer deve oferecer atalho de homologação');
assert.ok(activeModules.includes('personalization-prompt-suggest-v1.js'),'Admin deve sugerir prompt-base conforme campos');
assert.equal(new Set(activeModules).size,activeModules.length,'Admin não pode carregar módulo src duplicado');

assert.match(personalization,/\['nome',\s*'Nome',\s*'text'\]/,'campo Nome deve existir');
assert.match(personalization,/\['foto',\s*'Foto',\s*'image'\]/,'campo Foto deve existir');
assert.match(personalization,/\['logo',\s*'Logo',\s*'image'\]/,'campo Logo deve existir');
assert.match(personalization,/\['endereco',\s*'Endereço',\s*'text'\]/,'campo Endereço deve existir');
assert.match(personalization,/\['telefone',\s*'Telefone',\s*'text'\]/,'campo Telefone deve existir');
assert.match(personalization,/\['site',\s*'Site',\s*'text'\]/,'campo Site deve existir');
assert.match(personalization,/permitir_observacao:\s*false/,'instrução livre deve ficar desativada');
assert.match(personalization,/prompt_base_texto/,'produto deve guardar snapshot do prompt-base');
assert.match(personalization,/config_version/,'configuração deve ser versionada');
assert.match(personalization,/Prompts de personalização/,'Admin deve possuir biblioteca de prompts');
assert.match(personalizationTestLink,/index-v4\.html/,'atalho deve abrir homologação V4');
assert.match(personalizationBadge,/Personaliza:/,'grade deve identificar os campos permitidos');
assert.match(personalizationSuggest,/return'nome_foto'/,'Nome + Foto deve sugerir preset correto');
assert.match(personalizationSuggest,/return'empresa'/,'Logo + dados deve sugerir preset Empresa');
for(const [name,code] of [['personalization',personalization],['personalizationBadge',personalizationBadge],['personalizationTestLink',personalizationTestLink],['personalizationSuggest',personalizationSuggest]]){
  assert.equal(/new\s+MutationObserver/.test(code),false,`${name} não pode usar MutationObserver`);
  assert.equal(/setInterval\s*\(/.test(code),false,`${name} não pode atualizar UI periodicamente`);
}

for(const [name,code] of [['dual',dual],['recovery',recovery],['coordinator',coordinator],['registration',registration]]){
  assert.equal(/new\s+MutationObserver/.test(code),false,`${name} não pode usar MutationObserver`);
  assert.equal(/setInterval\s*\(/.test(code),false,`${name} não pode atualizar UI periodicamente`);
}
assert.match(stability,/observer\.observe\(root,\s*\{\s*childList:\s*true\s*\}\)/,'estabilizador deve observar somente #mugs');
assert.equal(/observer\.observe\(document\.documentElement/.test(stability),false,'estabilizador não pode observar documento inteiro');

for(const id of ['nome','foto','logo','endereco','telefone','site'])assert.match(contract,new RegExp(`${id}:\\s*Object\\.freeze`),`contrato deve permitir ${id}`);
assert.match(contract,/validatePersonalizationInput/,'contrato deve validar campos permitidos');
assert.match(contract,/buildPersonalizationPrompt/,'contrato deve montar prompt final');
assert.match(contract,/Campo não autorizado/,'contrato deve bloquear campos não autorizados');
assert.match(contract,/Upload não autorizado/,'contrato deve bloquear uploads não autorizados');
assert.match(contract,/alterar SOMENTE/,'prompt deve restringir alterações');
assert.match(contract,/typeof raw\.ativa === 'boolean'/,'configuração nova deve prevalecer sobre flags legados');

assert.match(appV4,/normalizePersonalizationConfig/,'V4 deve ler configuração do modelo');
assert.match(appV4,/validatePersonalizationInput/,'V4 deve validar entrada antes da IA');
assert.match(appV4,/buildPersonalizationPrompt/,'V4 deve montar prompt restrito');
assert.match(appV4,/image_base64:baseArt/,'V4 deve fornecer arte-base ao contrato de transporte');
assert.match(appV4,/images_json:JSON\.stringify\(makeUploadDescriptors/,'foto/logo devem entrar como anexos auxiliares');
assert.equal(appV4.includes('freeInstruction'),false,'V4 não deve possuir instrução livre');
assert.match(appV4,/aprovada:false/,'arte V4 não pode ser aprovada automaticamente');
assert.match(makeContractV4,/model_art_base64:officialArt/,'contrato Make deve preservar arte oficial explicitamente');
assert.match(makeContractV4,/image_base64:firstCustomerImage\|\|officialArt/,'contrato deve manter compatibilidade com foto do cliente no image_base64');
assert.ok(indexV4.indexOf('v4-make-contract-v1.js')<indexV4.indexOf('app-v4.js'),'contrato Make deve carregar antes da V4');
assert.match(indexV4,/HOMOLOGAÇÃO V4/,'V4 deve estar claramente marcada como homologação');
assert.match(indexV4,/Não é possível solicitar alterações fora dos campos liberados/,'UX deve deixar limites claros');

assert.match(liWorker,/p\.mockup_2,\s*p\.mockup_1/,'worker LI deve iniciar galeria por mockup 2 e mockup 1');
assert.match(cropWorker,/imagens_canecafacil:\[item\.mockup_2,item\.mockup_1,item\.urls\.left,item\.urls\.right,item\.urls\.center\]/,'recortes devem manter ordem oficial');

console.log('OK admin-canecas v3: personalização restrita por modelo, prompts versionados/sugeridos, V4 compatível com Make e UI sem observers globais.');
