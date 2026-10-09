// R27: classify the entire local/remote migration history before any deployment.
// This script NEVER connects to Supabase, runs SQL, repairs history or deploys.
import {readFileSync,readdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const parseLocal=(f)=>{
 const match=String(f).match(/^(\d{14})_([^/]+)\.sql$/);
 return match?{filename:f,version:match[1],name:match[2]}:
   {filename:String(f),version:null,name:null};
};
export function classifyMigrationDriftR27(localFiles,remoteMigrations){
 if(!Array.isArray(localFiles)||!Array.isArray(remoteMigrations))
   throw new Error("r27_requires_full_local_and_remote_history");
 const local=localFiles.map(parseLocal),remote=remoteMigrations.map(r=>({
   version:String(typeof r==="string"?r:r?.version??""),
   name:typeof r==="string"?null:String(r?.name??"")
 }));
 const byVersion=new Map(),byName=new Map();
 for(const r of remote){byVersion.set(r.version,r);if(r.name!==null){const versions=byName.get(r.name)||[];versions.push(r.version);byName.set(r.name,versions);}}
 const localVersions=new Set(local.map(x=>x.version).filter(Boolean));
 const invalidLocal=local.filter(x=>!x.version).map(x=>x.filename);
 const duplicates=local.filter((x,i)=>x.version&&local.findIndex(y=>y.version===x.version)!==i).map(x=>x.filename);
 const latestRemote=remote.map(x=>x.version).sort().at(-1)||"";
 const localUnapplied=local.filter(x=>x.version&&!byVersion.has(x.version));
 const replayRisk=localUnapplied.filter(x=>x.version<=latestRemote);
 const pending=localUnapplied.filter(x=>x.version>latestRemote);
 const renamed=localUnapplied.filter(x=>byName.has(x.name))
   .map(x=>({local:x.filename,remote_versions:byName.get(x.name)}));
 const wrongName=local.filter(x=>x.version&&byVersion.has(x.version)
   &&byVersion.get(x.version).name!==null&&byVersion.get(x.version).name!==x.name).map(x=>({
     local:x.filename,remote_name:byVersion.get(x.version).name
   }));
 const remoteNotLocallyVersioned=remote.filter(x=>!localVersions.has(x.version));
 const blockers=[];
 if(!remote.length)blockers.push("remote_history_empty");
 if(invalidLocal.length)blockers.push("noncanonical_local_filename");
 if(duplicates.length)blockers.push("duplicate_local_versions");
 if(replayRisk.length)blockers.push("local_migrations_older_than_remote_head_not_recorded");
 if(renamed.length)blockers.push("possibly_replayed_sql_under_different_version");
 if(wrongName.length)blockers.push("same_version_different_name");
 if(remoteNotLocallyVersioned.length)blockers.push("remote_versions_not_present_locally");
 return {
   ok_for_global_db_push:blockers.length===0,
   latest_remote_version:latestRemote,
   local_count:local.length,remote_count:remote.length,
   version_matches:local.length-localUnapplied.length-invalidLocal.length,
   local_not_applied:localUnapplied.length,
   remote_not_locally_versioned:remoteNotLocallyVersioned.length,
   older_unapplied_versions:replayRisk.length,
   same_name_different_version:renamed.length,
   invalid_local_files:invalidLocal,
   duplicate_local_versions:duplicates,
   name_conflicts:wrongName.slice(0,30),
   pending_newer:pending.map(x=>x.filename),
   examples_of_replay_risk:replayRisk.slice(-20).map(x=>x.filename),
   examples_same_name_different_version:renamed.slice(-20),
   blockers,
   recommendation:blockers.length?"BLOCK_GLOBAL_DB_PUSH_USE_EXPLICIT_TESTED_MIGRATIONS_ONLY":
     "MATCHING_HISTORY_REQUIRES_SQL_CONTENT_AND_STAGING_REVIEW",
   read_only:true
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const idx=process.argv.indexOf("--remote-json");
 if(idx<0||!process.argv[idx+1]){
   console.error("Usage: node scripts/xml-migration-drift-guard-r27.mjs --remote-json /path/to/read-only-supabase-migrations.json");
   process.exitCode=2;
 }else{
   try{
     const snapshot=JSON.parse(readFileSync(resolve(process.argv[idx+1]),"utf8"));
     const records=Array.isArray(snapshot)?snapshot:snapshot.migrations;
     const files=readdirSync(resolve(root,"supabase/migrations")).filter(x=>x.endsWith(".sql"));
     const r=classifyMigrationDriftR27(files,records);
     console.log(JSON.stringify(r,null,2));
     if(!r.ok_for_global_db_push)process.exitCode=2;
   }catch(e){console.error(e.message);process.exitCode=2;}
 }
}
