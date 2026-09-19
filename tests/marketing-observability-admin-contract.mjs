import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const api=await readFile(new URL('../admin/marketing-api.js',import.meta.url),'utf8');
const panel=await readFile(new URL('../admin/marketing-observability-panel.js',import.meta.url),'utf8');

test('marketing api exposes read-only observability action',()=>{
  assert.match(api,/getMarketingObservability=.*action:'observability'/);
  assert.match(api,/marketing-observability-panel\.js/);
});

test('observability panel is fail-closed',()=>{
  assert.match(panel,/value\.mode!=='observe_only'/);
  assert.match(panel,/policy\.auto_action!==false/);
  assert.match(panel,/policy\.auto_publish!==false/);
  assert.match(panel,/policy\.auto_schedule!==false/);
  assert.doesNotMatch(panel,/publishMarketingJob|prepareMarketingPublication|oauth_complete|connection_save_config/);
});

test('observability panel requires authenticated admin session and no-store',()=>{
  assert.match(panel,/getCustomerOsAccessToken/);
  assert.match(panel,/Authorization:`Bearer \$\{token\}`/);
  assert.match(panel,/cache:'no-store'/);
  assert.match(panel,/credentials:'omit'/);
});
