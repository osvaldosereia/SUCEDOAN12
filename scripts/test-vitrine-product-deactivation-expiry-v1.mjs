import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const api=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260924235900_vitrine_inactive_products_ignore_expiry_v1.sql','utf8');

assert.match(admin,/data-product-active/);
assert.match(admin,/Produtos inativos ficam fora dos cálculos de validade/);
assert.match(api,/product_active/);
assert.match(api,/async function setProductActive/);

const expiry=api.slice(api.indexOf('async function listExpirations()'),api.indexOf('async function saveExpiration'));
assert.match(expiry,/eq\("active",true\)/);
assert.match(expiry,/not\("expiration_date","is",null\)/);
assert.match(migration,/where p\.organization_id = p_organization_id\s+and p\.active = true\s+and p\.expiration_date is not null/);

console.log('OK vitrine product deactivation + expiry ignore');
