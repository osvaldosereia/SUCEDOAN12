#!/usr/bin/env node
// The only target for this program is ephemeral PostgreSQL17 in GitHub Actions.
// No remote credentials/API. Never substitutes for a complete canonical clone.
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {readStagePg,compareTriggerDependencies} from "./orders-r17-canonical-preflight.mjs";
const read=(n)=>JSON.parse(fs.readFileSync(new URL("./fixtures/"+n,import.meta.url),"utf8"));
const canonical=read("orders-r17-canonical-trigger-dependencies-20261009.json");
const fingerprints=read("orders-r18-canonical-function-fingerprints-20261009.json");
const wanted=[
 "dispatch_fiscal_jobs.trg_ops2_guard_dispatch_fiscal_job_v1",
 "order_separation_completions_v1.trg_ops2_require_separator_completion_v4"
];
const chosen=(t)=>wanted.includes(t.table_name+"."+t.trigger_name);
const stage=readStagePg(["dispatch_fiscal_jobs","order_separation_completions_v1"]);
const report=compareTriggerDependencies({triggers:canonical.triggers.filter(chosen)},
  {triggers:stage.triggers.filter(chosen)});
const sql=[
  "SELECT coalesce(jsonb_agg(jsonb_build_object(",
  "'schema',n.nspname,'function',p.proname,'function_md5',md5(pg_get_functiondef(p.oid)),",
  "'settings',coalesce(to_jsonb(p.proconfig),'[]'::jsonb)) ORDER BY n.nspname,p.proname),'[]'::jsonb)::text",
  "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace",
  "WHERE n.nspname='public' AND p.proname IN ('ops2_guard_dispatch_fiscal_job_v1','ops2_require_separator_completion_v4')"
].join("\n");
const got=JSON.parse(execFileSync("psql",["-X","-At","-v","ON_ERROR_STOP=1","-c",sql],
  {encoding:"utf8",timeout:20000}).trim());
const comparison=got.map(f=>{
 const baseline=fingerprints.functions.find(x=>x.schema===f.schema && x.function===f.function);
 return {function:f.schema+"."+f.function,canonic_function_md5:baseline?.function_md5??null,
   isolated_function_md5:f.function_md5,function_hash_equal:baseline?.function_md5===f.function_md5,
   canonic_settings:baseline?.settings??[],isolated_settings:f.settings};
});
const output={
  captured_on:"2026-10-09",source_kind:"authentic_repo_sql_in_ephemeral_pg17",
  considered_triggers:wanted,compiled_stage_triggers:stage.triggers.length,
  ...report,function_fingerprint_comparison:comparison,
  full_canonical_parity:false,approved_for_production:false
};
const i=process.argv.indexOf("--output");
if(i>=0 && process.argv[i+1])fs.writeFileSync(process.argv[i+1],JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify(output,null,2));
if(!report.trigger_parity_complete||comparison.length!==2||comparison.some(x=>!x.function_hash_equal))
  process.exitCode=3;  // A source mismatch requires manual source/migration reconciliation.
