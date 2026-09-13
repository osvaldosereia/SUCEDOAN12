import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_FIELDS,
  buildAnalysisPrompt,
  normalizeAnalysis,
  buildImagePrompts,
  buildShareText,
  IMAGE_OUTPUT,
  PROCESSING_STEPS,
  storagePaths,
  resolveOpenAiKey,
} from '../supabase/functions/ame-mais-analyze-v1/core.mjs';
import { validatePhotoFile, buildWhatsAppUrl, buildProductCardModel } from '../ame-mais/app-core.mjs';

test('exige as cinco características fixas da taxonomia', () => {
  assert.deepEqual(PRODUCT_FIELDS, [
    'tipo_produto','devocao_tema','material_modelo','cor_acabamento','diferencial_tamanho'
  ]);
});

test('prompt proíbe adivinhar devoção, material ou tamanho', () => {
  const p = buildAnalysisPrompt();
  assert.match(p, /NUNCA adivinhe/i);
  assert.match(p, /devo[cç][aã]o/i);
  assert.match(p, /material/i);
  assert.match(p, /tamanho/i);
  assert.match(p, /descri[cç][aã]o comercial/i);
});

test('normalização esvazia devoção quando confiança é baixa', () => {
  const result = normalizeAnalysis({
    tipo_produto:'Terço', devocao_tema:'Nossa Senhora Aparecida', material_modelo:'Cristal',
    cor_acabamento:'Branco', diferencial_tamanho:'Com crucifixo',
    nome_cadastro:'Terço Nossa Senhora Aparecida Cristal Branco',
    descricao_cadastro:'Descrição objetiva.', descricao_vitrine:'Descrição comercial.',
    termos_busca:['terço','cristal'], confianca_geral:0.82, confianca_devocao:0.61,
    precisa_revisao:false, motivo_revisao:''
  });
  assert.equal(result.devocao_tema, '');
  assert.equal(result.precisa_revisao, true);
  assert.match(result.motivo_revisao, /devo[cç][aã]o/i);
});

test('gera exatamente três prompts visuais com papéis distintos', () => {
  const prompts = buildImagePrompts({nome_cadastro:'Terço Cristal Branco'});
  assert.equal(prompts.length, 3);
  assert.equal(prompts[0].kind, 'principal');
  assert.match(prompts[0].prompt, /#ECECEC/i);
  assert.match(prompts[0].prompt, /extremamente fiel/i);
  assert.equal(prompts[1].kind, 'ambientada');
  assert.match(prompts[1].prompt, /produto como protagonista/i);
  assert.equal(prompts[2].kind, 'detalhe');
  assert.match(prompts[2].prompt, /detalhe vis[ií]vel/i);
});

test('texto de compartilhamento usa nome e descrição comercial', () => {
  const text = buildShareText({nome_cadastro:'Terço Cristal Branco',descricao_vitrine:'Uma peça delicada para presentear e viver a fé.'});
  assert.match(text, /Terço Cristal Branco/);
  assert.match(text, /presentear e viver a fé/);
});

test('valida arquivo de foto aceitando jpeg png webp e recusando acima de 10MB', () => {
  assert.equal(validatePhotoFile({type:'image/jpeg',size:500000}).ok, true);
  assert.equal(validatePhotoFile({type:'image/gif',size:500000}).ok, false);
  assert.equal(validatePhotoFile({type:'image/png',size:11*1024*1024}).ok, false);
});

test('url de whatsapp carrega o texto comercial codificado', () => {
  const u = buildWhatsAppUrl('Terço lindo\nDescrição comercial');
  assert.match(u, /^https:\/\/wa\.me\/\?text=/);
  assert.match(decodeURIComponent(u), /Terço lindo/);
});

test('imagens da vitrine são quadradas e low', () => {
  assert.equal(IMAGE_OUTPUT.size, '1024x1024');
  assert.equal(IMAGE_OUTPUT.quality, 'low');
  assert.equal(IMAGE_OUTPUT.format, 'webp');
});

test('processamento expõe etapas legíveis da IA', () => {
  const labels = PROCESSING_STEPS.map(x => x.label).join(' | ');
  assert.match(labels, /Preparando foto/i);
  assert.match(labels, /Analisando produto/i);
  assert.match(labels, /Criando nome/i);
  assert.match(labels, /descri[cç][aã]o comercial/i);
  assert.match(labels, /Gerando foto principal/i);
  assert.match(labels, /Validando fidelidade/i);
  assert.match(labels, /Salvando no Supabase/i);
});

test('cada execução usa uma pasta própria no bucket Ame Mais', () => {
  const sid='123e4567-e89b-12d3-a456-426614174000';
  const p=storagePaths(sid);
  assert.equal(p.original, `runs/${sid}/original.jpg`);
  assert.equal(p.principal, `runs/${sid}/principal.webp`);
  assert.equal(p.ambientada, `runs/${sid}/ambientada.webp`);
  assert.equal(p.detalhe, `runs/${sid}/detalhe.webp`);
});

test('card de vitrine usa imagem quadrada, nome e descrição comercial', () => {
  const card=buildProductCardModel({
    nome_cadastro:'Terço Cristal Branco',
    descricao_vitrine:'Uma peça delicada para presentear.',
  }, {url:'https://example.com/p.webp', kind:'principal'});
  assert.equal(card.name,'Terço Cristal Branco');
  assert.equal(card.description,'Uma peça delicada para presentear.');
  assert.equal(card.imageUrl,'https://example.com/p.webp');
  assert.equal(card.aspectRatio,'1 / 1');
});

test('usa OPENAI_API_KEY quando disponível', async () => {
  let called=false;
  const sb={rpc:async()=>{called=true;return{data:'vault-key',error:null}}};
  assert.equal(await resolveOpenAiKey('env-key',sb),'env-key');
  assert.equal(called,false);
});

test('busca chave no Vault quando variável da Edge Function não existe', async () => {
  const sb={rpc:async(name)=>{
    assert.equal(name,'get_conversation_worker_provider_secret_v1');
    return{data:'vault-key',error:null};
  }};
  assert.equal(await resolveOpenAiKey('',sb),'vault-key');
});

test('retorna vazio se nenhuma chave estiver configurada', async () => {
  const sb={rpc:async()=>({data:null,error:{message:'missing'}})};
  assert.equal(await resolveOpenAiKey('',sb),'');
});
