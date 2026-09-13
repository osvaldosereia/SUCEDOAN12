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
  normalizeProductType,
  getSceneProfile,
} from '../supabase/functions/ame-mais-analyze-v1/core.mjs';
import {
  validatePhotoFile,
  buildWhatsAppUrl,
  buildProductCardModel,
  buildRunCardModel,
} from '../ame-mais/app-core.mjs';

test('exige as cinco características fixas da taxonomia', () => {
  assert.deepEqual(PRODUCT_FIELDS, ['tipo_produto','devocao_tema','material_modelo','cor_acabamento','diferencial_tamanho']);
});

test('prompt proíbe adivinhar devoção, material ou tamanho', () => {
  const p = buildAnalysisPrompt();
  assert.match(p, /NUNCA adivinhe/i);
  assert.match(p, /devo[cç][aã]o/i);
  assert.match(p, /material/i);
  assert.match(p, /tamanho/i);
  assert.match(p, /descri[cç][aã]o comercial/i);
  assert.match(p, /conflitos/i);
});

test('normalização esvazia devoção quando confiança é baixa e preserva conflitos', () => {
  const result = normalizeAnalysis({
    tipo_produto:'Terço', devocao_tema:'Nossa Senhora Aparecida', material_modelo:'Cristal',
    cor_acabamento:'Branco', diferencial_tamanho:'Com crucifixo', nome_cadastro:'Terço Cristal Branco',
    descricao_cadastro:'Descrição objetiva.', descricao_vitrine:'Descrição comercial.', termos_busca:['terço','cristal'],
    confianca_geral:0.82, confianca_devocao:0.61, precisa_revisao:false, motivo_revisao:'',
    conflitos:['medalha não identificada'], observacoes:['foto com reflexo']
  });
  assert.equal(result.devocao_tema, '');
  assert.equal(result.precisa_revisao, true);
  assert.deepEqual(result.conflitos,['medalha não identificada']);
  assert.deepEqual(result.observacoes,['foto com reflexo']);
});

test('normaliza tipos de produto para perfis visuais conhecidos', () => {
  assert.equal(normalizeProductType('Terço'),'terco_rosario');
  assert.equal(normalizeProductType('rosário'),'terco_rosario');
  assert.equal(normalizeProductType('camiseta católica'),'camiseta');
  assert.equal(normalizeProductType('estátua de santo'),'estatua_imagem');
  assert.equal(normalizeProductType('imagem de Nossa Senhora'),'estatua_imagem');
  assert.equal(normalizeProductType('quadro religioso'),'quadro');
  assert.equal(normalizeProductType('chaveiro'),'chaveiro');
  assert.equal(normalizeProductType('vela votiva'),'generico');
});

test('todo perfil produz exatamente hero lifestyle detail', () => {
  for (const tipo of ['Terço','Rosário','Camiseta','Estátua','Imagem','Quadro','Chaveiro','Vela']) {
    const profile=getSceneProfile({tipo_produto:tipo,nome_cadastro:`Produto ${tipo}`});
    assert.deepEqual(profile.scenes.map(x=>x.kind),['hero','lifestyle','detail']);
    assert.equal(profile.scenes.length,3);
  }
});

test('terço usa mão segurando, uso e close-up', () => {
  const p=getSceneProfile({tipo_produto:'Terço',nome_cadastro:'Terço Cristal Branco'});
  assert.equal(p.profile_key,'terco_rosario');
  assert.match(p.scenes[0].prompt,/m[aã]o humana.*segurando/i);
  assert.match(p.scenes[1].prompt,/uso|contexto devocional/i);
  assert.match(p.scenes[2].prompt,/close-up|macro/i);
});

test('categorias principais têm cenas próprias', () => {
  assert.match(getSceneProfile({tipo_produto:'Camiseta'}).scenes[0].prompt,/vestindo/i);
  assert.match(getSceneProfile({tipo_produto:'Estátua'}).scenes[0].prompt,/ambienta[cç][aã]o devocional/i);
  assert.match(getSceneProfile({tipo_produto:'Quadro'}).scenes[0].prompt,/parede/i);
  assert.match(getSceneProfile({tipo_produto:'Chaveiro'}).scenes[0].prompt,/m[aã]o.*chaveiro/i);
});

