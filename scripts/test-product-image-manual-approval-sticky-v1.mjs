import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260916182100_product_image_manual_approval_sticky_v1.sql');
const admin=read('supabase/functions/admin-product-images-v1/index.ts');

// The Admin approval contract marks a candidate as completed and resolved.
assert.match(admin,/image_url:candidate/);
assert.match(admin,/image_ai_status:"completed"/);
assert.match(admin,/image_ai_manual_review_required:false/);
assert.match(admin,/image_ai_manual_resolved_at:now/);

// The Sunburst safety trigger must preserve that explicit resolved state.
assert.match(migration,/product_image_force_manual_approval_v1/);
assert.match(migration,/image_ai_status\s*=\s*'completed'/);
assert.match(migration,/image_ai_manual_review_required\s+is\s+not\s+true/i);
assert.match(migration,/image_ai_manual_resolved_at\s+is\s+not\s+null/i);
assert.match(migration,/new\.image_url\s+is\s+not\s+distinct\s+from\s+new\.image_ai_url/i);

// Automatic Sunburst publication is still blocked while the validator is disabled.
assert.match(migration,/image_ai_model\s*=\s*'gpt-image-2\.5-sunburst'/);
assert.match(migration,/validator_disabled/);
assert.match(migration,/new\.image_ai_status\s*:=\s*'needs_reprocess'/);
assert.match(migration,/new\.image_ai_manual_review_required\s*:=\s*true/);

// Previously reverted bulk approvals are repaired with a narrowly-scoped predicate.
assert.match(migration,/Aprovada em massa pelo Admin/);
assert.match(migration,/generated_pending_manual_approval/);
assert.match(migration,/image_url\s*=\s*p\.image_ai_url/i);
assert.match(migration,/image_ai_manual_review_required\s*=\s*false/i);

console.log('product image manual approval sticky contract ok');
