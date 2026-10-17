import assert from 'node:assert/strict';
import fs from 'node:fs';

const sharedPath='supabase/functions/_shared/whatsapp-meta-carousel-v1.mjs';
const edgePath='supabase/functions/admin-whatsapp-template-carousel-v1/index.ts';
assert.equal(fs.existsSync(sharedPath),true,'shared carousel Meta helper deve existir');
assert.equal(fs.existsSync(edgePath),true,'admin carousel Edge deve existir');
const shared=fs.readFileSync(sharedPath,'utf8');
const edge=fs.readFileSync(edgePath,'utf8');

for(const fn of ['validateCarouselTemplateDraft','uploadTemplateMediaSampleViaMeta','createCarouselTemplateViaMeta'])assert.match(shared,new RegExp(`function ${fn}\\(`),`${fn} deve existir`);
assert.match(shared,/category[^\n]+MARKETING/,'carrossel deve exigir categoria MARKETING');
assert.match(shared,/cards\.length\s*<\s*2|cards\.length\s*>\s*10/,'carrossel deve exigir 2 a 10 cards');
assert.match(shared,/IMAGE[^\n]+VIDEO|VIDEO[^\n]+IMAGE/,'mídia deve ser IMAGE ou VIDEO');
assert.match(shared,/header_handle/,'card deve usar header_handle da Meta');
assert.match(shared,/same|consistent|structure|button/i,'cards devem validar estrutura consistente');
assert.match(shared,/\/uploads/,'upload deve usar Resumable Upload API');
assert.match(shared,/file_offset/,'upload de dados deve enviar file_offset');
assert.match(shared,/Authorization:\s*`Bearer/,'token deve ir somente no backend');
assert.match(edge,/META_APP_ID/,'Edge deve exigir app id para upload de mídia');
assert.match(edge,/adminAuth/,'Edge deve exigir autenticação Admin');
assert.match(edge,/action===['"]upload_media['"]|action===['"]upload_media['"]/,'Edge deve expor upload_media');
assert.match(edge,/action===['"]create['"]|action===['"]create['"]/,'Edge deve expor create');
assert.match(edge,/to_phone_e164[^\n]+destination_phone[^\n]+destination_fields_not_allowed/,'Edge deve rejeitar explicitamente qualquer destinatário no fluxo de criação de template');

console.log('admin whatsapp template carousel contract: ok');
