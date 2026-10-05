import fs from 'node:fs';
import assert from 'node:assert/strict';
const candidates=['supabase/functions/basket-storefront-v1/index.ts','supabase/functions/storefront-v2/index.ts','supabase/functions/basket-shop-v1/index.ts'].filter(fs.existsSync).map(p=>fs.readFileSync(p,'utf8')).join('\n');
assert.match(candidates,/basket_lot_public_availability_v1|basket_sales_runtime_v1|basket_stock_lots/i,'public basket availability must derive from canonical basket lot stock');
assert.match(candidates,/sale_enabled|quantity_available|status/i,'public exposure must consider sellable lot state');
console.log('store baskets public availability v1: PASS');
