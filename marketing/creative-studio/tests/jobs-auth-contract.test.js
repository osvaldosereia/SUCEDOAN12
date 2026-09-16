import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../../supabase/functions/creative-studio-jobs-v1/index.ts',import.meta.url),'utf8');

test('jobs API accepts service role only for internal server-side calls while preserving admin auth',()=>{
  assert.match(source,/token===key/);
  assert.match(source,/internal_service_role/);
  assert.match(source,/sb\.auth\.getUser\(token\)/);
  assert.match(source,/user\?\.id\|\|'internal_service_role'/);
  assert.match(source,/created_by:creatorId/);
});
