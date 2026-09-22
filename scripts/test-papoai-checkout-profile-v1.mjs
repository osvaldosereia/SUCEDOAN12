import assert from 'node:assert/strict';
import {deterministicCheckoutProfile,missingCheckoutProfileFields,checkoutProfileMissingPrompt} from '../supabase/functions/_shared/papoai-checkout-profile-v1.mjs';

const p=deterministicCheckoutProfile('Maria Aparecida, Rua das Flores 123, Centro, Cuiabá',{needName:true});
assert.equal(p.name,'Maria Aparecida');
assert.equal(p.street,'Rua das Flores');
assert.equal(p.number,'123');
assert.equal(p.neighborhood,'Centro');
assert.equal(p.city,'Cuiabá');
assert.deepEqual(missingCheckoutProfileFields(p,{needName:true}),[]);

const q=deterministicCheckoutProfile('Rua das Flores 123, Cuiabá',{needName:true});
const missing=missingCheckoutProfileFields(q,{needName:true});
assert.ok(missing.includes('name'));
assert.ok(missing.includes('neighborhood'));
assert.ok(checkoutProfileMissingPrompt(missing).includes('uma única mensagem'));

console.log('PASS: checkout profile parser');
