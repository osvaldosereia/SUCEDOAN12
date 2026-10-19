import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Produces a per-function STATIC inventory. Reference counts are heuristic.
const ROOT=process.cwd(),rel=p=>path.relative(ROOT,p).replaceAll(path.sep,'/');
function walk(dir){
  const abs=path.join(ROOT,dir);
  if(!fs.existsSync(abs))return [];
  return fs.readdirSync(abs,{withFileTypes:true}).flatMap(e=>{
    const p=path.join(abs,e.name);
    return e.isDirectory()?walk(rel(p)):e.isFile()?[p]:[];
  });
}
const front=walk('vitrine/admin').filter(p=>/\.(js|html)$/.test(p)&&!p.includes('/runtime-parts/'));
const edge=walk('supabase/functions').filter(p=>/\.(mjs|ts)$/.test(p));
const sql=walk('supabase/migrations').concat(walk('supabase/sql')).filter(p=>/\.sql$/.test(p));
const sources=[...front,...edge].map(p=>({path:rel(p),text:fs.readFileSync(p,'utf8')}));
// Map the generated IIFE back to its ordered source-domain fragments.
// Source fragments are not standalone programs and must never be double-counted.
const partitionDomains={
  '00-bootstrap-navigation':'Central','01-central':'Central','02-expedition':'Expedição',
  '03-delivery':'Entregador','04-closure':'Fechamento','05-finance':'Financeiro',
  '06-baskets-products':'Produtos','07-expiration-balance':'Validades',
  '08-inventory-sheet':'Balanço','09-balance-gondolas':'Gôndolas',
  '10-purchase-finance':'Compras/XML','11-purchase-catalog':'Compras/XML',
  '12-xml-import':'Compras/XML','13-bling-integration':'Bling técnico',
  '14-customer-profile':'Clientes','15-manual-orders':'Pedidos',
  '16-orders-operations':'Pedidos','17-fiscal-danfe':'Pedidos',
  '18-order-editing':'Pedidos','19-printing-startup':'Pedidos'
};
const fragmentPaths=walk('vitrine/admin/runtime-parts').filter(p=>p.endsWith('.part.js')).sort();
let runtimeStartLine=1;
const runtimeSections=fragmentPaths.map(p=>{
  const basename=path.basename(p,'.part.js');
  const content=fs.readFileSync(p,'utf8');
  const start=runtimeStartLine;
  runtimeStartLine+=content.split('\n').length-1;
  return {start,end:runtimeStartLine,section:partitionDomains[basename]||'Infraestrutura compartilhada'};
});
const sections=['Central','Atendimento','ANA','Pedidos','Expedição','Entregador','Fechamento','Produtos','Cestas','Validades','Orçamentos','Clientes','Marketing','Compras/XML','Balanço','Gôndolas','Financeiro','Bling técnico','Infraestrutura compartilhada'];
function domain(file,name,line){
  if(file==='vitrine/admin/admin-runtime.js'&&runtimeSections.length){
    return runtimeSections.find(part=>line>=part.start&&line<part.end)?.section||'Infraestrutura compartilhada';
  }
  if(file.includes('/atendimento/'))return 'Atendimento';
  if(file.includes('/ana/'))return 'ANA';
  if(file.includes('/marketing/'))return 'Marketing';
  if(/basket|kit-builder/i.test(file))return 'Cestas';
  if(file.includes('/orders/'))return 'Pedidos';
  if(/closure|closing|closeout/i.test(name))return 'Fechamento';
  if(/driver|vehicle|smartDelivery|deliveryStop|deliveryRun/i.test(name))return 'Entregador';
  if(/expedition|separation|picking/i.test(name))return 'Expedição';
  if(/basket|kit/i.test(name))return 'Cestas';
  if(/marketing|campaign|audience/i.test(name))return 'Marketing';
  if(/fiscal|order|danfe/i.test(name))return 'Pedidos';
  if(/gondola/i.test(name))return 'Gôndolas';
  if(/inventor|balance|scan/i.test(name))return 'Balanço';
  if(/product|price|sku|gtin/i.test(name))return 'Produtos';
  if(/expiry|expir|fefo|lot/i.test(name))return 'Validades';
  if(/purchase|xml|supplier|receipt/i.test(name))return 'Compras/XML';
  if(/customer|contact/i.test(name))return 'Clientes';
  if(/finance|settlement/i.test(name))return 'Financeiro';
  if(/bling/i.test(name))return 'Bling técnico';
  if(/quote|budget/i.test(name))return 'Orçamentos';
  if(file==='vitrine/admin/index.html'){
    if(line<1900)return 'Central';
    if(line<2500)return 'Expedição';
    if(line<2558)return 'Entregador';
    if(line<2670)return 'Fechamento';
    if(line<3200)return 'Financeiro';
    if(line<4000)return 'Produtos';
    if(line<4160)return 'Validades';
    if(line<5250)return 'Balanço';
    if(line<5520)return 'Gôndolas';
    if(line<7100)return 'Compras/XML';
    if(line<7500)return 'Clientes';
    if(line<8810)return 'Pedidos';
    return 'Central';
  }
  if(/order/.test(file))return 'Pedidos';
  if(/whatsapp|papoai|attendance/.test(file))return 'Atendimento';
  if(/marketing/.test(file))return 'Marketing';
  if(/purchase|xml/.test(file))return 'Compras/XML';
  if(/product/.test(file))return 'Produtos';
  return 'Infraestrutura compartilhada';
}
const lineOf=(text,index)=>text.slice(0,index).split('\n').length;
const functions=[];
const functionRe=/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
const arrowRe=/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^\n=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
for(const source of sources){
  const declarations=[];
  for(const [kind,regex] of [['function',functionRe],['named_arrow',arrowRe]]){
    for(const m of source.text.matchAll(regex)){
      declarations.push({name:m[1],kind,index:m.index,line:lineOf(source.text,m.index)});
    }
  }
  declarations.sort((a,b)=>a.index-b.index);
  for(let i=0;i<declarations.length;i++){
    const f=declarations[i],segment=source.text.slice(f.index,Math.min(declarations[i+1]?.index||source.text.length,f.index+2000));
    functions.push({path:source.path,line:f.line,name:f.name,kind:f.kind,
      section:domain(source.path,f.name,f.line),
      signals:{external:/\b(?:fetch|api|hub)\s*\(|\.rpc\s*\(/.test(segment),
        data_write:/\.(?:insert|update|delete|upsert)\s*\(/.test(segment),
        dom:/\b(?:document|window)\.|\.innerHTML\b/.test(segment)},
      references:0,reference_files:0});
  }
}
const names=new Set(functions.map(x=>x.name)),refs=new Map();
for(const source of sources){
  const seen=new Set();
  for(const m of source.text.matchAll(/\b[A-Za-z_$][\w$]*\b/g)){
    if(!names.has(m[0]))continue;
    const r=refs.get(m[0])||{count:0,files:new Set()};
    r.count++;if(!seen.has(m[0])){r.files.add(source.path);seen.add(m[0])}
    refs.set(m[0],r);
  }
}
for(const f of functions){
  const r=refs.get(f.name);
  f.references=r?.count||0;
  f.reference_files=r?.files.size||0;
  f.review=f.references<=1?'manual_review_candidate':'unreviewed';
}
const tests=walk('scripts').filter(p=>/\btest-[^/]+\.mjs$/.test(p))
  .map(p=>({path:rel(p),text:fs.readFileSync(p,'utf8')}));
for(const f of functions){
  const keyword=new RegExp('\\b'+f.name+'\\b');
  f.test_reference_files=tests.filter(x=>keyword.test(x.text)).map(x=>x.path);
  if(f.review==='manual_review_candidate'&&f.test_reference_files.length)f.review='test_only_or_indirect_use';
}
const byHash=new Map();
for(const s of sources){
  const digest=crypto.createHash('sha256').update(s.text).digest('hex'),group=byHash.get(digest)||[];
  group.push(s.path);byHash.set(digest,group);
}
const identical=[...byHash.values()].filter(group=>group.length>1);
const sqlFunctions=[];
for(const p of sql){
  const text=fs.readFileSync(p,'utf8');
  for(const m of text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:(?:public|private|ops|auth)\.)?([A-Za-z_][\w]*)\s*\(/gi))
    sqlFunctions.push({path:rel(p),name:m[1],line:lineOf(text,m.index)});
}
// Technical review signals are ranked, never treated as proof of defects or dead code.
const repeatedNames=new Map();
for(const f of functions){
  const key=f.path+'\0'+f.name;
  const group=repeatedNames.get(key)||[];
  group.push(f.line);repeatedNames.set(key,group);
}
const sameFileNameCandidates=[...repeatedNames].filter(([,lines])=>lines.length>1)
  .map(([key,lines])=>({path:key.split('\0')[0],name:key.split('\0')[1],lines}));
const priorityBySignals={};
for(const f of functions){
  const category=f.signals.data_write&&f.signals.external?'remote_write':
    f.signals.data_write?'data_write':f.signals.external?'remote_read':f.signals.dom?'ui':'pure_or_internal';
  f.review_priority=category;
  priorityBySignals[category]=(priorityBySignals[category]||0)+1;
}
const bySection=Object.fromEntries(sections.map(x=>[x,0]));
for(const f of functions)bySection[f.section]=(bySection[f.section]||0)+1;
const emptyCatch=sources.map(s=>({path:s.path,count:(s.text.match(/catch\s*(?:\([^)]*\))?\s*\{\s*\}/g)||[]).length})).filter(x=>x.count);
const suspects=functions.filter(x=>x.references<=1);
const testOnly=suspects.filter(x=>x.test_reference_files.length);
const summary={frontend_files:front.length,backend_files:edge.length,sql_files:sql.length,
 named_functions_and_arrows:functions.length,lexical_single_occurrence:suspects.length,lexical_single_occurrence_mentioned_by_tests:testOnly.length,
 runtime_source_fragments:fragmentPaths.length,possible_same_name_same_file:sameFileNameCandidates.length,
 identical_file_groups:identical.length,empty_catches:emptyCatch.reduce((n,x)=>n+x.count,0)};
const result={method:'Static heuristic, not proof of runtime use or dead code',summary,sections:bySection,
 functions,suspects,identical_files:identical,empty_catches:emptyCatch,sql_definitions:sqlFunctions,
 same_file_repeated_names:sameFileNameCandidates,priority_by_signals:priorityBySignals};
const output=process.argv[2]||'artifacts/admin-function-inventory';
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'functions.json'),JSON.stringify(result,null,2)+'\n');
const lines=['# Vitrine Admin - inventario estatico','',
 'As contagens sao heuristicas. Nomes com uma ocorrencia exigem inspecao manual; nao devem ser removidos automaticamente.','',
 '| Indicador | Quantidade |','|---|---:|',
 ...Object.entries(summary).map(x=>'| '+x[0]+' | '+x[1]+' |'),'',
 '| Secao | Funcoes/expressões nomeadas |','|---|---:|',
 ...Object.entries(bySection).map(x=>'| '+x[0]+' | '+x[1]+' |'),'',
 '## Copias byte-a-byte',
 ...identical.map(g=>'- '+g.join(' = ')),'',
 '## Sinais técnicos de revisão por função (heurísticos)',
 ...Object.entries(priorityBySignals).map(([category,count])=>'- '+category+': '+count),
 '', '## Nomes declarados repetidamente no mesmo arquivo (não provam duplicação)',
 ...sameFileNameCandidates.map(x=>'- '+x.path+' '+x.name+' ('+x.lines.join(', ')+')'),'',
 '## Candidatos a verificacao',
 ...suspects.map(x=>'- '+x.path+':'+x.line+' '+x.name),
 '','O JSON registra nome, caminho, linha, referencias, sinais de efeitos e definicoes SQL.'];
fs.writeFileSync(path.join(output,'summary.md'),lines.join('\n')+'\n');
console.log('ADMIN INVENTORY '+JSON.stringify(summary));
console.log('ADMIN SECTIONS '+JSON.stringify(bySection));
console.log('ADMIN IDENTICAL '+identical.length);
console.log('ADMIN SUSPECTS '+JSON.stringify(suspects.map(x=>({path:x.path,line:x.line,name:x.name,test_only:x.test_reference_files.length>0}))));
