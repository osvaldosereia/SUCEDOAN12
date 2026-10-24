import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {readAdminUiSource} from './helpers/admin-ui-source.mjs';

const html=readAdminUiSource();
const sql=readFileSync('supabase/sql/20261008_order_manual_separation_queue_v1.sql','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
for(const [i,source] of scripts.entries())new Script(source,{filename:'admin-inline-'+i+'.js'});

assert.match(html,/orderStatusTab:'new'/,'the Admin order board starts on the four-stage workflow');
assert.match(html,/const ORDER_STATUS_TABS=\[\s*\{key:'new',label:'Novo'\}/);
assert.doesNotMatch(html,/data-manual-queue-(?:add|remove)/,'manual queue actions are not mixed into the status board');
assert.match(html,/manualQueueRpc\('list'\)/,'the isolated /montar picker still verifies queue membership');
assert.match(html,/data-v3-separation/);
assert.match(html,/function openOrderSeparationSheet\(id\)/);
assert.match(sql,/p_action = 'add'/);
assert.match(sql,/v_status is distinct from 'confirmed'/);
assert.match(sql,/on conflict \(order_id\) do nothing/);
assert.match(sql,/v_role = 'viewer'/);
assert.match(sql,/enable row level security/);
assert.match(sql,/from public, anon, authenticated/);
assert.doesNotMatch(sql,/create\s+trigger\b/i);
assert.doesNotMatch(sql,/update\s+public\.orders\b/i);
assert.doesNotMatch(sql,/update\s+public\.order_items\b/i);

assert.doesNotMatch(html,/manualQueueRpc\(enable\?'add':'remove',orderId\)/,'status changes do not write the separate picking queue');
assert.match(sql,/p_action = 'add'/);
assert.match(sql,/v_status is distinct from 'confirmed'/);
assert.match(sql,/on conflict \(order_id\) do nothing/);
assert.match(sql,/v_role = 'viewer'/);
assert.match(sql,/enable row level security/);
assert.match(sql,/from public, anon, authenticated/);
assert.doesNotMatch(sql,/create\s+trigger\b/i);
assert.doesNotMatch(sql,/update\s+public\.orders\b/i);
assert.doesNotMatch(sql,/update\s+public\.order_items\b/i);

console.log('PASS: /montar queue remains isolated from the four-stage Admin board.');
