import fs from 'node:fs';
import assert from 'node:assert/strict';

const orderTransport = fs.readFileSync('supabase/functions/admin-orders-v1/index.ts', 'utf8');

assert.ok(
  orderTransport.includes('return `• ${qty}x ${name}`;'),
  'each WhatsApp product line must start with a bullet marker'
);
assert.ok(
  orderTransport.includes('const productsText=lines.join("\\n")'),
  'products must be separated by real line breaks'
);
assert.ok(
  orderTransport.includes('items_text:details.productsText'),
  'items_text must preserve the same multiline product text'
);
assert.ok(
  !orderTransport.includes('lines.join(" • ")'),
  'products must never be flattened into one line'
);

console.log('WhatsApp order items multiline marker contract: ok');
