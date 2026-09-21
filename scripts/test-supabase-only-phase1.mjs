import fs from 'node:fs';
import assert from 'node:assert/strict';

const files=[
  'supabase/functions/inventory-fast-balance-v3/index.ts',
  'supabase/functions/inventory-fast-v1/index.ts',
  'supabase/functions/product-image-openai-grid18-v1/index.ts',
  'supabase/functions/product-image-openai-grid18-v1/source.mjs',
  'supabase/functions/product-image-openai-v2/index.ts',
  'validades/validades-supabase-v1.js',
  'cesta-mobile/cesta-mobile.js',
  'kit-mobile/kit-app-v3.js',
  'kit-mobile/kit-instagram-queue.js'
];

for(const file of files){
  const content=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(content,/firebaseio\.com/i, file+' must not contact Firebase');
  assert.doesNotMatch(content,/fetchFirebaseProduct|resolveFirebaseProduct|firebaseGet|syncFirebaseCatalog/i, file+' must not contain live Firebase lookup helpers');
}

const balance=fs.readFileSync(files[0],'utf8');
assert.match(balance,/source:"supabase_only"/);
assert.doesNotMatch(balance,/firebase_imported/);

const grid=fs.readFileSync(files[2],'utf8');
assert.match(grid,/product_source:'supabase_only'/);
assert.match(grid,/maintainSupabaseCatalog/);
assert.doesNotMatch(grid,/firebase_inactive/);

const source=fs.readFileSync(files[3],'utf8');
assert.match(source,/products\.image_source_url/);
assert.match(source,/products\.image_original_url/);
assert.match(source,/storage\.catalog-products/);

const individual=fs.readFileSync(files[4],'utf8');
assert.match(individual,/product_source: "supabase_only"/);
assert.doesNotMatch(individual,/firebase_identity_mismatch/);

console.log('supabase-only phase 1 contract ok');

const validityHtml=fs.readFileSync('validades/index.html','utf8');
assert.match(validityHtml,/validades-supabase-v1\.js/);
assert.doesNotMatch(validityHtml,/validades\.js\?/);

const basketHtml=fs.readFileSync('cesta-mobile/index.html','utf8');
assert.doesNotMatch(basketHtml,/Firebase URL|productsNode/i);
assert.match(basketHtml,/cesta-mobile\.js\?v=20260921-supabase-1/);

const kitHtml=fs.readFileSync('kit-mobile/index.html','utf8');
assert.match(kitHtml,/Supabase · Admin V2/);
assert.match(kitHtml,/kit-app-v3\.js\?v=20260921-supabase-1/);

const secureApi=fs.readFileSync('admin/admin-secure-api-v1.js','utf8');
assert.match(secureApi,/Authorization:`Bearer \$\{session\.access_token\}`/);
assert.match(secureApi,/admin-products-live-v1/);

console.log('supabase-only operational UIs contract ok');
