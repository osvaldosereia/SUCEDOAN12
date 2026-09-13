import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_INPUT_PHOTOS,
  OUTPUT_KINDS,
  IMAGE_OUTPUT,
  sanitizeEan,
  sanitizePrice,
  formatPriceBRL,
  validateInputFiles,
  rememberRunId,
  buildImagePrompts,
  shouldEscalateV2,
  normalizeAnalysisV2,
} from '../supabase/functions/ame-mais-analyze-v2/core.mjs';

test('v2 aceita no máximo três fotos e gera quatro saídas low', () => {
  assert.equal(MAX_INPUT_PHOTOS, 3);
  assert.deepEqual(OUTPUT_KINDS, ['hero','lifestyle','detail','alternate']);
  assert.equal(IMAGE_OUTPUT.quality, 'low');
  assert.equal(IMAGE_OUTPUT.size, '1024x1024');
});

test('EAN é opcional, apenas dígitos e limitado a 14', () => {
  assert.equal(sanitizeEan(''), '');
  assert.equal(sanitizeEan('789 123-4567890'), '7891234567890');
  assert.equal(sanitizeEan('123456789012345678'), '12345678901234');
});

test('valor é opcional e vazio aparece como R$ 0,00', () => {
  assert.equal(sanitizePrice(''), 0);
  assert.equal(sanitizePrice('19,90'), 19.9);
  assert.equal(sanitizePrice('R$ 1.234,56'), 1234.56);
  assert.equal(formatPriceBRL(0), 'R$ 0,00');
  assert.equal(formatPriceBRL(19.9), 'R$ 19,90');
});

test('v2 usa uma única descrição completa de e-commerce', () => {
  const a=normalizeAnalysisV2({tipo_produto:'Terço',nome_cadastro:'Terço Cristal',descricao_ecommerce:'Descrição detalhada de venda.',confianca_geral:.9});
  assert.equal(a.descricao_ecommerce,'Descrição detalhada de venda.');
  assert.equal('descricao_cadastro' in a,false);
  assert.equal('descricao_vitrine' in a,false);
});

test('validação permite 1 a 3 fotos e rejeita 4', () => {
  const f=()=>({type:'image/jpeg',size:200000});
  assert.equal(validateInputFiles([f()]).ok,true);
  assert.equal(validateInputFiles([f(),f(),f()]).ok,true);
  assert.equal(validateInputFiles([]).ok,false);
  assert.equal(validateInputFiles([f(),f(),f(),f()]).ok,false);
});

test('histórico mantém somente as três últimas criações sem duplicar', () => {
  let ids=[];
  ids=rememberRunId(ids,'a'); ids=rememberRunId(ids,'b'); ids=rememberRunId(ids,'c'); ids=rememberRunId(ids,'d');
  assert.deepEqual(ids,['d','c','b']);
  ids=rememberRunId(ids,'c');
  assert.deepEqual(ids,['c','d','b']);
});

test('quatro prompts são low-cost e proíbem branding adicional', () => {
  const prompts=buildImagePrompts({tipo_produto:'Terço',nome_cadastro:'Terço Cristal'});
  assert.deepEqual(prompts.map(x=>x.kind),OUTPUT_KINDS);
  for(const p of prompts){
    assert.match(p.prompt,/não adicione logo|sem logo/i);
    assert.match(p.prompt,/mesmo produto/i);
  }
});

test('escalada avançada só ocorre com confiança realmente baixa ou campos essenciais ausentes', () => {
  assert.equal(shouldEscalateV2({confianca_geral:.82,tipo_produto:'Terço',nome_cadastro:'Terço',descricao_ecommerce:'Descrição'}),false);
  assert.equal(shouldEscalateV2({confianca_geral:.58,tipo_produto:'Terço',nome_cadastro:'Terço',descricao_ecommerce:'Descrição'}),true);
  assert.equal(shouldEscalateV2({confianca_geral:.95,tipo_produto:'',nome_cadastro:'',descricao_ecommerce:''}),true);
});

test('rota principal amemais usa a versão aprovada', () => {
  const html=readFileSync(new URL('../amemais/index.html', import.meta.url),'utf8');
  assert.match(html,/Cadastro inteligente por fotos/i);
  assert.match(html,/eanInput/);
  assert.match(html,/scanEanInput/);
  assert.match(html,/photoInput/);
  assert.match(html,/priceInput/);
  assert.match(html,/ecommerceDescription/);
  assert.doesNotMatch(html,/catalogDescription|storefrontDescription/);
  assert.match(html,/recentCreations/);
  assert.match(html,/imageModal/);
  assert.match(html,/modalClose/);
  assert.match(html,/\.\/app\.js/);
  assert.doesNotMatch(html,/ame-mais\/app\.js/i);
});

test('amemais2 redireciona para a rota principal amemais', () => {
  const html=readFileSync(new URL('../amemais2/index.html', import.meta.url),'utf8');
  assert.match(html,/\/amemais\//i);
  assert.match(html,/location\.replace/i);
});
