import fs from 'node:fs';
import assert from 'node:assert/strict';
const files=['supabase/functions/shopping-checkout-v2/index.ts','supabase/functions/shopping-chat-checkout-v2/index.ts','supabase/functions/basket-storefront-v1/index.ts','supabase/functions/storefront-v2/index.ts'].filter(fs.existsSync).map(p=>fs.readFileSync(p,'utf8')).join('\n');
assert.doesNotMatch(files,/store_basket_reserved_v1[\s\S]{0,600}(products|stock)[\s\S]{0,300}(decrement|update|subtract)/i,'mounted store basket must not re-decrement component stock through legacy path');
console.log('store baskets no legacy double stock v1: PASS');
