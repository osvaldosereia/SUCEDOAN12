import assert from 'node:assert/strict';
import {deterministicCommerceIntent} from '../supabase/functions/_shared/papoai-commerce-intent-v1.mjs';
assert.equal(deterministicCommerceIntent('Quais cestas vocês têm?').intent,'list_baskets');
assert.equal(deterministicCommerceIntent('O que vem na Mini Bonini?').intent,'basket_detail');
assert.equal(deterministicCommerceIntent('Quero a Mini Bonini').intent,'start_basket');
assert.equal(deterministicCommerceIntent('Tem alguma oferta hoje?').intent,'offers');
assert.equal(deterministicCommerceIntent('quero falar com uma pessoa').intent,'handoff');
assert.equal(deterministicCommerceIntent('preciso de shampoo'),null);
console.log('PASS: PapoAI commerce intent deterministic router');
