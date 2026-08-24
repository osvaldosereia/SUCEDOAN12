import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd(),failures=[];
const JSON_PATH='producao-v2/data/canecas/catalogos/catalogos-frases-v1.json';
const PICKER_PATH='producao-v2/js/mug-phrase-picker-v2.js';
const EXPECTED=["familia","profissoes","humor","amor-casal","amizade","empreendedorismo","mulher","masculino","cafe","pets","esporte-fitness","direito","professores","saude","trabalho-escritorio","dia-maes","dia-pais","namorados","natal","aniversario","formatura","amigo-secreto","casamento","gratidao-presente"];
const read=p=>{const f=path.join(ROOT,p);if(!existsSync(f)){failures.push(`Arquivo ausente: ${p}`);return ''}return readFileSync(f,'utf8')};
let data=null;const raw=read(JSON_PATH);
try{data=JSON.parse(raw)}catch(e){failures.push(`JSON compacto inválido: ${e.message}`)}
const picker=read(PICKER_PATH);
let templates=[];
const m=picker.match(/const T=Object\.freeze\((\[[\s\S]*?\])\);/);
if(!m)failures.push('20 modelos compactos não encontrados no seletor.');
else try{templates=JSON.parse(m[1]);if(templates.length!==20)failures.push('Seletor precisa de 20 modelos compactos.')}catch(e){failures.push(`Modelos inválidos: ${e.message}`)}
const cap=v=>{v=String(v||'');return v?v[0].toUpperCase()+v.slice(1):v};
const apply=(t,a,v1,v2)=>cap(t.replaceAll('{a}',a).replaceAll('{v1}',v1).replaceAll('{v2}',v2));
if(data){
  if(Buffer.byteLength(raw,'utf8')>15000)failures.push('JSON compacto ultrapassou 15 KB.');
  if(data.v!==1||data.tc!==24||data.tf!==4800||!Array.isArray(data.c)||data.c.length!==24)failures.push('JSON precisa declarar 24 catálogos e 4.800 frases.');
  const ids=data.c?.map(c=>c?.[0])||[];
  if(new Set(ids).size!==24)failures.push('Há IDs de catálogo duplicados.');
  EXPECTED.forEach(id=>{if(!ids.includes(id))failures.push(`Catálogo ausente: ${id}`)});
  for(const c of data.c||[]){
    const [id,nome,grupo,anchors,values]=c;
    if(!id||!nome||!grupo||!Array.isArray(anchors)||anchors.length!==10||!Array.isArray(values)||values.length<8){failures.push(`Estrutura inválida: ${id||'sem id'}`);continue}
    if(templates.length===20){
      const frases=[];
      anchors.forEach((a,j)=>templates.forEach((t,k)=>{
        const v1=values[(j*3+k)%values.length];let x=(j*5+k*2+1)%values.length,v2=values[x];if(v2===v1)v2=values[(x+1)%values.length];frases.push(apply(t,a,v1,v2));
      }));
      if(frases.length!==200||new Set(frases).size!==200)failures.push(`Catálogo ${id} não materializa 200 frases únicas.`);
      if(frases.some(f=>f.length<8||f.length>140))failures.push(`Catálogo ${id} produz frase fora do tamanho esperado.`);
    }
  }
}
for(const [marker,msg] of [
 ["const PAGE_SIZE = 20;","DOM não está limitado a 20 frases."],
 ["catalogos/catalogos-frases-v1.json","Seletor não aponta para o JSON compacto."],
 ["cache: 'force-cache'","Cache do navegador não está preservado."],
 ["openButton.textContent='Frases para a arte · 5.200'","Botão não informa 5.200 frases."],
 ["const LEGACY_URL = new URL('../data/canecas/frases-canecas-v1.json', import.meta.url).href;","As 400 frases originais não foram preservadas."],
 ["current=s.filtered.slice(start, start + PAGE_SIZE)","Resultados não estão paginados."],
 ["if(meta.compact)return expand(meta);","Novos catálogos não são expandidos sob demanda."],
])if(!picker.includes(marker))failures.push(msg);
for(const marker of ['Date.now()','picker.open = true','Promise.all('])if(picker.includes(marker))failures.push(`Padrão proibido voltou ao seletor: ${marker}`);
if(failures.length){console.error(`Catálogos de frases: ${failures.length} falha(s).`);failures.forEach((x,i)=>console.error(`${i+1}. ${x}`));process.exitCode=1}
else console.log('Catálogos de frases validados: 26 catálogos, 5.200 frases, 24 novos temas em JSON compacto e lazy-load preservado.');
