import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../../supabase/functions/creative-studio-assets-v1/index.ts',import.meta.url),'utf8');

test('asset resolver accepts service role only for internal server-side calls',()=>{
  assert.match(source,/token===key/);
  assert.match(source,/internal_service_role/);
  assert.match(source,/sb\.auth\.getUser\(token\)/);
});
