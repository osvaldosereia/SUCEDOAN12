#!/usr/bin/env node
// R17: NEVER connects to the real Supabase instance. PostgreSQL from --stage-pg
// must be a disposable/local CI database. A matching digest is not full E2E proof.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const fixture=(f)=>JSON.parse(fs.readFileSync(path.join(root,"scripts/fixtures",f),"utf8"));
const fields=["table_name","trigger_name","enabled","definition_md5","function_schema","function_name",
  "function_arguments","security_definer","language","function_owner","anon_can_execute",
  "authenticated_can_execute"];
const roleDanger=new Set(["MAINTAIN","TRUNCATE","TRIGGER","REFERENCES"]);
const key=t=>t.table_name+"."+t.trigger_name;
const sort=a=>[...new Set(a)].sort();
const stable=a=>JSON.stringify([...a].sort());
const bool=x=>typeof x==="boolean";
const validTrigger=t=>!!t && fields.every(k=>Object.hasOwn(t,k)) &&
  /^[a-z_][a-z0-9_]*$/.test(t.table_name) &&
  /^[a-z_][a-z0-9_]*$/.test(t.trigger_name) &&
  /^[a-z0-9]{32}$/.test(t.definition_md5) &&
  typeof t.function_schema==="string" && typeof t.function_name==="string" &&
  typeof t.function_arguments==="string" && typeof t.function_owner==="string" &&
  typeof t.language==="string" && typeof t.enabled==="string" &&
  bool(t.security_definer) && bool(t.anon_can_execute) && bool(t.authenticated_can_execute);

