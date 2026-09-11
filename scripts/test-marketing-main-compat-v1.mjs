import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin = fs.readFileSync('admin/config.js','utf8');
const supabase = fs.readFileSync('supabase/config.toml','utf8');

// Current main Admin is intentionally small/app-lite based. Marketing may extend it,
// but this isolated branch must not resurrect unrelated legacy module loaders.
for (const token of [
  "edgeFunction: 'admin-ops-v1'",
  "basketsEdgeFunction: 'admin-baskets-v1'",
  "customerEdgeFunction: 'customer-intelligence-v1'",
  "countAppUrl: '../contagem/'",
  "marketingEdgeFunction: 'admin-marketing-v1'",
  "marketingWorkflowEdgeFunction: 'admin-marketing-workflow-v1'",
  'marketingUiEnabled: true',
  'loadMarketingCenter'
]) assert.ok(admin.includes(token), `admin/config.js compatibility token missing: ${token}`);

for (const forbidden of [
  "productsEdgeFunction: 'admin-products-live-v1'",
  "chatMenuEdgeFunction: 'admin-chat-menu-v1'",
  'loadProductsLiveUi',
  'loadProductsConsoleV3',
  'loadChatMenuAdmin',
  'loadHumanServiceCenter',
  'loadFinancialAdmin'
]) assert.ok(!admin.includes(forbidden), `admin/config.js must not resurrect unrelated legacy integration: ${forbidden}`);

for (const section of [
  '[functions.conversation-worker-v3]',
  '[functions.dona-antonia-agent-core-v1]',
  '[functions.admin-agent-learning-v1]',
  '[functions.admin-pin-auth-v1]',
  '[functions.shopping-chat-v1]',
  '[functions.shopping-chat-products-v1]',
  '[functions.shopping-chat-menu-v1]',
  '[functions.admin-chat-menu-v1]',
  '[functions.admin-marketing-v1]',
  '[functions.admin-marketing-workflow-v1]',
  '[functions.admin-marketing-media-v1]',
  '[functions.admin-marketing-dry-run-v1]',
  '[functions.admin-marketing-insights-v1]',
  '[functions.admin-marketing-carousel-v1]',
  '[functions.admin-marketing-render-triage-v1]'
]) assert.ok(supabase.includes(section), `supabase/config.toml compatibility section missing: ${section}`);

for (const marketingFn of [
  'admin-marketing-v1',
  'admin-marketing-workflow-v1',
  'admin-marketing-media-v1',
  'admin-marketing-dry-run-v1',
  'admin-marketing-insights-v1',
  'admin-marketing-carousel-v1',
  'admin-marketing-render-triage-v1'
]) {
  const escaped = marketingFn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re = new RegExp(`\\[functions\\.${escaped}\\]\\s*\\nverify_jwt = true`);
  assert.match(supabase,re,`${marketingFn} must keep JWT verification enabled`);
}

assert.ok(!/marketingUiEnabled:\s*false/.test(admin),'Marketing Admin compatibility must not silently disable the module in its isolated branch');
console.log('PASS: Marketing branch extends the current simplified Admin without resurrecting unrelated legacy integrations.');