test('não usa mais fundo cinza nos três prompts universais', () => {
  const prompts=buildImagePrompts({tipo_produto:'Terço',nome_cadastro:'Terço Cristal Branco'});
  assert.deepEqual(prompts.map(x=>x.kind),['hero','lifestyle','detail']);
  assert.equal(prompts.length,3);
  for (const p of prompts) {
    assert.doesNotMatch(p.prompt,/#ECECEC|fundo cinza/i);
    assert.match(p.prompt,/ultra[- ]?real|fotogr[aá]fic/i);
  }
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

test('processamento expõe as novas etapas reais', () => {
  const labels = PROCESSING_STEPS.map(x => x.label).join(' | ');
  assert.match(labels,/Preparando foto/i);
  assert.match(labels,/Salvando original/i);
  assert.match(labels,/Analisando produto/i);
  assert.match(labels,/Escolhendo perfil visual/i);
  assert.match(labels,/Gerando foto 1/i);
  assert.match(labels,/Gerando foto 2/i);
  assert.match(labels,/Gerando foto 3/i);
  assert.match(labels,/Montando card/i);
});

test('cada execução usa pasta própria com três imagens novas', () => {
  const sid='123e4567-e89b-12d3-a456-426614174000';
  const p=storagePaths(sid);
  assert.equal(p.original,`runs/${sid}/original.jpg`);
  assert.equal(p.hero,`runs/${sid}/hero.webp`);
  assert.equal(p.lifestyle,`runs/${sid}/lifestyle.webp`);
  assert.equal(p.detail,`runs/${sid}/detail.webp`);
  assert.equal(p.result,`runs/${sid}/result.json`);
});

test('card simples continua disponível', () => {
  const card=buildProductCardModel({nome_cadastro:'Terço Cristal Branco',descricao_vitrine:'Uma peça delicada.'},{url:'https://example.com/p.webp',kind:'hero'});
  assert.equal(card.name,'Terço Cristal Branco');
  assert.equal(card.imageUrl,'https://example.com/p.webp');
  assert.equal(card.aspectRatio,'1 / 1');
});

test('card completo tem logo, três imagens ordenadas e hero ativa', () => {
  const run={id:'r1',analysis:{nome_cadastro:'Terço Cristal Branco',descricao_cadastro:'Busca.',descricao_vitrine:'Venda.',tipo_produto:'Terço',devocao_tema:'',material_modelo:'Cristal',cor_acabamento:'Branco',diferencial_tamanho:'Crucifixo',termos_busca:['terço'],conflitos:['medalha incerta'],confianca_geral:.91},images:{
    detail:{kind:'detail',url:'https://e/d.webp'},
    hero:{kind:'hero',url:'https://e/h.webp'},
    lifestyle:{kind:'lifestyle',url:'https://e/l.webp'},
  }};
  const card=buildRunCardModel(run,'/ame-mais/assets/logo-ame-store.jpg');
  assert.equal(card.logoUrl,'/ame-mais/assets/logo-ame-store.jpg');
  assert.deepEqual(card.gallery.map(x=>x.kind),['hero','lifestyle','detail']);
  assert.equal(card.activeKind,'hero');
  assert.equal(card.name,'Terço Cristal Branco');
  assert.deepEqual(card.conflicts,['medalha incerta']);
});

test('usa OPENAI_API_KEY quando disponível', async () => {
  let called=false; const sb={rpc:async()=>{called=true;return{data:'vault-key',error:null}}};
  assert.equal(await resolveOpenAiKey('env-key',sb),'env-key');
  assert.equal(called,false);
});

test('busca chave no Vault quando variável da Edge Function não existe', async () => {
  const sb={rpc:async(name)=>{assert.equal(name,'get_conversation_worker_provider_secret_v1');return{data:'vault-key',error:null};}};
  assert.equal(await resolveOpenAiKey('',sb),'vault-key');
});

test('retorna vazio se nenhuma chave estiver configurada', async () => {
  const sb={rpc:async()=>({data:null,error:{message:'missing'}})};
  assert.equal(await resolveOpenAiKey('',sb),'');
});
