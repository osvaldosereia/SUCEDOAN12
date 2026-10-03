import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/sql/20261003_whatsapp_meta_shadow_media_preserve_v1.sql';
assert.equal(fs.existsSync(path),true,'migration de preservação de mídia Meta deve existir');
const sql=fs.readFileSync(path,'utf8');

assert.match(sql,/create or replace function public\.whatsapp_ingest_event_v1/i);
assert.match(sql,/m\.provider='meta'\s+and\s+p_provider='papoai'/i,'duplicata PapoAI posterior deve ter tratamento específico');
assert.match(sql,/p_message->'metadata'\s*-\s*'media'\s*-\s*'source'/i,'shadow PapoAI não pode substituir source/media canônicos da Meta');
assert.match(sql,/coalesce\(p_message->'metadata'->'media','\{\}'::jsonb\)\s*\|\|\s*coalesce\(m\.metadata->'media','\{\}'::jsonb\)/i,'media deve mesclar com Meta à direita para preservar provider_media_id');
assert.match(sql,/jsonb_build_object\('source',coalesce\(m\.metadata->>'source','meta'\),'media'/i,'source Meta deve permanecer canônico');
assert.match(sql,/shadow_provider/i);

console.log('PASS test-whatsapp-meta-shadow-media-preserve-v1');
