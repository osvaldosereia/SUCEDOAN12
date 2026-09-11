import fs from 'node:fs';

const files=['supabase/functions/dona-antonia-agent-core-v1/index.ts','supabase/functions/dona-antonia-agent-eval-v1/index.ts'];
for(const file of files){
  let src=fs.readFileSync(file,'utf8');
  const old='function normalizeSemanticText(v:unknown){return clean(v,1600).toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");}';
  const neo='function normalizeSemanticText(v:unknown){return clean(v,1600).toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\\s+/g," ").trim();}';
  if(src.includes(old)) src=src.replace(old,neo);
  else if(!src.includes(neo)) throw new Error(`normalize_anchor_missing:${file}`);
  const oldPost="const text=clean(msg.text,1600).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');";
  if(src.includes(oldPost)) src=src.replace(oldPost,'const text=normalizeSemanticText(msg.text);');
  fs.writeFileSync(file,src);
  const final=fs.readFileSync(file,'utf8');
  if(!final.includes('.replace(/[^a-z0-9]+/g," ")')) throw new Error(`punctuation_normalization_missing:${file}`);
}
console.log('V50 patch applied');