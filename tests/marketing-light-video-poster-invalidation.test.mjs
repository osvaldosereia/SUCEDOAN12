import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Reel é invalidado quando o poster muda',()=>{
  const sql=read('supabase/migrations/20260918171048_marketing_light_video_poster_hash_invalidation_v2.sql');
  assert.match(sql,/poster_sha256/);
  assert.match(sql,/is distinct from coalesce\(v_poster\.sha256/);
  assert.match(sql,/status='queued'/);
  assert.match(sql,/mp4_ready',false/);
  assert.match(sql,/preview_video_media_id/);
});
test('Reel permanece sem IA e sem publicação externa',()=>{
  const sql=read('supabase/migrations/20260918171048_marketing_light_video_poster_hash_invalidation_v2.sql');
  assert.match(sql,/ai_used',false/);
  assert.match(sql,/estimated_cost_cents/);
  assert.match(sql,/service_role/);
  assert.match(sql,/revoke all.*anon,authenticated/s);
});
