import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const api=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const storefront=fs.readFileSync('supabase/functions/simple-storefront-v1/index.ts','utf8');
const expiryMigration=fs.readFileSync('supabase/migrations/20260924235930_vitrine_expired_products_auto_deactivate_v2.sql','utf8');
const auditMigration=fs.readFileSync('supabase/migrations/20260924235945_product_expiry_audit_alerts_v1.sql','utf8');
const backfillMigration=fs.readFileSync('supabase/migrations/20260924235955_product_expiry_audit_backfill_v1.sql','utf8');

assert.match(admin,/data-product-active/);
assert.match(admin,/mobile-product-active/);
assert.match(admin,/Ativo · desativar/);
assert.match(admin,/id="productActive"/);
assert.match(admin,/active:state\.productFilters\.active/);
assert.match(admin,/Vencidos desativados/);
assert.match(admin,/renderExpiredDeactivatedNotice/);
assert.match(admin,/produto é desativado automaticamente/i);
assert.match(admin,/Produto vencido · corrija a validade antes de ativar/);
assert.match(admin,/id="operatorBadge"/);
assert.match(admin,/requireOperator\(\)/);
assert.match(admin,/renderTodayExpiryAlert/);
assert.match(admin,/loadExpiryAudit/);
assert.match(admin,/product_lifecycle_audit/);
assert.match(admin,/expiry_alerts/);

assert.match(api,/active_only:true/);
assert.match(api,/expired_deactivated:expiredDeactivated/);
assert.match(api,/deactivation_reason,deactivated_at/);
assert.match(api,/error:"product_inactive"/);
assert.match(api,/payload:\{product:fresh\}/);
assert.match(api,/writeProductLifecycleAudit/);
assert.match(api,/event="reactivated"/);
assert.match(api,/event="manual_deactivated"/);
assert.match(api,/event="auto_expired_deactivation"/);
assert.match(api,/async function listExpiryAlerts/);
assert.match(api,/async function listProductLifecycleAudit/);
assert.match(api,/action==="expiry_alerts"/);
assert.match(api,/action==="product_lifecycle_audit"/);
assert.match(api,/const activeFilter = text\(url\.searchParams\.get\("active"\), 12\)\.toLowerCase\(\)/);
assert.match(api,/activeFilter==="false"\|\|activeFilter==="inactive"/);

const expiry=api.slice(api.indexOf('async function listExpirations()'),api.indexOf('async function listExpiryAlerts()'));
assert.match(expiry,/eq\("active",true\)/);
assert.match(expiry,/gte\("expiration_date",today\)/);
assert.match(expiry,/eq\("deactivation_reason","expired"\)/);

assert.match(expiryMigration,/products_enforce_expiration_state_v1/);
assert.match(expiryMigration,/new\.active := false/);
assert.match(expiryMigration,/new\.stock_quantity := 0/);
assert.match(expiryMigration,/new\.auto_expiry_offer_enabled := false/);
assert.match(expiryMigration,/deactivation_reason = 'expired'/);
assert.match(expiryMigration,/expired_deactivated/);
assert.match(expiryMigration,/inactive_product/);

assert.match(auditMigration,/create table if not exists public\.product_lifecycle_audit/);
assert.match(auditMigration,/auto_expired_deactivation/);
assert.match(auditMigration,/Sistema · regra de validade/);
assert.match(auditMigration,/expired_audited/);
assert.match(backfillMigration,/backfilled/);

const productsStart=storefront.indexOf('async function products');
const detailStart=storefront.indexOf('async function productDetail');
assert.ok(productsStart>=0&&detailStart>productsStart);
assert.match(storefront.slice(productsStart,detailStart),/eq\("active", true\)/);

console.log('OK vitrine expiry lifecycle, alerts and operator audit');
