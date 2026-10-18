import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
function section(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j)}
const set=section('async function setProductStockOfficial(','async function ');
for(const re of [/auth\?\.role==="viewer"/,/target<0/,/bling_stock_authority_not_active/,/preview_stock_sync/,/ensureProductLinkedForStock/,/change_required!==true/,/idempotency_key:idem/,/operation:"set_stock"/,/process_stock_jobs/,/job\?\.status!=="synced"/,/stock_update_unverified/,/product\.stock_set/])assert.match(set,re);
const incident=section('async function createInventoryIncident(','async function glist(');
for(const re of [/auth\?\.role==="viewer"/,/qty<=0/,/damage/,/expired/,/loss/,/return/,/ops_record_inventory_incident_v1/])assert.match(incident,re);
const classify=section('async function classifyStockReconciliation(','async function inventoryIncidents(');
for(const re of [/cause_note_required/,/ops_classify_stock_reconciliation_v1/,/p_evidence_ref/])assert.match(classify,re);
console.log('Admin Bling stock adjustment and incident contract: PASS');
