import test from 'node:test';
import assert from 'node:assert/strict';
import {extractOutputText} from '../../../supabase/functions/creative-studio-director/response.mjs';

test('extracts Responses API text from flat convenience field',()=>{
  assert.equal(extractOutputText({output_text:'{"concept":"ok"}'}),'{"concept":"ok"}');
});

test('extracts Responses API text from nested output content',()=>{
  const payload={output:[{type:'message',content:[{type:'output_text',text:'{"concept":"nested"}'}]}]};
  assert.equal(extractOutputText(payload),'{"concept":"nested"}');
});

test('returns empty text instead of inventing provider output',()=>{
  assert.equal(extractOutputText({output:[{content:[{type:'refusal',refusal:'no'}]}]}), '');
});
