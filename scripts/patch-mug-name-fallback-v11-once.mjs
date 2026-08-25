import { readFileSync, writeFileSync } from 'node:fs';

function read(file){return readFileSync(file,'utf8');}
function write(file,content){writeFileSync(file,content,'utf8');}
function replaceOnce(source,from,to,label){if(!source.includes(from))throw new Error(`Trecho não encontrado: ${label}`);return source.replace(from,to);}

const personalizer='producao-v2/js/mug-personalizer-v7.js';
let src=read(personalizer);
src=replaceOnce(src,"const BUILD = '20260825-canecas-studio-v9-cadastro';","const BUILD = '20260825-canecas-studio-v11-make-name-fallback';",'build');
src=replaceOnce(src,
"  if (!middle) throw new Error('A IA não conseguiu identificar o tema da caneca. Gere novamente para evitar cadastro genérico.');",
"  if (!middle) middle = 'Tema Visual da Arte';",
'fallback final do nome');
src=replaceOnce(src,
"    if (!aiName) throw new Error('A IA não conseguiu identificar o tema da caneca. Gere novamente antes do cadastro.');\n    const productName = normalizeGeneratedName(aiName, instruction);",
"    const productName = normalizeGeneratedName(aiName, instruction);\n    const nameGeneratedByAi = Boolean(aiName);\n    if (!nameGeneratedByAi) console.warn('Make não devolveu nome; cadastro seguirá com fallback seguro para revisão.');",
'remover bloqueio rígido');
src=replaceOnce(src,
"      firebase_template_json: firebaseTemplate(id, instruction, productName, Boolean(aiName)),",
"      firebase_template_json: firebaseTemplate(id, instruction, productName, nameGeneratedByAi),",
'flag de nome IA');
src=replaceOnce(src,
"    nome_gerado_ia: Boolean(nameGeneratedByAi),",
"    nome_gerado_ia: Boolean(nameGeneratedByAi),\n    nome_revisao_pendente: !nameGeneratedByAi,\n    nome_origem: nameGeneratedByAi ? 'ia_make' : (text(instruction) ? 'fallback_instrucao' : 'fallback_visual'),",
'metadados de revisão');
src=src.replace(/make_canecas_studio_v9_cadastro/g,'make_canecas_studio_v11_make_name_fallback');
src=src.replace(/geracao_versao: 'v9-cadastro'/g,"geracao_versao: 'v11-make-name-fallback'");
src=src.replace(/openai_make_v9_cadastro/g,'openai_make_v11_make_name_fallback');
write(personalizer,src);

const test='scripts/test-mug-studio-loader.mjs';
let tst=read(test);
tst=replaceOnce(tst,
"requireText(personalizer, 'A IA não conseguiu identificar o tema da caneca', 'Criador ainda permite cadastro com tema genérico.');",
"requireText(personalizer, \"if (!middle) middle = 'Tema Visual da Arte';\", 'Criador não possui fallback final para nome quando o Make falha.');\nrequireText(personalizer, 'nome_revisao_pendente: !nameGeneratedByAi', 'Cadastro não sinaliza revisão quando o nome vem de fallback.');\nrequireText(personalizer, \"nome_origem: nameGeneratedByAi ? 'ia_make'\", 'Cadastro não registra a origem do nome.');\nif (personalizer.includes(\"if (!aiName) throw new Error('A IA não conseguiu identificar o tema da caneca. Gere novamente antes do cadastro.')\")) failures.push('Criador ainda bloqueia toda a caneca quando o Make não devolve nome.');",
'atualizar teste de fallback');
tst=tst.replace('Criador de Canecas V9 validado:','Criador de Canecas V11 validado:');
write(test,tst);

for(const file of ['producao/index.html','admin/index.html']){
  let html=read(file);
  html=html.replace("var RELEASE = '20260825-mug-model-carousel-v10';","var RELEASE = '20260825-mug-name-fallback-v11';");
  write(file,html);
}

console.log('Patch V11 aplicado: falha da IA de nome não bloqueia mais a criação.');
