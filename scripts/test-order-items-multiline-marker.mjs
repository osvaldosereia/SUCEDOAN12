import fs from 'node:fs';
import assert from 'node:assert/strict';

const orderTransport = fs.readFileSync('supabase/functions/admin-orders-v1/index.ts', 'utf8');

assert.ok(
  orderTransport.includes('const productLines=lines.map(line=>`• ${line}`);'),
  'each visual WhatsApp product line must start with a bullet marker'
);
assert.ok(
  orderTransport.includes('const productsText=productLines.join("\\n")'),
  'visual product text must keep one product per line'
);
assert.ok(
  orderTransport.includes('const itemsText=lines.join(" • ")'),
  'template-safe fallback must remain single-line because Meta rejects newlines inside template parameters'
);
assert.ok(
  orderTransport.includes('products_text:details.productsText'),
  'provider payload must expose the multiline product text'
);
assert.ok(
  orderTransport.includes('items_text:details.itemsText'),
  'provider payload must keep the template-safe single-line fallback'
);

console.log('WhatsApp order items multiline marker contract: ok');
