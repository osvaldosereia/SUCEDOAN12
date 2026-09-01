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
const inline=read('loja-integrada','personalizador-inline-v1.js');
const inlineV2=read('loja-integrada','personalizador-inline-v2.js');
const inlineLoader=read('loja-integrada','loader-personalizador-inline-homologacao.js');
const liWorker=read('scripts','sincronizar-loja-integrada.mjs');
const cropWorker=read('scripts','processar-vitrine-canecas.mjs');

const activeModules=[...index.matchAll(/<script\s+type="module"\s+src="\.\/([^"?]+)/g)].map(m=>m[1]);
const isolatedModules=[...index.matchAll(/import\(['"]\.\/([^'"?]+)/g)].map(m=>m[1]);
const loadedModules=[...activeModules,...isolatedModules];
assert.ok(isolatedModules.includes('personalization-config-v1.js'),'Admin deve carregar configurador de personalização de forma isolada');
assert.ok(isolatedModules.includes('mug-personalization-badge-v1.js'),'grade deve carregar resumo da personalização de forma isolada');
assert.ok(isolatedModules.includes('personalization-test-link-v1.js'),'drawer deve carregar atalho de homologação de forma isolada');
assert.ok(isolatedModules.includes('personalization-prompt-suggest-v1.js'),'Admin deve carregar sugestão de prompt-base de forma isolada');
for(const name of ['personalization-config-v1.js','mug-personalization-badge-v1.js','personalization-test-link-v1.js','personalization-prompt-suggest-v1.js']){
  assert.equal(loadedModules.filter(x=>x===name).length,1,`${name} deve ser carregado uma única vez`);
}
assert.equal(new Set(activeModules).size,activeModules.length,'Admin não pode carregar módulo src duplicado');
assert.equal(new Set(loadedModules).size,loadedModules.length,'Admin não pode carregar módulos duplicados entre src e imports isolados');

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

assert.match(inline,/TEST_PARAM\s*=\s*'cf_personalizador'/,'inline deve exigir parâmetro de homologação');
assert.match(inline,/TEST_VALUE\s*=\s*'teste'/,'inline deve usar valor explícito de homologação');
assert.match(inline,/params\.get\(TEST_PARAM\)\s*!==\s*TEST_VALUE/,'inline não pode iniciar fora do modo de teste');
for(const id of ['nome','foto','logo','endereco','telefone','site'])assert.match(inline,new RegExp(`${id}: \\[`),`inline deve reconhecer ${id}`);
assert.match(inline,/action:\s*'personalize_mug_model'/,'inline deve usar a mesma ação Make da V4');
assert.match(inline,/prompt_art:\s*prompt/,'inline deve enviar o prompt restrito montado pelo modelo');
assert.match(inline,/orderBy[\s\S]*JSON\.stringify\('codigo'\)/,'inline deve localizar a caneca por SKU indexado, sem varrer catálogo inteiro');
assert.match(inline,/equalTo[\s\S]*JSON\.stringify\(sku\)/,'inline deve exigir correspondência exata do SKU');
assert.equal(inline.includes('freeInstruction'),false,'inline não pode oferecer instrução livre');
assert.equal(inline.includes('/canecas/personalizadas/'),false,'inline de homologação não pode gravar criação/aprovação no navegador');
assert.equal(/method:\s*['"](?:PUT|PATCH|DELETE)['"]/.test(inline),false,'inline de homologação deve ser somente leitura no Firebase');
assert.equal(/new\s+MutationObserver/.test(inline),false,'inline não deve observar o documento inteiro');
assert.equal(/setInterval\s*\(/.test(inline),false,'inline não deve manter atualização periódica');
assert.match(inline,/APROVAR E COMPRAR · EM BREVE/,'compra deve permanecer bloqueada durante homologação');
assert.match(inline,/\.acoes-produto \.comprar/,'inline deve ocupar a área nativa de ações do produto');

assert.match(inlineV2,/TEST_PARAM='cf_personalizador'/,'V2 também deve exigir parâmetro de homologação');
assert.match(inlineV2,/TEST_VALUE='teste'/,'V2 deve usar valor explícito de homologação');
assert.match(inlineV2,/payload\?\.action!=='personalize_mug_model'/,'V2 só pode interceptar a ação de personalização');
assert.match(inlineV2,/payload\?\.mode!=='loja_integrada_inline'/,'V2 só pode transformar o transporte do inline');
assert.match(inlineV2,/model_art_base64:officialArt/,'V2 deve preservar arte-base oficial separadamente');
assert.match(inlineV2,/reference_image_base64:officialArt/,'V2 deve enviar referência oficial explícita');
assert.match(inlineV2,/official_model_art_base64:officialArt/,'V2 deve identificar arte oficial para o Make');
assert.match(inlineV2,/image_base64:firstCustomerImage\|\|officialArt/,'V2 deve manter compatibilidade de foto/logo com o cenário Make');
assert.match(inlineV2,/mode:'loja_integrada_v4_staging'/,'V2 deve reutilizar o contrato já homologado da V4');
assert.equal(/new\s+MutationObserver/.test(inlineV2),false,'V2 não pode observar o documento inteiro');
assert.equal(/setInterval\s*\(/.test(inlineV2),false,'V2 não pode manter atualização periódica');

assert.match(inlineLoader,/cf_personalizador/,'loader deve ser restrito à homologação');
assert.match(inlineLoader,/!== 'teste'/,'loader deve abortar fora do modo de teste');
assert.match(inlineLoader,/personalizador-inline-v2\.js/,'loader deve carregar a camada V2');
assert.equal(inlineLoader.includes('personalizador-inline-v1.js'),false,'loader não deve pular a camada V2');

assert.match(liWorker,/p\.mockup_2,\s*p\.mockup_1/,'worker LI deve iniciar galeria por mockup 2 e mockup 1');
assert.match(cropWorker,/imagens_canecafacil:\[item\.mockup_2,item\.mockup_1,item\.urls\.left,item\.urls\.right,item\.urls\.center\]/,'recortes devem manter ordem oficial');

console.log('OK admin-canecas v3: personalização restrita por modelo, prompts versionados/sugeridos, V4 e inline V2 compatíveis com Make, homologação protegida e UI sem observers globais.');
