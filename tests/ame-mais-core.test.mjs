import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRODUCT_FIELDS,
  PROCESSING_STEPS,
  IMAGE_OUTPUT,
  buildAnalysisPrompt,
  normalizeAnalysis,
  normalizeProductType,
  getSceneProfile,
  buildShareText,
  validateImageFile,
  buildWhatsAppUrl,
  storagePaths,
  buildCardJson,
  buildFullCardJson,
  resolveOpenAiKey,
} from '../supabase/functions/ame-mais-analyze-v1/core.mjs';

test('exige as cinco características fixas da taxonomia', () => {
  assert.deepEqual(PRODUCT_FIELDS,['tipo_produto','devocao_tema','material_modelo','cor_acabamento','diferencial_tamanho']);
});

test('prompt proíbe adivinhar devoção, material ou tamanho', () => {
  const p=buildAnalysisPrompt();
  assert.match(p,/NUNCA adivinhe/i);
  assert.match(p,/devoção/i);
  assert.match(p,/material/i);
  assert.match(p,/tamanho/i);
});

test('normalização esvazia devoção quando confiança é baixa e preserva conflitos', () => {
  const a=normalizeAnalysis({tipo_produto:'Terço',devocao_tema:'Nossa Senhora',material_modelo:'Cristal',cor_acabamento:'Azul',diferencial_tamanho:'',nome_cadastro:'Terço Azul',descricao_cadastro:'x',descricao_vitrine:'y',confianca_geral:.8,confianca_devocao:.4,conflitos:['material incerto']});
  assert.equal(a.devocao_tema,'');
  assert.equal(a.precisa_revisao,true);
  assert.ok(a.conflitos.some(x=>/devo/i.test(x)));
  assert.ok(a.conflitos.some(x=>/material incerto/i.test(x)));
});

test('normaliza tipos de produto para perfis visuais conhecidos', () => {
  assert.equal(normalizeProductType('Terço'), 'terco_rosario');
  assert.equal(normalizeProductType('Camiseta'), 'camiseta');
  assert.equal(normalizeProductType('Imagem de santo'), 'estatua_imagem');
  assert.equal(normalizeProductType('Quadro'), 'quadro');
  assert.equal(normalizeProductType('Chaveiro'), 'chaveiro');
  assert.equal(normalizeProductType('Outro'), 'generico');
});

test('todo perfil produz exatamente hero lifestyle detail', () => {
  for(const type of ['Terço','Camiseta','Imagem','Quadro','Chaveiro','Outro']){
    assert.deepEqual(getSceneProfile({tipo_produto:type,nome_cadastro:type}).map(x=>x.kind),['hero','lifestyle','detail']);
  }
});

test('terço usa mão segurando, uso e close-up', () => {
  const p=getSceneProfile({tipo_produto:'Terço',nome_cadastro:'Terço Cristal'});
  assert.match(p[0].prompt,/mão/i);
  assert.match(p[1].prompt,/uso|pessoa/i);
  assert.match(p[2].prompt,/close-up|macro/i);
});

test('categorias principais têm cenas próprias', () => {
  assert.match(getSceneProfile({tipo_produto:'Camiseta',nome_cadastro:'Camiseta'}).map(x=>x.prompt).join(' '),/vestindo|camiseta/i);
  assert.match(getSceneProfile({tipo_produto:'Quadro',nome_cadastro:'Quadro'}).map(x=>x.prompt).join(' '),/parede/i);
  assert.match(getSceneProfile({tipo_produto:'Chaveiro',nome_cadastro:'Chaveiro'}).map(x=>x.prompt).join(' '),/chaveiro/i);
});

test('prompts não adicionam logo, marca, selo ou texto promocional', () => {
  for(const p of getSceneProfile({tipo_produto:'Outro',nome_cadastro:'Produto'})) assert.match(p.prompt,/não adicione logo|sem logo/i);
});

test('texto de compartilhamento usa nome e descrição comercial', () => {
  const t=buildShareText({nome_cadastro:'Produto X',descricao_vitrine:'Descrição Y'});
  assert.match(t,/Produto X/);
  assert.match(t,/Descrição Y/);
});

test('valida arquivo de foto aceitando jpeg png webp e recusando acima de 10MB', () => {
  assert.equal(validateImageFile({type:'image/jpeg',size:100000}).ok,true);
  assert.equal(validateImageFile({type:'image/png',size:100000}).ok,true);
  assert.equal(validateImageFile({type:'image/webp',size:100000}).ok,true);
  assert.equal(validateImageFile({type:'image/gif',size:100000}).ok,false);
  assert.equal(validateImageFile({type:'image/jpeg',size:11*1024*1024}).ok,false);
});

test('url de whatsapp carrega o texto comercial codificado', () => {
  const u=buildWhatsAppUrl('Olá produto');
  assert.match(u,/wa\.me/);
  assert.match(u,/Ol%C3%A1%20produto/);
});

test('imagens da vitrine são quadradas e low', () => {
  assert.equal(IMAGE_OUTPUT.size,'1024x1024');
  assert.equal(IMAGE_OUTPUT.quality,'low');
});

test('processamento expõe as novas etapas reais', () => {
  const keys=PROCESSING_STEPS.map(x=>x.key);
  assert.ok(keys.includes('analyzing_product'));
  assert.ok(keys.includes('generating_hero'));
  assert.ok(keys.includes('completed'));
});

test('cada execução usa pasta própria com três imagens novas', () => {
  const p=storagePaths('abc');
  assert.match(p.hero,/abc/);
  assert.match(p.lifestyle,/abc/);
  assert.match(p.detail,/abc/);
});

test('card simples continua disponível', () => {
  const c=buildCardJson({id:'x',analysis:{nome_cadastro:'Produto',descricao_vitrine:'Desc'}},[]);
  assert.equal(c.name,'Produto');
});

test('card completo não expõe logo e mantém três imagens ordenadas', () => {
  const rows=[{kind:'detail',image_url:'d'},{kind:'hero',image_url:'h'},{kind:'lifestyle',image_url:'l'}];
  const c=buildFullCardJson({id:'x',analysis:{nome_cadastro:'Produto',descricao_vitrine:'Desc'}},rows);
  assert.deepEqual(c.gallery.map(x=>x.kind),['hero','lifestyle','detail']);
  assert.equal('logo' in c,false);
});

test('site e rota pública não renderizam logo', () => {
  const publicHtml=readFileSync(new URL('../amemais/index.html', import.meta.url),'utf8');
  assert.doesNotMatch(publicHtml,/logo-ame/i);
});

test('usa OPENAI_API_KEY quando disponível', async () => {
  const sb={rpc:async()=>({data:'vault-key',error:null})};
  assert.equal(await resolveOpenAiKey('env-key',sb),'env-key');
});

test('busca chave no Vault quando variável da Edge Function não existe', async () => {
  const sb={rpc:async()=>({data:'vault-key',error:null})};
  assert.equal(await resolveOpenAiKey('',sb),'vault-key');
});

test('retorna vazio se nenhuma chave estiver configurada', async () => {
  const sb={rpc:async()=>({data:null,error:{message:'missing'}})};
  assert.equal(await resolveOpenAiKey('',sb),'');
});

test('rota pública /amemais usa a aplicação promovida sem redirecionar', () => {
  const html=readFileSync(new URL('../amemais/index.html', import.meta.url),'utf8');
  assert.match(html,/\.\/styles\.css/);
  assert.match(html,/\.\/app\.js/);
  assert.doesNotMatch(html,/http-equiv=["']refresh/i);
});