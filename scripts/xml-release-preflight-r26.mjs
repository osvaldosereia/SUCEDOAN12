// R26: fail-closed migration preflight. Read-only; does not run SQL or deploy.
// The remote snapshot must come from a fresh Supabase read-only query.
import {readFileSync,readdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const REMOTE_SEPARATION="20261009155231";
const OLD_DUPLICATE="20261009160000";
export const R26_REQUIRED_GATES=[
 "supabase_isolated_auth_rls_edge",
 "browser_mobile_desktop",
 "ui_apply_preview_rollback_fiscal",
 "xml_bling_sandbox_idempotence",
 "backup_restore_and_observability",
 "human_release_review"
];
const nameOf=f=>typeof f==="string"?f:f.name;
const versionOf=f=>String(nameOf(f)).match(/^(\d{14})_/)?.[1];
export function auditXmlReleaseR26({localFiles,remoteMigrations,verifiedGates={}}){
 if(!Array.isArray(localFiles)||!Array.isArray(remoteMigrations))
   throw new TypeError("R26 requires explicit local files and verified remote migration snapshot");
 const remoteVersions=new Set(remoteMigrations.map(x=>String(typeof x==="string"?x:x.version)));
 const versions=remoteMigrations.map(x=>String(typeof x==="string"?x:x.version)).sort();
 const maxRemote=versions.at(-1)||"";
 const local=localFiles.map(nameOf);
 const errors=[];
 if(!remoteVersions.has(REMOTE_SEPARATION))
   errors.push("remote_separation_applied_version_missing");
 if(!local.some(x=>x.startsWith(REMOTE_SEPARATION+"_separation_ready_reservation_idempotence")))
   errors.push("canonical_separation_migration_not_versioned");
 if(local.some(x=>x.startsWith(OLD_DUPLICATE+"_separation_ready_reservation_idempotence")))
   errors.push("duplicate_separation_migration_must_not_replay");
 const identities=local.filter(x=>x.includes("purchase_xml_identity_atomic_r23.sql"));
 const fields=local.filter(x=>x.includes("purchase_xml_field_approval_r24.sql"));
 if(identities.length!==1||fields.length!==1)
   errors.push("r23_r24_expected_exactly_once");
 const identityVersion=identities.length===1?versionOf(identities[0]):"";
 const fieldVersion=fields.length===1?versionOf(fields[0]):"";
 if(identityVersion&&fieldVersion&&identityVersion>=fieldVersion)
   errors.push("r23_must_precede_r24");
 for(const [label,v] of [["r23",identityVersion],["r24",fieldVersion]]){
   if(v&&v<=maxRemote&&!remoteVersions.has(v))
     errors.push(label+"_pending_migration_older_than_remote_head");
 }
 if(identityVersion&&fieldVersion&&remoteVersions.has(fieldVersion)&&!remoteVersions.has(identityVersion))
   errors.push("r24_applied_before_r23");
 if(!maxRemote) errors.push("remote_migration_history_empty");
 for(const gate of R26_REQUIRED_GATES)
   if(verifiedGates[gate]!==true) errors.push("unverified_"+gate);
 return {
   ok:errors.length===0,release_allowed:errors.length===0,
   latest_remote_version:maxRemote,
   pending_r23_version:identityVersion||null,pending_r24_version:fieldVersion||null,
   errors,read_only:true
 };
}
export function currentLocalMigrations(){
 return readdirSync(resolve(ROOT,"supabase/migrations")).filter(x=>x.endsWith(".sql"));
}
// Invocation for operators: supply a fresh exported list as JSON. Exit nonzero on any gate.
// Never silently infer Supabase production state from GitHub alone.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=process.argv.indexOf("--remote-json");
 if(arg<0||!process.argv[arg+1]){
   console.error("Usage: node scripts/xml-release-preflight-r26.mjs --remote-json /path/to/read-only-snapshot.json");
   process.exitCode=2;
 }else{
   try{
     const snapshot=JSON.parse(readFileSync(resolve(process.argv[arg+1]),"utf8"));
     const result=auditXmlReleaseR26({
       localFiles:currentLocalMigrations(),remoteMigrations:snapshot.migrations,
       verifiedGates:snapshot.verified_gates||{}
     });
     console.log(JSON.stringify(result,null,2));
     if(!result.ok)process.exitCode=2;
   }catch(error){
     console.error("R26 fails closed:",error.message);
     process.exitCode=2;
   }
 }
}
