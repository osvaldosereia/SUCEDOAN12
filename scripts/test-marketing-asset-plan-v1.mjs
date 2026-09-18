import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const must=(v,m)=>{if(!v)throw new Error(m)};
const brain=read('supabase/functions/admin-marketing-brain-v1/index.ts');
const insights=read('supabase/functions/admin-marketing-insights-v1/index.ts');
const api=read('admin/marketing-api.js');
const ui=read('admin/marketing.js');
const migration=read('supabase/migrations/20260918153500_marketing_asset_plan_v1_hardening.sql');

for(const role of ['feed_square','story_status','pinterest_pin','instagram_carousel','reel_light_10s']){
  must(brain.includes(role),'missing asset role '+role);
}
must(brain.includes('action==="plan_campaign_assets"'),'asset plan action missing');
must(brain.includes('action==="update_campaign_draft"'),'campaign edit action missing');
must(brain.includes('render_jobs_created:0'),'planner must create zero render jobs');
must(brain.includes('publication_jobs_created:0'),'planner must create zero publication jobs');
must(brain.includes('generative_video:false'),'generative video must remain disabled');
must(brain.includes('duration_ms:10000'),'light motion must be 10 seconds');
must(brain.includes('image_quality:"low"'),'image policy must remain low');
must(api.includes('planMarketingCampaignAssets'),'admin API missing asset plan');
must(api.includes('updateMarketingCampaignDraft'),'admin API missing campaign edit');
must(ui.includes('Gerar 5 peças DRAFT'),'campaign UI must expose draft planning');
must(ui.includes('Zero render e zero publicação'),'UI must explain safe planner behavior');
must(insights.includes('.eq("status","approved")'),'approved templates must be visible');
must(migration.includes('marketing_assets_campaign_content_role_unique_v1'),'unique role index missing');
must(migration.includes("set status='approved'"),'template approval missing');
console.log('marketing asset plan v1 contract: ok');