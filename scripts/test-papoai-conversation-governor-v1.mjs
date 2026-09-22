import assert from 'node:assert/strict';
import {
  detectCustomerDelegation,
  decideConversationAction,
  chooseProductClarifier
} from '../supabase/functions/_shared/papoai-conversation-governor-v1.mjs';

assert.equal(detectCustomerDelegation('não sei, você decide'),true);
assert.equal(detectCustomerDelegation('quero shampoo Seda'),false);

assert.equal(decideConversationAction({
  intent:'list_baskets',message:'qual o valor das cestas?',candidateCount:9
}).action,'RESPOND');

assert.equal(decideConversationAction({
  intent:'search_products',
  message:'qual o valor do shampoo?',
  query:'shampoo',
  candidateCount:12,
  resultLimit:12,
  clarificationCount:0,
  items:[
    {brand:'Seda',token_hits:1,total_tokens:1},
    {brand:'Darling',token_hits:1,total_tokens:1},
    {brand:'Palmolive',token_hits:1,total_tokens:1}
  ]
}).action,'ASK');

assert.equal(decideConversationAction({
  intent:'search_products',
  message:'quero shampoo seda',
  query:'shampoo seda',
  candidateCount:4,
  resultLimit:12,
  clarificationCount:0,
  items:[{brand:'Seda',token_hits:2,total_tokens:2}]
}).action,'RESPOND');

assert.equal(decideConversationAction({
  intent:'search_products',
  message:'não sei, você decide',
  query:'shampoo',
  candidateCount:20,
  resultLimit:12,
  clarificationCount:0,
  items:[]
}).action,'RECOMMEND');

assert.equal(decideConversationAction({
  intent:'search_products',
  message:'qual shampoo?',
  query:'shampoo',
  candidateCount:12,
  resultLimit:12,
  clarificationCount:2,
  items:[]
}).action,'RECOMMEND');

assert.equal(chooseProductClarifier({
  query:'shampoo',
  items:[{brand:'Seda'},{brand:'Darling'}]
}).key,'brand_preference');


assert.equal(decideConversationAction({
  intent:'search_products',
  message:'quero shampoo',
  query:'shampoo',
  candidateCount:12,
  resultLimit:12,
  clarificationCount:0,
  hasStrongPersonalization:true,
  items:[]
}).reason,'strong_customer_preference_available');

console.log('PASS: intelligent conversation governor');
