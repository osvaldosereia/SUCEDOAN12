#!/usr/bin/env node
/* DA6 — pré-checagem OFFLINE de isolamento do staging.
 * Não contata Supabase, não consulta Vault, não recebe chaves nem faz deploy.
 * Execute antes de QUALQUER comando remoto de homologação.
 */
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const productionRefs=new Set([
  'ssbesxgaijknwsjbsbcz', // Banco canônico / Bling
  'qxstkwshuvplmmftrctj'  // Vitrine/Admin — nunca servir de staging DA6
]);
const validRef=/^[a-z0-9]{20}$/;

export function validateDa6Staging({projectRef='',confirmedRef='',workerUrl='',environment=''}={}) {
 const errors=[];
 if(environment!=='staging')errors.push('environment_not_staging');
 if(!validRef.test(projectRef))errors.push('project_ref_missing_or_invalid');
 if(productionRefs.has(projectRef))errors.push('production_project_forbidden');
 if(!confirmedRef||confirmedRef!==projectRef)errors.push('staging_ref_not_independently_confirmed');
 const expected=validRef.test(projectRef)
  ?'https://'+projectRef+'.supabase.co/functions/v1/admin-products-live-v1?action=inventory_label_worker_tick'
  :null;
 if(!expected||workerUrl!==expected)errors.push('worker_url_not_exact_staging_endpoint');
 return {ok:errors.length===0,project_ref:validRef.test(projectRef)?projectRef:null,
  errors,action:errors.length?'Do not deploy or run staging tests':
   'Preflight passed; staging still requires human security review and real hosted testing'};
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const outcome=validateDa6Staging({
  projectRef:process.env.DA6_STAGING_PROJECT_REF||'',
  confirmedRef:process.env.DA6_STAGING_CONFIRM_REF||'',
  workerUrl:process.env.DA6_STAGING_WORKER_URL||'',
  environment:process.env.DA6_TARGET_ENV||''
 });
 console.log(JSON.stringify(outcome,null,2));
 if(process.argv.includes('--enforce')&&!outcome.ok)process.exitCode=3;
}
