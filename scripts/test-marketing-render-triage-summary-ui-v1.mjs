import fs from 'node:fs';

const ui = fs.readFileSync('admin-v3/marketing-render-observability-v1.js','utf8');
const must = [
  'mroTriageSummary',
  'mroTriageAge',
  'pending_age_buckets',
  'oldest_pending_seconds',
  'oldest_approved_seconds',
  'pending_review',
  'approved',
  'blocked',
  'executed',
  'cancelled',
  'external_side_effect!==false',
  'job_payload_exposed!==false',
  "triage('list',{limit:50,include_cancelled:true})"
];
for (const token of must) {
  if (!ui.includes(token)) throw new Error(`missing_triage_summary_contract:${token}`);
}

const forbidden = [
  "triage('approve'",
  'triage("approve"',
  "triage('execute'",
  'triage("execute"',
  'setInterval(load',
  'setTimeout(loadTriage',
  'api.openai.com',
  'graph.facebook.com',
  'api.pinterest.com',
  'mybusiness.googleapis.com'
];
for (const token of forbidden) {
  if (ui.includes(token)) throw new Error(`unsafe_triage_summary_ui:${token}`);
}

const summaryTarget = "root.querySelector('#mroTriageSummary').innerHTML=triageSummary(d)";
const ageTarget = "root.querySelector('#mroTriageAge').innerHTML=triageAge(d)";
if (!ui.includes(summaryTarget) || !ui.includes(ageTarget)) throw new Error('triage_summary_not_rendered_from_safe_list_response');

console.log('marketing renderer triage summary UI contract: ok');