export function compareTriggerDependencies(expected,stage){
  const exp=Array.isArray(expected?.triggers)?expected.triggers:[];
  const local=Array.isArray(stage?.triggers)?stage.triggers:[];
  const invalid=[],em=new Map(),lm=new Map(),missing=[],unexpected=[],definitionDrift=[],
    bindingDrift=[],securityDrift=[];
  if(!exp.length)invalid.push("empty_canonical_trigger_metadata");
  if(!local.length)invalid.push("empty_stage_trigger_metadata");
  for(const [label,list,map] of [["canonical",exp,em],["stage",local,lm]]){
    for(const t of list){
      if(!validTrigger(t)){invalid.push(label+":invalid_trigger");continue;}
      if(map.has(key(t)))invalid.push(label+":duplicate_"+key(t));
      map.set(key(t),t);
    }
  }
  for(const [name,t] of em){
    const g=lm.get(name);
    if(!g){missing.push(name);continue;}
    if(t.definition_md5!==g.definition_md5 || t.enabled!==g.enabled)definitionDrift.push(name);
    if(t.function_schema!==g.function_schema || t.function_name!==g.function_name ||
       t.function_arguments!==g.function_arguments || t.language!==g.language)
      bindingDrift.push(name);
    if(t.security_definer!==g.security_definer || t.function_owner!==g.function_owner ||
       t.anon_can_execute!==g.anon_can_execute ||
       t.authenticated_can_execute!==g.authenticated_can_execute)securityDrift.push(name);
  }
  for(const name of lm.keys())if(!em.has(name))unexpected.push(name);
  const manualReview=sort(exp.filter(t=>t.security_definer &&
    (t.anon_can_execute||t.authenticated_can_execute)).map(key));
  return {
    canonical_trigger_count:exp.length,stage_trigger_count:local.length,
    invalid_metadata:sort(invalid),missing_triggers:sort(missing),extra_triggers:sort(unexpected),
    trigger_definition_drift:sort(definitionDrift),function_binding_drift:sort(bindingDrift),
    function_security_drift:sort(securityDrift),
    canonical_security_definer_count:exp.filter(t=>t.security_definer).length,
    privileged_trigger_functions_with_execute_manual_review:manualReview,
    trigger_parity_complete:[invalid,missing,unexpected,definitionDrift,bindingDrift,securityDrift].every(a=>a.length===0),
    note:"EXECUTE on a trigger-returning function alone does not prove it is exploitable"
  };
}
function entryKey(e){return [e.scope,e.owner_role,e.object_type].join("|");}
function entryGrants(e){
  return Array.isArray(e?.grants) ? sort(e.grants.map(x=>x.role+":"+x.privilege)) : [];
}
export function compareDefaultAcl(canonical,stage){
  const exp=Array.isArray(canonical?.entries)?canonical.entries:[];
  const got=Array.isArray(stage?.entries)?stage.entries:[];
  const invalid=[],em=new Map(),sm=new Map(),missing=[],extra=[],grantDrift=[];
  if(!exp.length)invalid.push("empty_canonical_default_acl");
  for(const [label,list,target] of [["canonical",exp,em],["stage",got,sm]]){
    for(const e of list){
      if(!e||typeof e.scope!=="string"||typeof e.owner_role!=="string"||
        typeof e.object_type!=="string"||!Array.isArray(e.grants)||
        e.grants.some(x=>typeof x.role!=="string"||typeof x.privilege!=="string")){
        invalid.push(label+":invalid_entry");continue;
      }
      if(target.has(entryKey(e)))invalid.push(label+":duplicate_"+entryKey(e));
      target.set(entryKey(e),e);
    }
  }
  for(const [name,e] of em){
    if(!sm.has(name)){missing.push(name);continue;}
    if(stable(entryGrants(e))!==stable(entryGrants(sm.get(name))))grantDrift.push(name);
  }
  for(const name of sm.keys())if(!em.has(name))extra.push(name);
  const excessive=sort(exp.flatMap(e=>e.object_type==="r" ?
    (e.grants||[]).filter(g=>["anon","authenticated","PUBLIC"].includes(g.role)&&roleDanger.has(g.privilege))
      .map(g=>entryKey(e)+":"+g.role+":"+g.privilege):[]));
  return {
    canonical_default_acl_entries:exp.length,stage_default_acl_entries:got.length,
    invalid_metadata:sort(invalid),missing_default_acls:sort(missing),
    extra_default_acls:sort(extra),default_acl_grant_drift:sort(grantDrift),
    canonical_excessive_table_default_grants:excessive,
    default_acl_parity_complete:[invalid,missing,extra,grantDrift].every(a=>a.length===0),
    note:"Matching unsafe canonical default ACL grants does NOT authorize publication"
  };
}
export function compareMigrationHistory(canonical,localFiles){
  const versions=canonical?.recent_versions;
  const invalid=[];
  if(!Array.isArray(versions)||versions.length===0||versions.some(v=>!/^\d{14}$/.test(v)))invalid.push("missing_canonical_recent_versions");
  if(!Number.isSafeInteger(canonical?.total_versions)||canonical.total_versions<1)
    invalid.push("missing_total_migration_count");
  const remote=new Set(Array.isArray(versions)?versions:[]);
  const local=new Map();
  for(const filename of localFiles||[]){
    const match=/^(\d{14})_.*\.sql$/.exec(filename);
    if(match)local.set(match[1],(local.get(match[1])||[]).concat(filename));
  }
  const duplicates=[...local.entries()].filter(([,files])=>files.length>1).map(([version])=>version);
  const pending=[...local.keys()].filter(v=>v>="20261008000000"&&!remote.has(v));
  const untracked=[...remote].filter(v=>!local.has(v));
  return {
    canonical_total_versions:canonical?.total_versions??null,
    canonical_newest_version:canonical?.newest_version??null,
    canonical_recent_version_count:remote.size,local_migration_file_count:localFiles?.length??0,
    local_new_versions_not_in_remote:sort(pending),
    recent_remote_versions_missing_local_file:sort(untracked),
    duplicate_local_versions:sort(duplicates),
    invalid_metadata:invalid,
    safe_for_global_db_push:false,
    note:"Local file absence may reflect squashed/out-of-band history; reconcile each version, never global db push"
  };
}
function psqlJson(sql){
  const result=execFileSync("psql",["-X","-At","-v","ON_ERROR_STOP=1","-c",sql],
    {encoding:"utf8",timeout:25000,maxBuffer:8*1024*1024}).trim();
  if(!result)throw Error("empty local PostgreSQL result");
  return JSON.parse(result);
}
export function readStagePg(tables){
  if(!tables?.length||!tables.every(n=>/^[a-z_][a-z0-9_]*$/.test(n)))throw Error("invalid table names");
  const names=tables.map(n=>"'"+n+"'").join(",");
  const stageTriggers=psqlJson([
    "WITH focus AS (SELECT unnest(ARRAY["+names+"]::text[]) name)",
    "SELECT coalesce(jsonb_agg(jsonb_build_object(",
    "'table_name',c.relname,'trigger_name',t.tgname,'enabled',t.tgenabled,",
    "'definition_md5',md5(pg_get_triggerdef(t.oid,true)),",
    "'function_schema',pn.nspname,'function_name',p.proname,",
    "'function_arguments',pg_get_function_identity_arguments(p.oid),",
    "'security_definer',p.prosecdef,'language',lang.lanname,",
    "'function_owner',owner.rolname,",
    "'anon_can_execute',CASE WHEN to_regrole('anon') IS NULL THEN false ELSE has_function_privilege('anon',p.oid,'EXECUTE') END,",
    "'authenticated_can_execute',CASE WHEN to_regrole('authenticated') IS NULL THEN false ELSE has_function_privilege('authenticated',p.oid,'EXECUTE') END",
    ") ORDER BY c.relname,t.tgname),'[]'::jsonb)::text",
    "FROM focus f JOIN pg_class c ON c.relname=f.name AND c.relnamespace='public'::regnamespace",
    "JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal",
    "JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace",
    "JOIN pg_roles owner ON owner.oid=p.proowner JOIN pg_language lang ON lang.oid=p.prolang"
  ].join("\n"));
  const stageAcl=psqlJson([
    "SELECT coalesce(jsonb_agg(row_to_json(x) ORDER BY x.scope,x.owner_role,x.object_type),'[]'::jsonb)::text FROM (",
    "SELECT coalesce(n.nspname,'<GLOBAL>') scope,o.rolname owner_role,d.defaclobjtype object_type,",
    "coalesce(jsonb_agg(DISTINCT jsonb_build_object('role',coalesce(r.rolname,'PUBLIC'),'privilege',a.privilege_type))",
    " FILTER(WHERE a.privilege_type IS NOT NULL),'[]'::jsonb) grants",
    "FROM pg_default_acl d JOIN pg_roles o ON o.oid=d.defaclrole",
    "LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace",
    "LEFT JOIN LATERAL aclexplode(d.defaclacl) a ON true",
    "LEFT JOIN pg_roles r ON r.oid=a.grantee",
    "WHERE o.rolname IN ('postgres','supabase_admin') AND d.defaclobjtype IN ('r','f')",
    "AND (n.nspname='public' OR d.defaclnamespace=0)",
    "AND (a.grantee=0 OR r.rolname IN ('anon','authenticated'))",
    "GROUP BY 1,2,3",
    ") x"
  ].join("\n"));
  return {triggers:stageTriggers,entries:stageAcl};
}
function reportMd(r){
  const labels=[
    ["Triggers canônicos faltantes",r.triggers.missing_triggers],
    ["Triggers extras",r.triggers.extra_triggers],
    ["Definição/estado divergente",r.triggers.trigger_definition_drift],
    ["Vínculo com funções divergente",r.triggers.function_binding_drift],
    ["Divergência de privilégio/owner",r.triggers.function_security_drift],
    ["ACL padrão canônica perigosa",r.default_acls.canonical_excessive_table_default_grants],
    ["Migrações locais recentes não aplicadas",r.migrations.local_new_versions_not_in_remote]
  ];
  return [
    "## R17 - Preflight canônico estrito (somente PostgreSQL17 descartável)",
    "",
    "**Paridade de triggers: "+(r.triggers.trigger_parity_complete?"PASS METADATA":"BLOCKED")+"**",
    "",
    "**Release: BLOCKED (sem homologação externa e sem clone fiel)**",
    "",
    "| Verificação | Ocorrências |","|---|---:|",
    ...labels.map(([t,v])=>"| "+t+" | "+v.length+" |"),
    "",
    "Funções SECURITY DEFINER com EXECUTE nas roles analisadas: "+
      r.triggers.privileged_trigger_functions_with_execute_manual_review.length+
      " (revisão humana, não prova de exploração).",
    "",
    "Nenhum efeito no Supabase, Meta, Bling ou SEFAZ. Nunca executar db push global.",""
  ].join("\n");
}
if(process.argv[1]?.endsWith("orders-r17-canonical-preflight.mjs")){
  const triggerFixture=fixture("orders-r17-canonical-trigger-dependencies-20261009.json");
  const aclFixture=fixture("orders-r17-canonical-default-acl-20261009.json");
  const migrationFixture=fixture("orders-r17-canonical-migration-history-20261009.json");
  const tableFixture=fixture("orders-r13-canonical-schema-security-20261009.json");
  const names=tableFixture.tables.map(t=>t.name);
  const stage=process.argv.includes("--stage-pg")?readStagePg(names):{triggers:[],entries:[]};
  const migrations=fs.readdirSync(path.join(root,"supabase/migrations")).filter(f=>f.endsWith(".sql"));
  const report={
    captured_on:triggerFixture.captured_on,
    proof_kind:"offline_postgres_catalog_preflight",
    staging_endpoint:"PG* env only; NEVER production",
    triggers:compareTriggerDependencies(triggerFixture,stage),
    default_acls:compareDefaultAcl(aclFixture,stage),
    migrations:compareMigrationHistory(migrationFixture,migrations),
    approved_for_production:false
  };
  const out=process.argv.indexOf("--output");
  if(out>=0&&process.argv[out+1])fs.writeFileSync(process.argv[out+1],JSON.stringify(report,null,2)+"\n");
  const md=reportMd(report);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
  console.log(md);
  if(process.argv.includes("--require-trigger-parity")&&!report.triggers.trigger_parity_complete)process.exitCode=3;
}
