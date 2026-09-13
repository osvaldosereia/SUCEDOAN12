import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_INPUT_PHOTOS,
  OUTPUT_KINDS,
  IMAGE_OUTPUT,
  sanitizeEan,
  validateInputFiles,
  rememberRunId,
  buildImagePrompts,
  shouldEscalateV2,
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
  assert.equal(shouldEscalateV2({confianca_geral:.82,tipo_produto:'Terço',nome_cadastro:'Terço',descricao_cadastro:'x',descricao_vitrine:'y'}),false);
  assert.equal(shouldEscalateV2({confianca_geral:.58,tipo_produto:'Terço',nome_cadastro:'Terço',descricao_cadastro:'x',descricao_vitrine:'y'}),true);
  assert.equal(shouldEscalateV2({confianca_geral:.95,tipo_produto:'',nome_cadastro:'',descricao_cadastro:'',descricao_vitrine:''}),true);
});

test('rota amemais2 existe isolada e aponta para app v2', () => {
  const html=readFileSync(new URL('../amemais2/index.html', import.meta.url),'utf8');
  assert.match(html,/Ame Mais 2/i);
  assert.match(html,/\.\/app\.js/);
  assert.doesNotMatch(html,/ame-mais\/app\.js/i);
});

test('frontend oferece EAN, três fotos e histórico', () => {
  const html=readFileSync(new URL('../amemais2/index.html', import.meta.url),'utf8');
  assert.match(html,/eanInput/);
  assert.match(html,/scanEanInput/);
  assert.match(html,/photoInput/);
  assert.match(html,/recentCreations/);
});
