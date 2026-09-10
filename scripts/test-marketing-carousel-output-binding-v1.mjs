import fs from 'node:fs/promises';

const migration=await fs.readFile('supabase/migrations/20260910215500_marketing_carousel_output_binding_v12.sql','utf8');
const edge=await fs.readFile('supabase/functions/admin-marketing-carousel-v1/index.ts','utf8');

const must=[
  'complete_marketing_carousel_render_v1',
  "v_job.status<>'processing'",
  "v_job.lease_until<now()",
  "v_slide.carousel_asset_id<>v_job.asset_id",
  "v_media.asset_id<>v_job.asset_id",
  "v_media.version<>v_version",
  "v_media.role<>'output'",
  "v_media.metadata->>'render_job_id'",
  "v_slide.output_media_id=p_media_id",
  "set status='rendered',output_media_id=p_media_id",
  "external_side_effect',false",
  'marketing_carousel_render_progress_v1',
  'revoke all on function public.complete_marketing_carousel_render_v1',
  'grant execute on function public.complete_marketing_carousel_render_v1'
];
for(const token of must)if(!migration.includes(token))throw new Error(`missing output-binding guard: ${token}`);
for(const forbidden of ['http://','https://graph.facebook.com','api.pinterest.com','mybusiness.googleapis.com','openai.com']){
  if(migration.includes(forbidden))throw new Error(`provider endpoint forbidden in migration: ${forbidden}`);
}
if(!edge.includes('action==="progress"'))throw new Error('Admin carousel Edge must expose read-only progress');
if(!edge.includes('marketing_carousel_render_progress_v1'))throw new Error('progress must use internal RPC');
if(!edge.includes('external_side_effect:false'))throw new Error('Edge must remain fail-closed for external side effects');
console.log('marketing carousel output binding: ok');
