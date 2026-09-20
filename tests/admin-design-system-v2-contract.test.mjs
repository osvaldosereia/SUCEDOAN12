import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../admin/admin-design-system-v2.css',import.meta.url),'utf8');

test('design system exposes core tokens',()=>{
  for(const token of ['--da-brand:','--da-text:','--da-border:','--da-touch:44px','--da-content:1500px'])assert.match(css,new RegExp(token.replaceAll('-','\\-')));
});

test('operational controls keep accessible mobile sizing',()=>{
  assert.match(css,/\.da-btn\{[^}]*min-height:var\(--da-touch\)/s);
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/\.da-btn\{min-height:48px\}/);
  assert.match(css,/\.da-input,\.da-select,\.da-textarea\{font-size:16px\}/);
});

test('desktop table has an explicit mobile list counterpart',()=>{
  assert.match(css,/\.da-mobile-list\{display:none\}/);
  assert.match(css,/\.da-desktop-table\{display:none\}\.da-mobile-list\{display:flex/s);
});

test('dialog becomes fullscreen on small phones',()=>{
  assert.match(css,/\.da-dialog\{width:100%;max-width:none;height:100%;max-height:none;border-radius:0;margin:0\}/);
});

test('reduced motion is respected',()=>assert.match(css,/@media\(prefers-reduced-motion:reduce\)/));
