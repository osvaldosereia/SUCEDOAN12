import fs from 'node:fs';
import assert from 'node:assert/strict';

const src=fs.readFileSync('supabase/functions/admin-orders-v1/index.ts','utf8');

assert.ok(src.includes('const productOverflow=lines.length>60;'), 'orders over 60 items must be detected explicitly');
assert.ok(src.includes('const productBucket=productOverflow?0:Math.max(5,Math.ceil(lines.length/5)*5);'), 'orders up to 60 items must select the next 5-item template bucket');
assert.ok(src.includes('const productTemplateMode=productOverflow?"legacy_fallback":"bucketed";'), 'overflow orders must stay on the legacy full-text fallback');
assert.ok(src.includes('const productSlotCount=productOverflow?0:productBucket;'), 'overflow orders must not expose a silently truncated 60-slot payload');
assert.ok(src.includes('Array.from({length:productSlotCount}'), 'product slots must follow the selected bucket');
assert.ok(src.includes('productTemplateMode,'), 'order details must expose template mode');
assert.ok(src.includes('productOverflow,'), 'order details must expose overflow state');
assert.ok(src.includes('product_template_mode:details.productTemplateMode'), 'provider payload must expose template mode for PapoAI routing');
assert.ok(src.includes('product_overflow:details.productOverflow'), 'provider payload must expose overflow state for PapoAI routing');
assert.ok(src.includes('product_bucket:details.productBucket'), 'provider payload must preserve the selected bucket');
assert.ok(src.includes('items_text:details.itemsText'), 'legacy full-text fallback must remain available during rollout and overflow');

console.log('PapoAI bucketed product-template contract: ok');
