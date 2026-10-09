#!/usr/bin/env node
// R13: read-only structural parity check against captured canonical metadata.
// CI connects ONLY to ephemeral PostgreSQL and NEVER to live Supabase.
// A successful diagnostic test is NOT a passed production release gate.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

export const danger=new Set(["TRUNCATE","TRIGGER","REFERENCES"]);
export function compareCanonicalSchema(expected,actual){
  const exp=new Map(expected.tables.map(x=>[x.name,x]));
  const seen=new Map(actual.tables.map(x=>[x.name,x]));
  const missingTables=[],missingTriggers=[],rlsDisabled=[],unexpectedPublicGrants=[];
  for(const [name,t] of exp){
    const got=seen.get(name);
    if(!got){missingTables.push(name);continue;}
    if(t.rls && !got.rls)rlsDisabled.push(name);
    for(const trg of t.triggers||[]){
      if(!(got.triggers||[]).includes(trg))missingTriggers.push(name+"."+trg);
    }
    for(const privilege of got.public_grants||[]){
      if(danger.has(privilege))unexpectedPublicGrants.push(name+":"+privilege);
    }
  }
  const canonicalPublicRisk=expected.tables.filter(t=>(t.public_grants||[])
    .some(x=>danger.has(x))).map(t=>t.name);
  // RLS ON with no policies is default-deny, not automatically a vulnerability.
  const defaultDenyTables=expected.tables.filter(t=>t.rls && t.policy_count===0)
    .map(t=>t.name);
  const riskCount=missingTables.length+missingTriggers.length+
    rlsDisabled.length+unexpectedPublicGrants.length+canonicalPublicRisk.length;
  return {
    live_snapshot_date:expected.captured_on,
    canonical_tables:exp.size,synthetic_tables:actual.tables.length,
    missing_tables:missingTables,missing_triggers:missingTriggers,
    synthetic_rls_disabled:rlsDisabled,
    synthetic_unsafe_public_grants:unexpectedPublicGrants,
    canonical_unsafe_public_grant_tables:canonicalPublicRisk,
    canonical_default_deny_no_policy_tables:defaultDenyTables,
    ready_for_canonical_staging:riskCount===0,
    proof_kind:"schema_surface_only",
    direct_provider_calls:false,approved_for_production:false
  };
}
function readLocalPgNames(names){
  if(!names.every(x=>/^[a-z][a-z0-9_]*$/.test(x)))
    throw Error("invalid fixture table name");
  const quoted=names.map(x=>"'"+x+"'").join(",");
  const sql=[
    "WITH focus AS (SELECT unnest(ARRAY["+quoted+"]::text[]) name)",
    "SELECT COALESCE(jsonb_agg(jsonb_build_object(",
    " 'name',f.name,'rls',coalesce(c.relrowsecurity,false),",
    " 'policy_count',(SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=f.name),",
    " 'triggers',coalesce((SELECT jsonb_agg(t.tgname ORDER BY t.tgname)",
    "    FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb),",
    " 'public_grants',coalesce((SELECT jsonb_agg(DISTINCT g.privilege_type)",
    "    FROM information_schema.table_privileges g WHERE g.table_schema='public'",
    "      AND g.table_name=f.name AND g.grantee IN ('anon','authenticated')),'[]'::jsonb)",
    ") ORDER BY f.name),'[]'::jsonb)::text",
    "FROM focus f LEFT JOIN pg_class c ON c.relname=f.name",
    " AND c.relnamespace='public'::regnamespace"
  ].join("\n");
  return {tables:JSON.parse(execFileSync("psql",
    ["-X","-At","-v","ON_ERROR_STOP=1","-c",sql],
    {encoding:"utf8",timeout:20000,maxBuffer:4*1024*1024}).trim())};
}
function reportMd(r){
  const items=[
    ["Tabelas inexistentes no laboratório",r.missing_tables],
    ["Triggers canônicos não reproduzidos",r.missing_triggers],
    ["Tabelas com RLS desligada no laboratório",r.synthetic_rls_disabled],
    ["Privilégios públicos perigosos no laboratório",r.synthetic_unsafe_public_grants],
    ["Tabelas com privilégio público perigoso na auditoria canônica",r.canonical_unsafe_public_grant_tables]
  ];
  return [
    "## R13 — Paridade estrutural: produção versus PostgreSQL 17 descartável",
    "",
    "**Liberação para homologação canônica: "+(r.ready_for_canonical_staging?"PASS":"BLOCKED")+"**",
    "",
    "| Verificação | Divergências |","|---|---:|",
    ...items.map(([t,v])=>"| "+t+" | "+v.length+" |"),
    "",
    "RLS ativada com zero políticas indica default-deny, não permissão irrestrita; confirmar modelo de serviço.",
    "",
    ...items.map(([t,v])=>"**"+t+":** "+(v.length?v.join(", "):"nenhuma")+"  "),
    "",
    "Metadados não verificam funções completas, constraints, Edge, Meta, Bling, SEFAZ nem clone real.",
    ""
  ].join("\n");
}
if(process.argv[1]?.endsWith("test-orders-r13-schema-security-parity.mjs")){
  const snapshot=JSON.parse(fs.readFileSync(
    new URL("./fixtures/orders-r13-canonical-schema-security-20261009.json",import.meta.url),"utf8"));
  const local=readLocalPgNames(snapshot.tables.map(t=>t.name));
  const result=compareCanonicalSchema(snapshot,local);
  const idx=process.argv.indexOf("--output");
  if(idx>=0&&process.argv[idx+1])
    fs.writeFileSync(process.argv[idx+1],JSON.stringify(result,null,2)+"\n");
  const md=reportMd(result);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
  console.log(md);
  if(process.argv.includes("--require-parity")&&!result.ready_for_canonical_staging)
    process.exitCode=3;
}
