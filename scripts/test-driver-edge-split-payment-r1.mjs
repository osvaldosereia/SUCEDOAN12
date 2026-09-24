import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/driver-logistics-v1/index.ts','utf8');
assert.match(fn,/driver_deliver_stop_v4/);
assert.match(fn,/credit_card/);
assert.match(fn,/food_meal_card/);
assert.match(fn,/payments\.length<1\|\|incoming\.length>8|incoming\.length<1\|\|incoming\.length>8/);
assert.match(fn,/sensitive_card_data_forbidden/);
assert.match(fn,/reference:clean\(raw\.reference,120\)/);
assert.doesNotMatch(fn,/driver_deliver_stop_v3/);
console.log('OK driver Edge split-payment V4');
