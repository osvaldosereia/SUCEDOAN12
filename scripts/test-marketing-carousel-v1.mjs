import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20260910114500_marketing_carousel_slides_v8.sql','utf8');
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

console.log('marketing carousel safety contract: ok');
