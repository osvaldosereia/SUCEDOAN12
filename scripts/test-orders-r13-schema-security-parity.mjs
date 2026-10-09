#!/usr/bin/env node
// R13: compare captured canonical catalog metadata against isolated PostgreSQL.
// Fail closed on partial/empty snapshots; this is NEVER production authorization.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

export const danger = new Set(["TRUNCATE","TRIGGER","REFERENCES","MAINTAIN"]);
const roles = ["PUBLIC","anon","authenticated"];
const isList = x => Array.isArray(x) && x.every(v=>typeof v==="string" && v.length>0);
const sorted = x => [...new Set(x)].sort();
const key = x => JSON.stringify(sorted(x));
function grantMap(table) {
  if(!table || typeof table.role_grants!=="object" || Array.isArray(table.role_grants) || !table.role_grants) return null;
  if(!roles.every(role=>isList(table.role_grants[role])))return null;
  return table.role_grants;
}
function validMetadata(t,side,issues){
  if(!t || typeof t.name!=="string" || !/^[a-z][a-z0-9_]*$/.test(t.name)){
    issues.push(side+":invalid_table_name");return false;
  }
  let valid=true;
  const fields=[
    ["rls",typeof t.rls==="boolean"],
    ["forced",typeof t.forced==="boolean"],
    ["policy_count",Number.isSafeInteger(t.policy_count)&&t.policy_count>=0],
    ["triggers",isList(t.triggers)],
    ["public_grants",isList(t.public_grants)],
    ["role_grants",!!grantMap(t)]
  ];
  for(const [field,ok] of fields){if(!ok){issues.push(side+":"+t.name+":missing_or_invalid_"+field);valid=false;}}
  if(isList(t.triggers) && sorted(t.triggers).length!==t.triggers.length){
    issues.push(side+":"+t.name+":duplicate_triggers");valid=false;
  }
  return valid;
}
export function compareCanonicalSchema(expected,actual){
  const expRows=Array.isArray(expected?.tables)?expected.tables:[];
  const gotRows=Array.isArray(actual?.tables)?actual.tables:[];
  const incompleteSnapshot=[];
  if(!expRows.length)incompleteSnapshot.push("canonical:empty_or_missing_tables");
  if(!gotRows.length)incompleteSnapshot.push("synthetic:empty_or_missing_tables");
  const exp=new Map(),seen=new Map();
  for(const t of expRows){validMetadata(t,"canonical",incompleteSnapshot);if(typeof t?.name!=="string")continue;
    if(exp.has(t.name))incompleteSnapshot.push("canonical:"+t.name+":duplicate_table");exp.set(t.name,t);}
  for(const t of gotRows){validMetadata(t,"synthetic",incompleteSnapshot);if(typeof t?.name!=="string")continue;
    if(seen.has(t.name))incompleteSnapshot.push("synthetic:"+t.name+":duplicate_table");seen.set(t.name,t);}
  const missingTables=[],missingTriggers=[],extraTriggers=[],rlsDisabled=[],rlsMismatch=[];
  const forceRlsMismatch=[],policyCountMismatch=[],grantDifferences=[],unexpectedPublicGrants=[];
  const unsafeSyntheticGrants=[];
  for(const [name,t] of exp){
    const got=seen.get(name);
    if(!got||got.exists===false){missingTables.push(name);continue;}
    if(typeof t.rls==="boolean" && typeof got.rls==="boolean" && t.rls!==got.rls){
      rlsMismatch.push(name);if(t.rls&&!got.rls)rlsDisabled.push(name);
    }
    if(typeof t.forced==="boolean" && typeof got.forced==="boolean" && t.forced!==got.forced)
      forceRlsMismatch.push(name);
    if(Number.isSafeInteger(t.policy_count) && Number.isSafeInteger(got.policy_count) && t.policy_count!==got.policy_count)
      policyCountMismatch.push(name+":"+t.policy_count+"->"+got.policy_count);
    if(isList(t.triggers)&&isList(got.triggers)){
      for(const trig of t.triggers)if(!got.triggers.includes(trig))missingTriggers.push(name+"."+trig);
      for(const trig of got.triggers)if(!t.triggers.includes(trig))extraTriggers.push(name+"."+trig);
    }
    if(isList(t.public_grants)&&isList(got.public_grants) && key(t.public_grants)!==key(got.public_grants))
      grantDifferences.push(name+":legacy_anon_authenticated_PUBLIC_union");
    const expRoles=grantMap(t),gotRoles=grantMap(got);
    if(expRoles && gotRoles)for(const role of roles){
      if(key(expRoles[role])!==key(gotRoles[role]))
        grantDifferences.push(name+":"+role+":"+key(expRoles[role])+"->"+key(gotRoles[role]));
    }
  }
  for(const [name,t] of seen){
    if(!exp.has(name)||t?.exists===false)continue;
    if(isList(t.public_grants))for(const privilege of t.public_grants)
      if(danger.has(privilege))unsafeSyntheticGrants.push(name+":"+privilege);
    const grantRoles=grantMap(t);
    if(grantRoles)for(const role of roles)for(const privilege of grantRoles[role]){
      if(danger.has(privilege)||(role==="PUBLIC"&&["UPDATE","INSERT","DELETE"].includes(privilege)))
        unexpectedPublicGrants.push(name+":"+role+":"+privilege);
    }
  }
  const canonicalPublicRisk=expRows.filter(t=>isList(t?.public_grants) &&
    t.public_grants.some(priv=>danger.has(priv))).map(t=>t.name);
  const defaultDenyTables=expRows.filter(t=>t?.rls===true && t.policy_count===0).map(t=>t.name);
  const issues=[incompleteSnapshot,missingTables,missingTriggers,extraTriggers,rlsMismatch,forceRlsMismatch,
    policyCountMismatch,grantDifferences,unsafeSyntheticGrants,unexpectedPublicGrants,canonicalPublicRisk];
  return {
    live_snapshot_date:expected?.captured_on??null,
    canonical_tables:exp.size,synthetic_tables:gotRows.length,
    missing_tables:sorted(missingTables),missing_triggers:sorted(missingTriggers),
    unexpected_triggers:sorted(extraTriggers),
    synthetic_rls_disabled:sorted(rlsDisabled),rls_mismatch:sorted(rlsMismatch),
    force_rls_mismatch:sorted(forceRlsMismatch),policy_count_mismatch:sorted(policyCountMismatch),
    grant_differences:sorted(grantDifferences),
    synthetic_unsafe_public_grants:sorted(unsafeSyntheticGrants),
    synthetic_unsafe_role_grants:sorted(unexpectedPublicGrants),
    canonical_unsafe_public_grant_tables:sorted(canonicalPublicRisk),
    canonical_default_deny_no_policy_tables:sorted(defaultDenyTables),
    incomplete_snapshot:sorted(incompleteSnapshot),
    ready_for_canonical_staging:issues.every(a=>a.length===0),
    proof_kind:"schema_surface_only",direct_provider_calls:false,approved_for_production:false
  };
}
function readLocalPgNames(names){
  if(!names.length||!names.every(x=>/^[a-z][a-z0-9_]*$/.test(x)))
    throw Error("invalid or empty fixture table list");
  const quoted=names.map(x=>"'"+x+"'").join(",");
  const acl="aclexplode(c.relacl)";
  const grantSql=condition=>"coalesce((SELECT jsonb_agg(DISTINCT a.privilege_type ORDER BY a.privilege_type) FROM "+
    acl+" a LEFT JOIN pg_roles rr ON rr.oid=a.grantee WHERE "+condition+"),'[]'::jsonb)";
  const sql=[
    "WITH focus AS (SELECT unnest(ARRAY["+quoted+"]::text[]) name)",
    "SELECT COALESCE(jsonb_agg(jsonb_build_object(",
    "'name',f.name,'exists',c.oid IS NOT NULL,'rls',coalesce(c.relrowsecurity,false),",
    "'forced',coalesce(c.relforcerowsecurity,false),",
    "'policy_count',(SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=f.name),",
    "'triggers',coalesce((SELECT jsonb_agg(t.tgname ORDER BY t.tgname) FROM pg_trigger t",
    "WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb),",
    "'public_grants',"+grantSql("(a.grantee=0 OR rr.rolname IN ('anon','authenticated'))")+",",
    "'role_grants',jsonb_build_object(",
    "'PUBLIC',"+grantSql("a.grantee=0")+",",
    "'anon',"+grantSql("rr.rolname='anon'")+",",
    "'authenticated',"+grantSql("rr.rolname='authenticated'")+")",
    ") ORDER BY f.name),'[]'::jsonb)::text",
    "FROM focus f LEFT JOIN pg_class c ON c.relname=f.name AND c.relnamespace='public'::regnamespace"
  ].join("\n");
  const output=execFileSync("psql",["-X","-At","-v","ON_ERROR_STOP=1","-c",sql],
    {encoding:"utf8",timeout:20000,maxBuffer:4*1024*1024}).trim();
  return {tables:JSON.parse(output)};
}
function reportMd(r){
  const items=[
    ["Snapshots ausentes ou incompletos",r.incomplete_snapshot],
    ["Tabelas inexistentes",r.missing_tables],
    ["Triggers faltantes",r.missing_triggers],
    ["Triggers inesperados",r.unexpected_triggers],
    ["Divergencias RLS",r.rls_mismatch],
    ["Divergencias FORCE RLS",r.force_rls_mismatch],
    ["Divergencias de contagem de policies",r.policy_count_mismatch],
    ["Divergencias de privileges/grants",r.grant_differences],
    ["Grants inseguros no laboratorio",r.synthetic_unsafe_public_grants],
    ["Grants de risco por papel",r.synthetic_unsafe_role_grants],
    ["Grants inseguros na fotografia canonica",r.canonical_unsafe_public_grant_tables]
  ];
  return [
    "## R13 - Auditoria estrita (PostgreSQL 17 isolado)",
    "",
    "**Paridade: "+(r.ready_for_canonical_staging?"PASS (somente metadados)":"BLOCKED")+"**",
    "",
    "| Controle | Divergencias |","|---|---:|",
    ...items.map(([label,values])=>"| "+label+" | "+values.length+" |"),
    "",
    ...items.map(([label,values])=>"**"+label+":** "+(values.length?values.join(", "):"nenhuma")+"  "),
    "",
    "RLS sem policies e default-deny para papeis sujeitos a ela; service_role e owners podem contornar.",
    "O snapshot legado R13 nao contem grants separados por role, portanto nao pode passar por paridade.",
    "Aprovacao de staging/produçao requer outras provas (Edge, migracoes, Meta, Bling e SEFAZ).",""
  ].join("\n");
}
if(process.argv[1]?.endsWith("test-orders-r13-schema-security-parity.mjs")){
  const snapshot=JSON.parse(fs.readFileSync(
    new URL("./fixtures/orders-r13-canonical-schema-security-20261009.json",import.meta.url),"utf8"));
  const local=readLocalPgNames(snapshot.tables.map(t=>t.name));
  const result=compareCanonicalSchema(snapshot,local);
  const idx=process.argv.indexOf("--output");
  if(idx>=0&&process.argv[idx+1])fs.writeFileSync(process.argv[idx+1],JSON.stringify(result,null,2)+"\n");
  const md=reportMd(result);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
  console.log(md);
  if(process.argv.includes("--require-parity")&&!result.ready_for_canonical_staging)process.exitCode=3;
}
