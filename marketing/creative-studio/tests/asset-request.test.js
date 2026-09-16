import test from 'node:test';
import assert from 'node:assert/strict';
import {proceduralKind,normalizeAssetRequest} from '../asset-request.js';

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
