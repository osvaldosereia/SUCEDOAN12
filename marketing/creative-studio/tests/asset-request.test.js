import test from 'node:test';
import assert from 'node:assert/strict';
import {proceduralKind,normalizeAssetRequest,isRealProductAssetRequest} from '../asset-request.js';

test('recognizes Portuguese aliases for procedural visuals',()=>{
  assert.equal(proceduralKind({need:'confete colorido'}),'confetti');
  assert.equal(proceduralKind({need:'estrelas brilhantes'}),'star');
  assert.equal(proceduralKind({need:'gradiente suave'}),'gradient');
  assert.equal(proceduralKind({need:'partículas no ar'}),'particles');
  assert.equal(proceduralKind({need:'raios de luz'}),'ray');
});

test('normalizes accents before semantic procedural matching',()=>{
  const n=normalizeAssetRequest({need:'Círculos e partículas',keywords:['Celebração']});
  assert.equal(n.need,'circulos e particulas');
  assert.deepEqual(n.keywords,['celebracao']);
});

test('recognizes real product packshot requests so they never go to an external asset provider',()=>{
  assert.equal(isRealProductAssetRequest({
    need:'Imagem real da embalagem do produto para uso como packshot principal',
    keywords:['Chocolate Bis Original ao Leite Nestlé 100,8 g','embalagem real','packshot frontal'],
    role:'produto principal'
  }),true);
  assert.equal(isRealProductAssetRequest({need:'Logo oficial da marca para o fechamento',role:'marca'}),true);
});

test('does not mistake ordinary supporting story objects for protected real product data',()=>{
  assert.equal(isRealProductAssetRequest({need:'pedaços de chocolate voando',keywords:['chocolate','crocante'],role:'support'}),false);
  assert.equal(isRealProductAssetRequest({need:'fundo de cozinha aconchegante',role:'background'}),false);
});
