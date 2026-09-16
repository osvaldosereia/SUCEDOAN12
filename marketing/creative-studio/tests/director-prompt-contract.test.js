import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../supabase/functions/creative-studio-director/prompt.ts',import.meta.url),'utf8');

test('director input carries compact avoidance profile',()=>{
  assert.match(source,/avoidanceProfile/);
});

test('director explicitly changes at least two creative axes for alternate ideas',()=>{
  assert.match(source,/pelo menos dois/i);
  assert.match(source,/território.*conceito.*hook/i);
  assert.match(source,/evitar/i);
});
