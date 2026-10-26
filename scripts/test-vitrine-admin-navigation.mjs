import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('vitrine/admin/index.html', 'utf8');
const attendance = readFileSync('vitrine/admin/atendimento/index.html', 'utf8');
const bootstrap = readFileSync('vitrine/admin/runtime-src/09-bootstrap.part.js.txt', 'utf8');
const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
const expected = ['attendance', 'orders', 'products', 'customers', 'ana', 'baskets', 'quotes', 'bling'];
const attendanceNav = attendance.match(/<nav>([\s\S]*?)<\/nav>/)?.[1] || '';
const attendanceTabs = [...attendanceNav.matchAll(/href="\/vitrine\/admin\/(?:atendimento\/|\?tab=([a-z]+))"/g)]
  .map(match => match[1] || 'attendance');

assert.deepEqual(tabs, expected, 'Admin navigation must contain only the eight retained sessions in order.');
assert.deepEqual(attendanceTabs, expected, 'The Atendimento home must link to the same eight Admin sessions.');
assert.match(bootstrap, /setTab\(restored\|\|'attendance'\)/, 'The default Admin session must be Atendimento.');
assert.match(bootstrap, /isValidTab\(queryTab\)\?queryTab:isValidTab\(sessionTab\)/, 'An explicit session link must override the last active tab.');
