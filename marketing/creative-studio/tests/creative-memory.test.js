import test from 'node:test';
import assert from 'node:assert/strict';
import {composeDirectorMemory,buildAvoidanceProfile} from '../creative-memory.js';

const saved=[
  {territory:'aroma floral',concept:'Um campo inteiro dentro do frasco',hook:'Uma flor nasce atrás do frasco',story_signature:'flower-field-reveal'},
  {territory:'freshness',concept:'O frescor abre uma janela',hook:'Uma rajada atravessa a cena',story_signature:'breeze-window'}
];
const current={territory:'aroma floral',concept:'Flores escapam do frasco',hook:'Uma flor cresce do rótulo',payoff:'campo revela produto'};

test('adds current unproduced idea to recent memory for Outra ideia',()=>{
  const memory=composeDirectorMemory(saved,current);
  assert.equal(memory.length,3);
  assert.equal(memory.at(-1).concept,'Flores escapam do frasco');
  assert.equal(memory.at(-1).ephemeral,true);
});

test('builds compact avoidance profile without hidden reasoning',()=>{
  const profile=buildAvoidanceProfile(composeDirectorMemory(saved,current));
  assert.deepEqual(profile.avoidTerritories,['aroma floral','freshness']);
  assert.ok(profile.avoidConcepts.includes('um campo inteiro dentro do frasco'));
  assert.ok(profile.avoidConcepts.includes('flores escapam do frasco'));
  assert.ok(profile.avoidHooks.includes('uma flor cresce do rótulo'));
  assert.ok(profile.recentSignatures.includes('flower-field-reveal'));
});

test('caps memory to eight recent ideas and removes empty duplicates',()=>{
  const many=Array.from({length:12},(_,i)=>({territory:i%2?'humor':'humor',concept:`Ideia ${i}`,hook:'',story_signature:`s${i}`}));
  const memory=composeDirectorMemory(many,null);
  assert.equal(memory.length,8);
  const profile=buildAvoidanceProfile(memory);
  assert.deepEqual(profile.avoidTerritories,['humor']);
  assert.equal(profile.avoidHooks.length,0);
});
