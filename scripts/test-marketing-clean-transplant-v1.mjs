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
  'marketingCenter'
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

console.log('PASS: clean Marketing backend transplant is complete, JWT-protected, and not wired into the public Admin.');
