import fs from 'node:fs';

const files=['supabase/functions/dona-antonia-agent-core-v1/index.ts','supabase/functions/dona-antonia-agent-eval-v1/index.ts'];
const anchor='Antes de pedir novamente cadastro/endereço, consulte as ferramentas compactas de estado quando elas estiverem disponíveis. Nunca tente inferir dados pessoais ausentes.';
const line='Se o cliente disser apenas que quer alterar seus dados, sem informar qual campo nem fornecer o novo valor, não escreva nada e não encaminhe para humano apenas por isso: faça uma pergunta curta para identificar qual dado deseja alterar.';
for(const file of files){
  let src=fs.readFileSync(file,'utf8');
  if(!src.includes(line)){
    if(!src.includes(anchor))throw new Error(`anchor_missing:${file}`);
    src=src.replace(anchor,`${anchor}\n${line}`);
    fs.writeFileSync(file,src);
  }
  const final=fs.readFileSync(file,'utf8');
  if(!final.includes(line))throw new Error(`patch_missing:${file}`);
}
console.log('V48 patch applied');