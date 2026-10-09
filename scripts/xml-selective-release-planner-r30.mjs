// R30: produce a bounded TWO-migration plan only. Never connects to Supabase,
// executes SQL, repairs history, publishes functions or changes production.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const REQUIRED_GATES=[
  'isolated_supabase_auth_postgrest',
  'authenticated_owner_edge',
  'browser_mobile_desktop',
  'rollback_recovery',
  'backup_restore',
  'release_signoff'
];
const sources=[
  ['identity','supabase/migrations/20261009185312_purchase_xml_identity_atomic_r27.sql'],
  ['review','supabase/migrations/20261009185314_purchase_xml_field_approval_r27.sql']
];
export const sha256=s=>createHash('sha256').update(s).digest('hex');
const stamp=s=>/^\d{14}$/.test(String(s||''));
export function planSelectiveXmlRelease({
  remoteMigrations,identityVersion,reviewVersion,
  verifiedGates={},sourceSql=null
}){
  if(!Array.isArray(remoteMigrations)||remoteMigrations.length===0)
    throw Error('read_only_remote_migration_snapshot_required');
  const remote=remoteMigrations.map(x=>({
    version:String(typeof x==='string'?x:x.version),
    name:typeof x==='string'?'':String(x.name||'')
  }));
  if(remote.some(x=>!stamp(x.version)))
    throw Error('remote_snapshot_contains_invalid_version');
  const versions=new Set(remote.map(x=>x.version));
  const maxRemote=[...versions].sort().at(-1);
  const errors=[];
  if(!stamp(identityVersion)||!stamp(reviewVersion))
    errors.push('cli_generated_14_digit_versions_required');
  else{
    if(identityVersion<=maxRemote||reviewVersion<=maxRemote)
      errors.push('cli_versions_precede_or_equal_live_head');
    if(identityVersion>=reviewVersion)errors.push('identity_must_precede_review');
    if(versions.has(identityVersion)||versions.has(reviewVersion))
      errors.push('selected_migration_version_already_recorded');
  }
  if(remote.some(x=>/(?:purchase_xml_identity_atomic|purchase_xml_field_approval)_(?:r2[347]|release)/.test(x.name)))
    errors.push('equivalent_xml_release_may_already_have_been_applied');
  const files=sources.map(([kind,path])=>{
    const sql=sourceSql?.[kind]??readFileSync(resolve(root,path),'utf8');
    if(typeof sql!=='string'||!sql.trim())errors.push('empty_sql_'+kind);
    if(/\bDROP\s+(?:TABLE|SCHEMA|DATABASE)\b/i.test(sql))errors.push('destructive_sql_'+kind);
    return {kind,origin:path,bytes:Buffer.byteLength(sql),
      sha256:sha256(sql),sql};
  });
  for(const gate of REQUIRED_GATES)if(verifiedGates[gate]!==true)
    errors.push('unverified_'+gate);
  const planned=stamp(identityVersion)&&stamp(reviewVersion)?[
    {version:identityVersion,name:'purchase_xml_identity_atomic_r30',sha256:files[0].sha256},
    {version:reviewVersion,name:'purchase_xml_field_approval_r30',sha256:files[1].sha256}
  ]:[];
  return {
    ok_for_review:errors.length===0,
    can_apply_to_production:false, // This planning tool NEVER authorizes a deploy.
    latest_remote_version:maxRemote,
    migration_count:remote.length,
    selected_count:2,
    ordered_migrations:planned,
    sources:files.map(({sql,...metadata})=>metadata),
    errors,
    no_global_db_push:true,no_migration_repair:true,read_only:true
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=new Map();
  for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
  if(!args.get('--remote-json')){
    console.error('Usage: node scripts/xml-selective-release-planner-r30.mjs --remote-json SNAPSHOT --identity-version CLI_TIMESTAMP --review-version CLI_TIMESTAMP [--gates-json PROOF]');
    process.exitCode=2;
  }else{
    try{
      const snapshot=JSON.parse(readFileSync(resolve(args.get('--remote-json')),'utf8'));
      const proof=args.get('--gates-json')?JSON.parse(readFileSync(resolve(args.get('--gates-json')),'utf8')):{};
      const planned=planSelectiveXmlRelease({
        remoteMigrations:Array.isArray(snapshot)?snapshot:snapshot.migrations,
        identityVersion:args.get('--identity-version'),reviewVersion:args.get('--review-version'),
        verifiedGates:proof
      });
      console.log(JSON.stringify(planned,null,2));
      if(!planned.ok_for_review)process.exitCode=2;
    }catch(error){console.error('fail-closed:',error.message);process.exitCode=2;}
  }
}
