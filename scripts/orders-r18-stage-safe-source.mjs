#!/usr/bin/env node
// R18 isolated PostgreSQL 17 only: extract exact V4 separation guard DDL.
// Do NOT execute the original full migration: it also updates live rows/runtime flags.
// This file never connects to a database. Target SQL output is run ONLY by CI.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=fs.readFileSync(path.join(root,"supabase/migrations/20261007120000_order_separation_team_auto_fiscal_v4.sql"),"utf8");
const begin="create or replace function public.ops2_require_separator_completion_v4()";
const end="-- Ativa somente o caminho de emissão por pedido já protegido pelo preflight.";
const first=source.indexOf(begin), last=source.indexOf(end,first);
if(first<0||last<0||source.indexOf(begin,first+begin.length)!==-1)
  throw Error("R18 source anchor changed; no SQL emitted");
const sql=source.slice(first,last).trim()+"\n";
const required=[
  /create or replace function public\.ops2_require_separator_completion_v4\(\)/i,
  /returns trigger/i,
  /security definer/i,
  /create trigger trg_ops2_require_separator_completion_v4/i,
  /revoke all on function public\.ops2_require_separator_completion_v4\(\) from public,anon,authenticated/i,
  /grant execute on function public\.ops2_require_separator_completion_v4\(\) to service_role/i,
  /separator_required_before_completion/
];
if(required.some(reg=>!reg.test(sql)))throw Error("R18 source guard changed: abort");
if(/(?:^|\n)\s*(?:update|insert|delete|truncate|alter\s+table|drop\s+table|create\s+table)\s+public\./im.test(sql))
  throw Error("Unsafe DML/DDL in extracted stage SQL");
if(!process.argv[2]||process.argv[2].startsWith("-"))
  throw Error("Explicit ephemeral SQL output file path required");
fs.writeFileSync(process.argv[2],"-- R18 isolated synthetic DB only; sourced verbatim from canonical migration\n"+sql);
console.log("R18 verified exact separation-trigger DDL extracted (no runtime updates)");
