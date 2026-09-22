import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260922014901_papoai_product_family_search_path_hardening_v1.sql','utf8');

assert.ok(sql.includes('alter function public.papoai_commerce_product_family_v1(text)'),'target function must be explicit');
assert.match(sql,/set\s+search_path\s*=\s*pg_catalog\s*;/i,'search_path must be pinned to pg_catalog');
assert.ok(!/grant\s+execute/i.test(sql),'hardening must not widen execute privileges');

console.log('PASS: PapoAI product family search_path is pinned safely');
