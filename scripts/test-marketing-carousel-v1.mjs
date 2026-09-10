import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20260910114500_marketing_carousel_slides_v8.sql','utf8');
const v11=fs.readFileSync('supabase/migrations/20260910194000_marketing_carousel_render_spec_v11.sql','utf8');
const expect=(condition,message)=>{if(!condition)throw new Error(message)};

expect(sql.includes('marketing_carousel_slides'),'carousel slides table missing');
expect(sql.includes('slide_no between 1 and 10'),'carousel slide range guard missing');
expect(sql.includes('unique(carousel_asset_id,asset_version,slide_no)'),'carousel version/order uniqueness missing');
expect(sql.includes("v_count<2 or v_count>10"),'carousel count guard missing');
expect(sql.includes("v_asset.media_kind<>'carousel'"),'non-carousel asset guard missing');
expect(sql.includes("v_asset.status in ('approved','archived') or not v_asset.editable"),'immutable asset guard missing');
expect(sql.includes("where carousel_asset_id=p_asset_id and asset_version=v_asset.version"),'current-version-only mutation guard missing');
expect(sql.includes("status='draft',scheduled_for=null"),'publication approval/schedule invalidation missing');
expect(sql.includes("external_side_effect',false"),'carousel operations must be side-effect free externally');
expect(sql.includes('revoke all on function public.save_marketing_carousel_slides_v1(uuid,jsonb,uuid) from public,anon,authenticated'),'carousel save RPC must be server-only');
expect(sql.includes('grant execute on function public.save_marketing_carousel_slides_v1(uuid,jsonb,uuid) to service_role'),'service-role carousel grant missing');

expect(v11.includes('marketing.carousel.render.v1'),'canonical render schema missing');
expect(v11.includes('Client-provided render_spec is deliberately ignored'),'client render spec must not be authoritative');
expect(v11.includes("asset_id=p_asset_id and version=p_version and mime_type in ('image/webp','image/png','image/jpeg')"),'private media asset/version scope guard missing');
expect(v11.includes('carousel_media_scope_mismatch'),'cross-asset/version media guard missing');
expect(v11.includes("least(100,greatest(0,v_raw::numeric))"),'crop x/y clamp missing');
expect(v11.includes("least(3,greatest(0.5,v_raw::numeric))"),'crop scale clamp missing');
expect(v11.includes("'source_ref',jsonb_build_object('kind','private_media','media_id',v_media_id)"),'private media_id snapshot missing');
expect(v11.includes("if v_runtime.kill_switch or not v_runtime.enabled or not v_runtime.generation_enabled"),'global generation gate missing from carousel batch queue');
expect(v11.includes('if not v_runtime.deterministic_render_enabled'),'deterministic render gate missing from carousel batch queue');
expect(v11.includes('ai_slide_requires_explicit_ai_pipeline'),'AI slides must not enter deterministic batch implicitly');
expect(v11.includes('on conflict(idempotency_key) do nothing'),'carousel batch idempotency missing');
expect(v11.includes("'external_side_effect',false"),'canonical carousel path must remain externally side-effect free');
expect(v11.includes('revoke all on function public.marketing_build_carousel_slide_render_spec_v1(uuid,integer,integer,text,jsonb,jsonb) from public,anon,authenticated'),'canonical builder RPC must be server-only');
expect(v11.includes('revoke all on function public.request_marketing_carousel_renders_v1(uuid,text,uuid) from public,anon,authenticated'),'carousel render batch RPC must be server-only');
expect(v11.includes('grant execute on function public.request_marketing_carousel_renders_v1(uuid,text,uuid) to service_role'),'service-role batch queue grant missing');

console.log('marketing carousel safety contract: ok');
