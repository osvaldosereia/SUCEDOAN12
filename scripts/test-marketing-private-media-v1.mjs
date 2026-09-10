import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910113000_marketing_private_media_v7.sql','utf8');
const edge=fs.readFileSync('supabase/functions/admin-marketing-media-v1/index.ts','utf8');

function expect(condition,message){if(!condition)throw new Error(message)}

expect(migration.includes("'marketing-private'"),'private bucket missing');
expect(/values\([\s\S]*'marketing-private'[\s\S]*false/i.test(migration),'bucket must be private');
expect(migration.includes('marketing_media_signable_v1'),'signable resolver missing');
expect(migration.includes('register_marketing_private_media_v2'),'private media registrar missing');
expect(migration.includes("revoke all on function public.marketing_media_signable_v1(uuid) from public,anon,authenticated"),'signable resolver must be server-only');
expect(migration.includes("grant execute on function public.marketing_media_signable_v1(uuid) to service_role"),'service role grant missing');
expect(migration.includes("p_asset_id::text||'/v'||p_version::text||'/'"),'asset/version path scoping missing');
expect(migration.includes("m.storage_provider='supabase'"),'signable media must be Supabase-backed');
expect(migration.includes("m.bucket_name='marketing-private'"),'signable media must be private-bucket scoped');

expect(edge.includes('sb.auth.getUser(token)'),'edge must verify caller');
expect(edge.includes('.from("admin_users")'),'edge must check Admin role');
expect(edge.includes('["owner","operator"].includes(admin.role)'),'edge must restrict roles');
expect(edge.includes('Math.min(900'),'signed URL TTL must be capped');
expect(edge.includes('Math.max(30'),'signed URL TTL must have a lower bound');
expect(edge.includes('marketing_media_signable_v1'),'edge must resolve media through server-only RPC');
expect(edge.includes('.createSignedUrl('),'edge must create a signed URL, not a public URL');
expect(!edge.includes('.getPublicUrl('),'public URL is forbidden');
expect(edge.includes('external_side_effect:false'),'edge response/event must identify no publication side effect');
expect(!/publish|graph\.facebook|pinterest\.com|mybusiness\.googleapis/i.test(edge.replace(/admin_preview_signed/g,'')),'media signer must not contain social publishing dispatch');

console.log('marketing private media safety contract: ok');
