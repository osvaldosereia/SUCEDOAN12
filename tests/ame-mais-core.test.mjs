import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_FIELDS,
  buildAnalysisPrompt,
  normalizeAnalysis,
  buildImagePrompts,
  buildShareText,
} from '../supabase/functions/ame-mais-analyze-v1/core.mjs';
import { validatePhotoFile, buildWhatsAppUrl } from '../ame-mais/app-core.mjs';

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
