import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const must=(value,message)=>{if(!value)throw new Error(message)};

const runtime=read('admin/runtime-config.js');
const api=read('admin/marketing-api.js');
const ui=read('admin/marketing.js');
const edge=read('supabase/functions/admin-marketing-brain-v1/index.ts');
const eligibility=read('supabase/migrations/20260918151953_marketing_brain_v1_commercial_eligibility.sql');
const cost=read('supabase/migrations/20260918152548_marketing_brain_v1_cost_policy.sql');

must(runtime.includes("marketingBrainFunction:'admin-marketing-brain-v1'"),'marketing brain missing from runtime');
must(api.includes("action:'shortlist'"),'shortlist action missing');
must(api.includes("action:'create_deterministic_draft'"),'deterministic draft action missing');
must(ui.includes('Criando rascunho sem IA'),'UI must identify no-AI draft flow');
must(!ui.includes('previewAiMarketingStrategy('),'UI must not automatically trigger paid strategy AI');
must(edge.includes('auth.getUser(token)'),'edge must validate JWT user');
must(edge.includes('admin_users'),'edge must validate admin role');
must(edge.includes('meta.strategy_ai_enabled!==true'),'AI strategy must fail closed');
must(edge.includes('strategy_max_daily_calls'),'daily AI call gate missing');
must(edge.includes('marketing_product_shortlist_v1'),'deterministic shortlist missing');
must(edge.includes('generative_video:false'),'generative video must remain off');
must(edge.includes('image_quality:"low"'),'image low policy missing');
must(eligibility.includes("desired_bling_status='A'"),'commercial eligibility guard missing');
must(eligibility.includes('effective_price>cost'),'known loss-making guard missing');
must(eligibility.includes('recent_campaign_count'),'antirepetition missing');
must(eligibility.includes('grant execute on function public.marketing_product_shortlist_v1(integer,integer) to service_role'),'shortlist must be server-only');
must(cost.includes("'strategy_max_daily_calls',0"),'strategy calls must start at zero');
must(cost.includes("'strategy_ai_enabled',false"),'strategy AI must start disabled');
must(cost.includes("'image_generation_quality','low'"),'image quality must default low');
must(cost.includes("'video_duration_seconds',10"),'video must default to 10 seconds');
must(cost.includes("'generative_video_enabled',false"),'generative video must be disabled');

console.log('marketing-brain-v1 contract: ok');
