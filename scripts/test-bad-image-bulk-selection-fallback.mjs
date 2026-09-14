import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const r=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const js=r('admin-v3/image-automation.js');
const admin=r('supabase/functions/admin-product-images-v1/index.ts');

// A bad-image row must be selectable when there is any visible image to approve,
// not only when image_ai_url exists. Processing items remain protected.
assert.match(js,/function reviewCandidateUrl\(p\).*image_ai_url\|\|p\.image_source_url\|\|p\.image_url/s);
assert.match(js,/function eligibleBadImage\(p\).*reviewCandidateUrl\(p\)/s);
assert.match(js,/String\(p\.image_ai_status\|\|''\)!=='processing'/);

// Manual/bulk approval must approve the same image that the card is showing:
// generated candidate first, then source/current image as an explicit admin override.
assert.match(admin,/select\("id,is_active,image_ai_status,image_ai_ignored,image_ai_manual_review_required,image_ai_url,image_source_url,image_url,image_ai_admin_note"\)/);
assert.match(admin,/const candidate=safeSourceUrl\(p\.image_ai_url\|\|p\.image_source_url\|\|p\.image_url\)/);

console.log('bad image bulk selection fallback contract ok');
