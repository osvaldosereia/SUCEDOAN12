import assert from 'node:assert/strict';
import fs from 'node:fs';

const publicAdmin = fs.readFileSync('admin/app-lite.js','utf8');
const supabaseConfig = fs.readFileSync('supabase/config.toml','utf8');

// The official simplified Admin is intentionally public/no-session today.
// Marketing must remain dormant there until a protected authenticated host exists.
for (const forbidden of [
  'admin-marketing-v1',
  'admin-marketing-workflow-v1',
  'admin-marketing-media-v1',
  'admin-marketing-dry-run-v1',
  'admin-marketing-insights-v1',
  'admin-marketing-carousel-v1',
  'admin-marketing-render-triage-v1',
  'marketing-center',
  'marketingCenter',
  'marketing-carousel-progress-v1',
  'marketing-editor-v1',
  'marketing-library-v1',
  'marketing-operations-readonly-v1',
  'marketing-readiness-readonly-v1',
  'marketing-approval-preview-readonly-v1',
  'marketing-ai-readiness-readonly-v1'
]) assert.ok(!publicAdmin.includes(forbidden), `public Admin must not load Marketing surface: ${forbidden}`);

const marketingFunctions = [
  'admin-marketing-v1',
  'admin-marketing-workflow-v1',
  'admin-marketing-media-v1',
  'admin-marketing-dry-run-v1',
  'admin-marketing-insights-v1',
  'admin-marketing-carousel-v1',
  'admin-marketing-render-triage-v1'
];

for (const slug of marketingFunctions) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(
    supabaseConfig,
    new RegExp(`\\[functions\\.${escaped}\\]\\s*\\nverify_jwt = true`),
    `${slug} must stay protected by JWT`
  );
  assert.ok(fs.existsSync(`supabase/functions/${slug}/index.ts`), `${slug} source missing`);
}

const dormantUiFiles = [
  'admin-v3/marketing-center.css',
  'admin-v3/marketing-carousel-progress-v1.js',
  'admin-v3/marketing-editor-v1.js',
  'admin-v3/marketing-library-v1.js',
  'admin-v3/marketing-operations-readonly-v1.js',
  'admin-v3/marketing-readiness-readonly-v1.js',
  'admin-v3/marketing-approval-preview-readonly-v1.js',
  'admin-v3/marketing-ai-readiness-readonly-v1.js'
];
for (const file of dormantUiFiles) assert.ok(fs.existsSync(file), `dormant Marketing UI asset missing: ${file}`);

const externalProviderPattern=/graph\.facebook\.com|api\.pinterest\.com|mybusiness\.googleapis\.com|api\.openai\.com|generativelanguage\.googleapis\.com/;
const carouselProgress = fs.readFileSync('admin-v3/marketing-carousel-progress-v1.js','utf8');
assert.match(carouselProgress, /Authorization:`Bearer \$\{a\.access_token\}`/, 'private carousel progress reader must send bearer JWT');
assert.match(carouselProgress, /external_side_effect!==false/, 'private carousel progress reader must fail closed on side-effect marker');
assert.match(carouselProgress, /admin-marketing-carousel-v1/, 'private carousel progress reader must use the protected Marketing carousel edge');
assert.ok(!externalProviderPattern.test(carouselProgress), 'dormant progress UI must not call external providers directly');

const editor = fs.readFileSync('admin-v3/marketing-editor-v1.js','utf8');
assert.match(editor, /Authorization:`Bearer \$\{a\.access_token\}`/, 'private editor must send bearer JWT');
assert.match(editor, /external_side_effect!==false/, 'private editor must fail closed on side-effect marker');
assert.match(editor, /admin-marketing-workflow-v1/, 'private editor must use the protected Marketing workflow edge');
assert.ok(!externalProviderPattern.test(editor), 'dormant editor must not call external providers directly');

const library = fs.readFileSync('admin-v3/marketing-library-v1.js','utf8');
assert.match(library, /Authorization:`Bearer \$\{a\.access_token\}`/, 'private library must send bearer JWT');
assert.match(library, /external_side_effect!==false/, 'private library must fail closed on side-effect marker');
assert.match(library, /admin-marketing-v1/, 'private library must use protected Marketing edge');
assert.ok(!externalProviderPattern.test(library), 'dormant library must not call external providers directly');

