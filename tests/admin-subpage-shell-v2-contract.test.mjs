import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync(new URL('../admin/admin-subpage-shell-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../admin/admin-subpage-shell-v2.css',import.meta.url),'utf8');
const gondolas=fs.readFileSync(new URL('../admin/gondolas.html',import.meta.url),'utf8');
const studio=fs.readFileSync(new URL('../admin/creative-studio.html',import.meta.url),'utf8');

test('subpage shell consumes canonical navigation contract and never changes runtime',()=>{
  assert.match(js,/adminNavigationModel/);
  assert.doesNotMatch(js,/fetch\s*\(/);
  assert.doesNotMatch(js,/localStorage\.setItem|sessionStorage\.setItem/);
  assert.doesNotMatch(js,/publishing_enabled|kill_switch|outbound_enabled/);
});

test('subpage shell preserves mobile drawer accessibility',()=>{
  assert.match(js,/aria-expanded/);
  assert.match(js,/Escape/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/safe-area-inset-top/);
  assert.match(css,/prefers-reduced-motion/);
});

test('low-risk subpages use shared shell without dropping local functional CSS',()=>{
  for(const html of [gondolas,studio]){
    assert.match(html,/admin-design-system-v2\.css/);
    assert.match(html,/admin-subpage-shell-v2\.css/);
    assert.match(html,/admin-subpage-shell-v2\.js/);
    assert.match(html,/id="adminShellNavigation"/);
    assert.match(html,/class="da-v2"/);
  }
  assert.match(gondolas,/gondolas-v1\.css/);
  assert.match(studio,/creative-studio\.css/);
});
