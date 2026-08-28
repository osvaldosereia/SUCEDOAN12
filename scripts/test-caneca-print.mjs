import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=process.cwd();
const failures=[];
const read=relative=>{const file=path.join(ROOT,relative);if(!existsSync(file)){failures.push(`Arquivo ausente: ${relative}`);return '';}return readFileSync(file,'utf8');};
const requireText=(source,marker,message)=>{if(!source.includes(marker))failures.push(message);};
const forbidText=(source,marker,message)=>{if(source.includes(marker))failures.push(message);};

const html=read('caneca-print/index.html');
const bat=read('caneca-print/abrir-caneca-print.bat');

requireText(html,"const FIREBASE_BASE='https://cedar-chemist-310801-default-rtdb.firebaseio.com'",'Caneca Print não possui fonte ao vivo do Firebase.');
requireText(html,"const CATEGORIES=['Caneca de Porcelana','Canecas de Porcelana']",'Caneca Print não aceita categoria oficial e legada.');
requireText(html,'function horizontalUrl(v)','Caneca Print não possui resolvedor da arte horizontal.');
requireText(html,'arte_horizontal:art','Caneca Print não mantém a arte horizontal normalizada.');
requireText(html,'IMPRIMIR ARTE','Botão de impressão da arte não existe.');
requireText(html,'BAIXAR ARTE','Botão para baixar a arte horizontal não existe.');
requireText(html,'data-print=','Cards não possuem ação de impressão.');
requireText(html,'data-download=','Cards não possuem ação de download da arte.');
requireText(html,'window.print()','Impressão não dispara window.print().');
requireText(html,'rotate(90deg) scaleX(-1)','Arte não é rotacionada e espelhada para sublimação.');
requireText(html,'@page{size:106mm 247mm;margin:0}','Folha de impressão não está em 106 × 247 mm.');
requireText(html,'width:235mm!important;height:106mm!important','Área de arte não está em 235 × 106 mm.');
forbidText(html,'mockup_1','Caneca Print ainda depende de mockup_1.');
forbidText(html,'mockup_2','Caneca Print ainda depende de mockup_2.');
forbidText(html,'mockup_3','Caneca Print ainda depende de mockup_3.');
forbidText(html,'BAIXAR 3 IMAGENS','Caneca Print ainda oferece download de mockups.');
forbidText(html,'downloadMockups','Rotina antiga de download de mockups ainda existe.');
requireText(bat,'--kiosk-printing','Atalho do Windows não habilita impressão silenciosa do Chrome.');

const temp=path.join(ROOT,'scripts','.__caneca_print_syntax__.mjs');
try{
  const script=(html.match(/<script>([\s\S]*?)<\/script>/)||[])[1]||'';
  if(!script) failures.push('Script principal do Caneca Print não foi encontrado.');
  else {
    const fs=await import('node:fs'); fs.writeFileSync(temp,script,'utf8');
    const syntax=spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});
    if(syntax.status!==0)failures.push(`Script do Caneca Print possui erro de sintaxe:\n${syntax.stderr||syntax.stdout}`);
  }
} finally { try{(await import('node:fs')).unlinkSync(temp);}catch{} }

if(failures.length){console.error(`Caneca Print: ${failures.length} falha(s).`);failures.forEach((f,i)=>console.error(`${i+1}. ${f}`));process.exitCode=1;}
else console.log('Caneca Print validado: somente arte horizontal, impressão espelhada e download da arte.');
