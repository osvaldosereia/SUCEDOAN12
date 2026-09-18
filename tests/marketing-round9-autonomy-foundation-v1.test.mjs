import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260918203000_marketing_round9_autonomy_foundation_v1.sql');
const insights=read('supabase/functions/admin-marketing-insights-v1/index.ts');
const api=read('admin/marketing-api.js');
const admin=read('admin/marketing.js');
const html=read('admin/marketing.html');

test('Round 9 read models are deterministic and side-effect free',()=>{
  for(const fn of ['marketing_editorial_plan_v1','marketing_tracking_link_v1','marketing_learning_read_model_v1','marketing_daily_plan_preview_v1']){
    assert.match(migration,new RegExp('create or replace function public\\.'+fn,'i'),fn);
  }
  assert.match(migration,/preview_only/i);
  assert.match(migration,/external_side_effect',false/i);
  assert.doesNotMatch(migration,/publishing_enabled\s*=\s*true/i);
  assert.doesNotMatch(migration,/execution_mode\s*=\s*'canary'/i);
});

test('Editorial planner does not schedule or publish automatically',()=>{
  const start=migration.indexOf('marketing_editorial_plan_v1');
  const end=migration.indexOf('marketing_tracking_link_v1');
  const section=migration.slice(start,end);
  assert.match(section,/suggestions/i);
  assert.match(section,/auto_schedule/i);
  assert.doesNotMatch(section,/update public\.marketing_publication_jobs/i);
  assert.doesNotMatch(section,/insert into public\.marketing_publication_jobs/i);
});

test('Tracking preview uses canonical Dona Antonia destination and UTMs',()=>{
  const start=migration.indexOf('marketing_tracking_link_v1');
  const end=migration.indexOf('marketing_learning_read_model_v1');
  const section=migration.slice(start,end);
  assert.match(section,/donaantonia\.com\.br\/comprar/i);
  assert.match(section,/utm_source/i);
  assert.match(section,/utm_medium/i);
  assert.match(section,/utm_campaign/i);
  assert.match(section,/utm_content/i);
});

test('Learning engine requires evidence and never calls AI',()=>{
  const start=migration.indexOf('marketing_learning_read_model_v1');
  const end=migration.indexOf('marketing_daily_plan_preview_v1');
  const section=migration.slice(start,end);
  assert.match(section,/insufficient_data/i);
  assert.match(section,/minimum_publications/i);
  assert.match(section,/minimum_touchpoints/i);
  assert.doesNotMatch(section,/openai|gemini|anthropic/i);
});

test('Daily preview remains OFF and creates no campaign or job',()=>{
  const start=migration.indexOf('marketing_daily_plan_preview_v1');
  const section=migration.slice(start);
  assert.match(section,/runtime_mode/i);
  assert.match(section,/preview_only/i);
  assert.doesNotMatch(section,/insert into public\.marketing_campaigns/i);
  assert.doesNotMatch(section,/insert into public\.marketing_publication_jobs/i);
});

test('Insights Edge exposes Round 9 read-only actions',()=>{
  for(const action of ['editorial_plan','tracking_preview','learning','daily_plan_preview']){
    assert.ok(insights.includes('action==="'+action+'"'),action);
  }
  assert.match(insights,/external_side_effect:false/);
});

test('Admin API and UI expose planning without activation controls',()=>{
  for(const fn of ['getMarketingEditorialPlan','getMarketingTrackingPreview','getMarketingLearning','getMarketingDailyPlanPreview']){
    assert.ok(api.includes(fn),fn);
  }
  assert.match(admin,/renderEditorialPlan/);
  assert.match(admin,/renderLearningEngine/);
  assert.match(admin,/renderDailyPlanPreview/);
  assert.match(html,/Plano diário seguro/);
  assert.doesNotMatch(html,/Ativar automação diária/);
});
