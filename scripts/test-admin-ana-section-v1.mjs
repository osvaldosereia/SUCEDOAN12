import assert from 'node:assert/strict';
import fs from 'node:fs';
const shell=fs.readFileSync('vitrine/admin/index.html','utf8')+'\n'+fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const modulePath='vitrine/admin/ana/ana-admin.js';
assert.match(shell,/data-tab="ana"[\s\S]*?ANA/);
assert.match(shell,/tab==='ana'[\s\S]*ana-admin\.js/);
assert.equal(fs.existsSync(modulePath),true,'ANA management module must exist');
const ui=fs.readFileSync(modulePath,'utf8');
for(const section of ['Visão geral','Comportamento','Conhecimento','Automações','Testes e histórico'])assert.ok(ui.includes(section),`missing ${section}`);
for(const action of ['admin_load','admin_save_draft','admin_publish','admin_rollback','admin_set_channel','admin_test','admin_history'])assert.ok(ui.includes(action),`missing action ${action}`);
assert.match(ui,/dry_run_not_sendable|não envia|Não envia/i);
assert.match(ui,/role.*owner|owner.*role/i);
assert.match(ui,/campaigns_enabled|marketing/i);
assert.match(ui,/Adicionar ação|data-add-action/);
assert.match(ui,/Continuar com a ANA|continue_ai/);
assert.match(ui,/Remover etiqueta|remove_label/,'editor must expose provenance-safe label removal');
assert.match(ui,/Modelos prontos|data-add-template/,'editor must expose the simple automation template library');
assert.match(ui,/Diagnóstico do rascunho|analyzeAnaAutomationDraft/,'tests view must expose draft diagnostics');
assert.match(ui,/anaTestHumanMode/,'simulator must expose human takeover context');
assert.match(ui,/Mensagem sintética opcional/,'required suite must run without forcing a custom message');
assert.match(ui,/latestComplete=Boolean/,'publish readiness must depend on a complete current-revision suite');
assert.match(ui,/Executar \$\{requiredCount\} testes obrigatórios/,'tests UI must expose the full required suite count');
assert.match(ui,/ana-diagnostics\.js/,'diagnostics must remain modular');
assert.match(ui,/ana-automation-library\.js/,'editor must keep template definitions in a separate module');
assert.match(ui,/Duplicar automação|data-duplicate-trigger/);
assert.match(ui,/data-move-action/);
assert.match(ui,/exclude_phrases|Não disparar se contiver/);
assert.match(ui,/Cliente ainda não identificado/);
assert.match(ui,/ANA responsável/);
assert.match(ui,/enabled:false/,'new automations must start disabled');
assert.match(ui,/data-action-field="type"[\s\S]*render\(\)/,'changing an action type must redraw its specific fields');
assert.match(ui,/da_finance_access_token_v1/);
const css=fs.readFileSync('vitrine/admin/ana/ana-admin.css','utf8');
assert.match(css,/@media/);

{
  // Exercise the actual controller functions: old replies cannot clobber a
  // newer mount/load, nor force navigation back to Tests and History.
  const start=ui.indexOf('let anaLoadGeneration=0;');
  const stop=ui.indexOf('function applyKnowledgeFilters()',start);
  assert.ok(start>0&&stop>start,'ANA async controller isolation boundaries');
  const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
  const pending={admin_load:[],admin_history:[]};
  const api=action=>{
    assert.ok(action in pending,'Unexpected action: '+action);
    const task=deferred();pending[action].push(task);return task.promise;
  };
  const host={innerHTML:''},state={host,section:'overview',history:[],role:'viewer'};
  let paints=0;
  const {load,loadHistory}=new Function('state','api','render',
    ui.slice(start,stop)+';return {load,loadHistory};')(state,api,()=>paints++);
  const first=load(),second=load();
  pending.admin_load[1].resolve({role:'owner',draft:{revision:2}});
  await second;
  pending.admin_load[0].resolve({role:'viewer',draft:{revision:1}});
  await first;
  assert.equal(state.role,'owner','only the latest load may update permissions');
  assert.equal(state.revision,2,'the older draft cannot replace a new draft');
  assert.equal(paints,1);
  const third=load();
  state.host={innerHTML:''};
  pending.admin_load[2].resolve({role:'viewer',draft:{revision:3}});
  await third;
  assert.equal(state.revision,2,'a response from an old mount must be ignored');

  state.section='tests';
  const oldHistory=loadHistory(),newHistory=loadHistory();
  pending.admin_history[1].resolve({history:[{id:'new'}]});
  await newHistory;
  pending.admin_history[0].resolve({history:[{id:'old'}]});
  await oldHistory;
  assert.equal(state.history[0].id,'new','newest history request wins');
  const delayed=loadHistory();
  state.section='overview';
  pending.admin_history[2].resolve({history:[{id:'recent'}]});
  await delayed;
  assert.equal(state.section,'overview','background history must not change the selected tab');
}

console.log('PASS: ANA Admin navigation, sections, role controls and no-send simulator contracts');