const operations = fs.readFileSync('admin-v3/marketing-operations-readonly-v1.js','utf8');
assert.match(operations, /Authorization:`Bearer \$\{a\.access_token\}`/, 'private operations reader must send bearer JWT');
assert.match(operations, /external_side_effect!==false/, 'private operations reader must fail closed on side-effect marker');
assert.match(operations, /admin-marketing-workflow-v1/, 'private operations reader must use protected workflow edge');
assert.ok(!externalProviderPattern.test(operations), 'dormant operations reader must not call external providers directly');
assert.ok(!/call\('(submit_review|approve_asset|schedule_job|unschedule_job|publish|execute|requeue)'/.test(operations),'dormant operations reader must stay read-only');

const readiness = fs.readFileSync('admin-v3/marketing-readiness-readonly-v1.js','utf8');
assert.match(readiness, /Authorization:`Bearer \$\{a\.access_token\}`/, 'private readiness reader must send bearer JWT');
assert.match(readiness, /external_side_effect!==false/, 'private readiness reader must fail closed on side-effect marker');
assert.match(readiness, /admin-marketing-insights-v1/, 'private readiness reader must use protected insights edge');
assert.ok(!externalProviderPattern.test(readiness), 'dormant readiness reader must not call external providers directly');
assert.ok(!/call\('(publish|execute|schedule_job|approve_asset|requeue|kill|create_|update_)/.test(readiness),'dormant readiness reader must stay read-only');

const approvalPreviewUi = fs.readFileSync('admin-v3/marketing-approval-preview-readonly-v1.js','utf8');
assert.ok(!/fetch\(|XMLHttpRequest|axios|Authorization|Bearer /.test(approvalPreviewUi),'approval preview UI must stay local-only');
assert.ok(!externalProviderPattern.test(approvalPreviewUi),'approval preview UI must not call external providers directly');
assert.match(approvalPreviewUi,/external_side_effect/,'approval preview UI must validate side-effect contract');
assert.match(approvalPreviewUi,/ready_for_real_publish/,'approval preview UI must validate publish-readiness contract');

const aiReadinessUi = fs.readFileSync('admin-v3/marketing-ai-readiness-readonly-v1.js','utf8');
assert.ok(!/fetch\(|XMLHttpRequest|axios|Authorization|Bearer |localStorage|sessionStorage/.test(aiReadinessUi),'AI readiness UI must stay local-only and credential-free');
assert.ok(!externalProviderPattern.test(aiReadinessUi),'AI readiness UI must not call external providers directly');
assert.match(aiReadinessUi,/provider_call_allowed/,'AI readiness UI must validate provider-call prohibition');
assert.match(aiReadinessUi,/external_side_effect/,'AI readiness UI must validate side-effect prohibition');
assert.match(aiReadinessUi,/network_allowed/,'AI readiness UI must validate network prohibition');

const migrations = [
  '20260910004500_marketing_center_foundation_v1.sql',
  '20260910004600_marketing_default_presets_v1.sql',
  '20260910004650_marketing_performance_hardening_v1.sql',
  '20260910054800_marketing_media_render_queue_v2.sql',
  '20260910074400_marketing_render_worker_hardening_v3.sql',
  '20260910085000_marketing_review_calendar_v4.sql',
  '20260910093500_marketing_asset_editor_v5.sql',
  '20260910094600_marketing_asset_editor_privileges_v5_fix.sql',
  '20260910104500_marketing_render_media_registry_v6.sql',
  '20260910113000_marketing_private_media_v7.sql',
  '20260910114500_marketing_carousel_slides_v8.sql',
  '20260910143000_marketing_metrics_read_model_v9.sql',
  '20260910185000_marketing_attribution_foundation_v10.sql',
  '20260910185500_marketing_attribution_privileges_v10_fix.sql',
  '20260910194000_marketing_carousel_render_spec_v11.sql',
  '20260910215500_marketing_carousel_output_binding_v12.sql',
  '20260911005000_marketing_render_metrics_v13.sql',
  '20260911014500_marketing_render_kind_metrics_v14.sql',
  '20260911024500_marketing_render_diagnostics_v15.sql',
  '20260911044000_marketing_render_triage_v16.sql',
  '20260911044100_marketing_render_triage_v16_hardening.sql',
  '20260911044200_marketing_render_triage_v16_privilege_hardening.sql',
  '20260911054500_marketing_render_triage_cancel_v17.sql',
  '20260911065000_marketing_render_triage_metrics_v18.sql',
  '20260911114000_marketing_render_triage_sla_v19.sql'
];
for (const migration of migrations) {
  assert.ok(fs.existsSync(`supabase/migrations/${migration}`), `Marketing migration missing: ${migration}`);
}

const foundation = fs.readFileSync('supabase/migrations/20260910004500_marketing_center_foundation_v1.sql','utf8');
for (const invariant of ['kill_switch', 'canary_percent', 'execution_mode']) {
  assert.ok(foundation.includes(invariant), `foundation safety invariant missing: ${invariant}`);
}

console.log('PASS: clean Marketing transplant stays JWT-protected, rollout-off, and disconnected from the public Admin.');
