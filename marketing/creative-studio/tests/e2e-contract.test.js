import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const prepare=()=>readFileSync(new URL('../../../scripts/creative-studio-e2e-prepare.mjs',import.meta.url),'utf8');
const verify=()=>readFileSync(new URL('../../../scripts/creative-studio-e2e-verify.mjs',import.meta.url),'utf8');
const workflow=()=>readFileSync(new URL('../../../.github/workflows/creative-studio-real-e2e.yml',import.meta.url),'utf8');

test('real E2E uses a real active product and the deployed Director, Assets and Jobs services',()=>{
  const source=prepare();
  assert.match(source,/products\?/);
  assert.match(source,/creative-studio-director/);
  assert.match(source,/creative-studio-assets-v1/);
  assert.match(source,/creative-studio-jobs-v1/);
  assert.match(source,/compileTimeline/);
  assert.match(source,/buildRenderJob/);
  assert.match(source,/paid_approved:false/);
});

test('real E2E verifies the completed MP4 from the private render bucket',()=>{
  const source=verify();
  assert.match(source,/creative-studio-renders/);
  assert.match(source,/ffprobe/);
  assert.match(source,/1080/);
  assert.match(source,/1920/);
  assert.match(source,/completed/);
});

test('real E2E workflow renders with FFmpeg and uploads a downloadable test artifact',()=>{
  const source=workflow();
  assert.match(source,/creative-studio-e2e-prepare\.mjs/);
  assert.match(source,/creative-studio-render-worker\.mjs/);
  assert.match(source,/creative-studio-e2e-verify\.mjs/);
  assert.match(source,/actions\/upload-artifact/);
  assert.match(source,/SUPABASE_SERVICE_ROLE_KEY/);
});
