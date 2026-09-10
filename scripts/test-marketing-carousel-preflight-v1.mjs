import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/admin-marketing-carousel-v1/index.ts','utf8');
const admin=fs.readFileSync('admin-v3/marketing-carousel-media-v1.js','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

for(const marker of [
  'action==="preflight"',
  'action==="request_render"',
  'marketing_carousel_current_v1',
  'request_marketing_carousel_renders_v1',
  'external_side_effect:false',
  '["owner","operator"]'
]) assert.ok(edge.includes(marker),`missing edge safety marker: ${marker}`);

assert.ok(edge.includes('spec.schema==="marketing.carousel.render.v1"'),'preflight must require canonical render schema');
assert.ok(edge.includes('!s.external_side_effect'),'preflight must reject side-effectful specs');
assert.ok(!/fetch\s*\(\s*["'`]https?:\/\//.test(edge),'carousel edge must not call external providers');
assert.ok(!/(graph\.facebook|api\.pinterest|mybusiness\.googleapis|openai\.com)/i.test(edge),'carousel edge must not contain provider endpoints');

for(const marker of [
  "admin-marketing-carousel-v1",
  "Verificar render",
  "Enfileirar render",
  "preflight",
  "request_render",
  "external_side_effect!==false"
]) assert.ok(admin.includes(marker),`missing admin contract marker: ${marker}`);

assert.ok(config.includes('[functions.admin-marketing-carousel-v1]\nverify_jwt = true'),'carousel admin edge must require JWT in config');

console.log('marketing carousel preflight/render safety contract: ok');
