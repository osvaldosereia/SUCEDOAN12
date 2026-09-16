import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../../supabase/functions/creative-studio-director/index.ts',import.meta.url),'utf8');

test('director accepts service role only as an internal server-side caller',()=>{
  assert.match(source,/token===serviceKey/);
  assert.match(source,/internal_service_role/);
  assert.match(source,/sb\.auth\.getUser\(token\)/);
});
