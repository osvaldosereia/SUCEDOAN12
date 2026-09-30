export interface SimplesExportSnapshot {
  period:any;
  ruleSet:any;
  totals:Record<string,number>;
  issues:{blocking:number;warnings:number;total:number};
  memory:any;
  lines:any[];
}

const csvCell=(v:any)=>{
  const s=String(v??'');
  return /[",\n\r;]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
};
const brl=(n:any)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const pct=(n:any)=>new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:4}).format(Number(n||0));
const esc=(v:any)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const competence=(v:any)=>{const s=String(v||'').slice(0,7);return /^\d{4}-\d{2}$/.test(s)?`${s.slice(5,7)}/${s.slice(0,4)}`:s};

export function buildSimplesCsv(snapshot:SimplesExportSnapshot):string{
  const p=snapshot.period||{},rows:string[][]=[];
  rows.push(['campo','valor']);
  rows.push(['competencia',String(p.competence_month||'').slice(0,7)]);
  rows.push(['versao',p.version]);
  rows.push(['status',p.status]);
  rows.push(['regra',snapshot.ruleSet?.code||'']);
  rows.push(['rbt12',p.rbt12??'']);
  rows.push(['aliquota_efetiva',p.effective_rate??snapshot.memory?.effectiveRate??'']);
  rows.push(['das_estimado',p.estimated_das_amount??'']);
  rows.push(['calculado_em',p.calculated_at||'']);
  rows.push(['bloqueios',snapshot.issues?.blocking??0]);
  rows.push(['avisos',snapshot.issues?.warnings??0]);
  rows.push([]);
  rows.push(['segregacao','valor']);
  for(const k of Object.keys(snapshot.totals||{}).sort())rows.push([k,Number(snapshot.totals[k]||0)]);
  rows.push([]);
  rows.push(['documento','chave_acesso','pedido','produto','bucket','valor_reconhecido']);
  for(const line of snapshot.lines||[])rows.push([
    line.source_document_id||'',line.access_key||'',line.order_id||'',line.product_id||'',line.tax_bucket||'',Number(line.recognized_amount||0)
  ]);
  return rows.map(r=>r.map(csvCell).join(';')).join('\n')+'\n';
}

export function buildSimplesHtml(snapshot:SimplesExportSnapshot):string{
  const p=snapshot.period||{},rule=snapshot.ruleSet||{},issues=snapshot.issues||{blocking:0,warnings:0,total:0};
  const issueText=[issues.blocking?`${issues.blocking} bloqueio${issues.blocking===1?'':'s'}`:'',issues.warnings?`${issues.warnings} aviso${issues.warnings===1?'':'s'}`:''].filter(Boolean).join(' · ')||'Sem pendências';
  const totals=Object.keys(snapshot.totals||{}).sort().map(k=>`<tr><td>${esc(k)}</td><td>${esc(brl(snapshot.totals[k]))}</td></tr>`).join('');
  const lines=(snapshot.lines||[]).map(x=>`<tr><td>${esc(x.source_document_id||'')}</td><td>${esc(x.tax_bucket||'')}</td><td>${esc(brl(x.recognized_amount))}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Simples Nacional ${esc(competence(p.competence_month))}</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#202124}h1{font-size:22px}h2{font-size:16px;margin-top:24px}table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border-bottom:1px solid #ddd;padding:7px;text-align:left}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.card{border:1px solid #ddd;border-radius:8px;padding:10px}@media print{body{margin:10mm}.no-print{display:none}}</style></head><body><h1>Simples Nacional — ${esc(competence(p.competence_month))}</h1><div class="grid"><div class="card"><b>Regra</b><br>${esc(rule.name||rule.code||'')}</div><div class="card"><b>RBT12</b><br>${esc(brl(p.rbt12))}</div><div class="card"><b>Alíquota efetiva</b><br>${esc(pct(p.effective_rate??snapshot.memory?.effectiveRate))}</div><div class="card"><b>DAS estimado</b><br>${esc(brl(p.estimated_das_amount))}</div></div><h2>Pendências</h2><p>${esc(issueText)}</p><h2>Receitas segregadas</h2><table><thead><tr><th>Tratamento</th><th>Valor</th></tr></thead><tbody>${totals}</tbody></table><h2>Memória</h2><table><tbody><tr><td>Alíquota nominal</td><td>${esc(pct(snapshot.memory?.nominalRate??p.nominal_rate))}</td></tr><tr><td>Parcela a deduzir</td><td>${esc(brl(snapshot.memory?.deduction??p.deduction_amount))}</td></tr><tr><td>Calculado em</td><td>${esc(p.calculated_at||'')}</td></tr><tr><td>Versão</td><td>${esc(p.version||1)}</td></tr></tbody></table><h2>Documentos/linhas</h2><table><thead><tr><th>Documento</th><th>Classificação</th><th>Valor reconhecido</th></tr></thead><tbody>${lines}</tbody></table></body></html>`;
}
