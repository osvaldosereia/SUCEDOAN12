import { readFileSync, writeFileSync } from 'node:fs';

function read(file) {
  return readFileSync(file, 'utf8');
}

function write(file, content) {
  writeFileSync(file, content, 'utf8');
}

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Trecho não encontrado: ${label}`);
  return source.replace(from, to);
}

function replaceRegex(source, regex, to, label) {
  if (!regex.test(source)) throw new Error(`Padrão não encontrado: ${label}`);
  return source.replace(regex, to);
}

function patch(file, transform) {
  const before = read(file);
  const after = transform(before);
  if (after === before) throw new Error(`Nenhuma alteração aplicada em ${file}`);
  write(file, after);
  console.log(`Atualizado: ${file}`);
}

patch('producao-v2/js/mug-personalizer-v7.js', source => {
  source = replaceOnce(
    source,
    "const BUILD = '20260824-canecas-studio-v7-5';",
    "const BUILD = '20260825-canecas-studio-v9-cadastro';",
    'build do personalizador',
  );
  source = replaceOnce(
    source,
    "const MUG_CATEGORY = 'Canecas de Porcelana';",
    "const MUG_CATEGORY = 'Caneca de Porcelana';",
    'categoria oficial',
  );
  source = replaceOnce(
    source,
    "const MUG_CAPACITY = '350 ml';",
    "const MUG_CAPACITY = '350ml';",
    'capacidade oficial',
  );

  const metadataBlock = `function buildNamePrompt(instruction = '') {
  const extra = text(instruction);
  return \`Analise visualmente a ARTE FINAL da caneca e identifique com precisão o TEMA CENTRAL para criar um nome comercial em português, específico, pesquisável e útil para catálogo/SEO.

FORMATO EXATO E OBRIGATÓRIO:
Caneca de Porcelana [tema específico da arte] - 350ml

REGRAS PARA O TEMA:
- a parte entre “Caneca de Porcelana” e “- 350ml” deve explicar claramente o assunto real da arte;
- identifique santo, devoção, profissão, hobby, ocasião, personagem, animal, estilo, frase/ideia central ou outro assunto dominante realmente visível;
- se houver uma frase, use no nome o tema/assunto que ela comunica, sem copiar uma frase longa inteira;
- prefira palavras que um cliente realmente usaria para procurar essa caneca;
- seja específico e objetivo; normalmente use de 2 a 8 palavras para o tema;
- nunca use apenas “Arte Exclusiva”, “Decorativa”, “Personalizada”, “Tema”, “Design” ou “Estampa” como tema;
- não invente marca, personagem, santo, profissão ou assunto que não esteja sustentado pela imagem;
- mantenha exatamente o prefixo “Caneca de Porcelana” e o sufixo “- 350ml”.

RESPONDA SOMENTE COM O NOME FINAL, sem explicações, aspas, JSON ou lista.
\${extra ? \`\\nINSTRUÇÃO QUE ORIGINOU A ARTE E AJUDA A IDENTIFICAR O TEMA:\\n\${extra}\` : ''}\`;
}

function normalizeGeneratedName(value = '', instruction = '') {
  let middle = text(value)
    .replace(/[\\r\\n]+/g, ' ')
    .replace(/^['\"“”‘’]+|['\"“”‘’]+$/g, '')
    .replace(/^caneca\\s+de\\s+porcelana\\s*/i, '')
    .replace(/\\s*[-–—]\\s*350\\s*ml\\s*$/i, '')
    .replace(/^[-–—:\\s]+|[-–—:\\s]+$/g, '')
    .replace(/\\s{2,}/g, ' ')
    .trim();

  if (!middle) {
    middle = text(instruction)
      .replace(/^(crie|faça|faca|gere|quero|usar|use)\\s+/i, '')
      .replace(/[\\r\\n]+/g, ' ')
      .replace(/\\s{2,}/g, ' ')
      .trim();
  }
  if (!middle) throw new Error('A IA não conseguiu identificar o tema da caneca. Gere novamente para evitar cadastro genérico.');
  if (middle.length > 78) middle = middle.slice(0, 78).replace(/\\s+\\S*$/, '').trim();
  return \`Caneca de Porcelana \${middle} - 350ml\`;
}

function productThemeFromName(productName = '') {
  const theme = text(productName)
    .replace(/^caneca\\s+de\\s+porcelana\\s*/i, '')
    .replace(/\\s*[-–—]\\s*350\\s*ml\\s*$/i, '')
    .replace(/^[-–—:\\s]+|[-–—:\\s]+$/g, '')
    .replace(/\\s{2,}/g, ' ')
    .trim();
  if (!theme) throw new Error('Não foi possível extrair o tema para a subcategoria da caneca.');
  return theme;
}

function buildProductDescription(productName = '') {
  const theme = productThemeFromName(productName);
  return \`\${productName}. Caneca de porcelana branca, com capacidade de 350ml, com arte temática de \${theme}. Ideal para quem se identifica com esse tema e também como opção de presente.\`;
}

function buildMockupPrompt`;

  source = replaceRegex(
    source,
    /function buildNamePrompt\(instruction = ''\) \{[\s\S]*?\n\}\n\nfunction normalizeGeneratedName\(value = ''\) \{[\s\S]*?\n\}\n\nfunction buildMockupPrompt/,
    metadataBlock,
    'bloco de nome/tema',
  );

  source = replaceOnce(
    source,
    "  const productName = normalizeGeneratedName(generatedName);",
    "  const productName = normalizeGeneratedName(generatedName, instruction);\n  const productTheme = productThemeFromName(productName);\n  const productDescription = buildProductDescription(productName);",
    'metadados no template Firebase',
  );
  source = replaceOnce(
    source,
    "    subcategoria: '',\n    subsubcategoria: '',",
    "    subcategoria: productTheme,\n    tema: productTheme,\n    subsubcategoria: '',",
    'subcategoria temática',
  );
  source = replaceOnce(
    source,
    "    descricao: `${productName}. Caneca branca de porcelana ${MUG_CAPACITY} com arte exclusiva para sublimação. Área de impressão aproximada: ${PRINT_LABEL}.`,",
    '    descricao: productDescription,',
    'descrição temática',
  );
  source = replaceOnce(
    source,
    "    const productName = normalizeGeneratedName(aiName);",
    "    if (!aiName) throw new Error('A IA não conseguiu identificar o tema da caneca. Gere novamente antes do cadastro.');\n    const productName = normalizeGeneratedName(aiName, instruction);",
    'bloqueio de nome genérico',
  );
  source = source.replace(/make_canecas_studio_v7_5/g, 'make_canecas_studio_v9_cadastro');
  source = source.replace(/geracao_versao: 'v7\.5'/g, "geracao_versao: 'v9-cadastro'");
  source = source.replace(/openai_make_v7_5/g, 'openai_make_v9_cadastro');
  return source;
});

patch('producao-v2/js/mug-studio-gallery.js', source =>
  replaceOnce(
    source,
    "const CATEGORY_NAMES = ['Canecas de Porcelana', 'Canecas'];",
    "const CATEGORY_NAMES = ['Caneca de Porcelana', 'Canecas de Porcelana', 'Canecas'];",
    'categorias da galeria',
  ),
);

patch('scripts/sync-canecas-cache.mjs', source => {
  source = replaceOnce(
    source,
    "const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';",
    "const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';\nconst PRINT_CATEGORY_NAMES = ['Caneca de Porcelana', 'Canecas de Porcelana'];",
    'categorias de impressão',
  );
  source = replaceRegex(
    source,
    /function isPrintableMug\(value\) \{[\s\S]*?\n\}/,
    `function isPrintableMug(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && PRINT_CATEGORY_NAMES.some(category => normalized(value.categoria) === normalized(category))
    && isActive(value);
}`,
    'filtro de impressão',
  );
  source = replaceOnce(
    source,
    "  for (const category of ['Canecas de Porcelana', 'Canecas']) {",
    "  for (const category of ['Caneca de Porcelana', 'Canecas de Porcelana', 'Canecas']) {",
    'consulta das categorias',
  );
  source = source.replace("categoria: text(value.categoria || 'Canecas'),", "categoria: text(value.categoria || 'Caneca de Porcelana'),");
  source = source.replace('categoria Canecas de Porcelana para impressão.', 'categoria Caneca de Porcelana (com compatibilidade legada) para impressão.');
  return source;
});

patch('caneca-print/index.html', source => {
  source = replaceOnce(
    source,
    "      const CATEGORY='Canecas de Porcelana';",
    "      const CATEGORY='Caneca de Porcelana';\n      const CATEGORY_LEGACY='Canecas de Porcelana';\n      const CATEGORIES=[CATEGORY,CATEGORY_LEGACY];",
    'categoria do Caneca Print',
  );
  source = replaceOnce(
    source,
    "      function isCanecasCategory(value){return norm(value?.categoria)===norm(CATEGORY);}",
    "      function isCanecasCategory(value){return CATEGORIES.some(category=>norm(value?.categoria)===norm(category));}",
    'compatibilidade de categoria do Caneca Print',
  );
  source = replaceRegex(
    source,
    /      function liveUrl\(\)\{[\s\S]*?\n      \}/,
    `      function liveUrl(category=CATEGORY){
        const live=new URL(\`${'${FIREBASE_BASE}'}/produtos.json\`);
        live.searchParams.set('orderBy',JSON.stringify('categoria'));
        live.searchParams.set('equalTo',JSON.stringify(category));
        return live.href;
      }`,
    'URL ao vivo do Caneca Print',
  );
  source = replaceOnce(
    source,
    "      function image(url,label,cls=''){",
    `      async function fetchLiveRows(){
        const batches=await Promise.all(CATEGORIES.map(async category=>{
          const response=await fetch(liveUrl(category),{cache:'no-store',headers:{Accept:'application/json'}});
          if(!response.ok)throw new Error(\`Firebase HTTP \${response.status} ao consultar \${category}\`);
          return normalizeFirebase(await response.json());
        }));
        const merged=new Map();
        batches.flat().forEach(row=>merged.set(row.firebaseKey,row));
        return [...merged.values()].sort((a,b)=>Number(b.last_update||0)-Number(a.last_update||0));
      }

      function image(url,label,cls=''){`,
    'consulta dupla do Caneca Print',
  );
  source = replaceOnce(
    source,
    "          const response=await fetch(liveUrl(),{cache:'no-store',headers:{Accept:'application/json'}});\n          if(!response.ok)throw new Error(`Firebase HTTP ${response.status}`);\n          const rows=normalizeFirebase(await response.json());",
    '          const rows=await fetchLiveRows();',
    'carga ao vivo do Caneca Print',
  );
  source = source.replace('Nenhuma caneca ativa da categoria Canecas de Porcelana encontrada com este filtro.', 'Nenhuma caneca de porcelana ativa encontrada com este filtro.');
  source = source.replace('somente Canecas de Porcelana ativas', 'somente canecas de porcelana ativas');
  return source;
});

patch('scripts/test-mug-studio-loader.mjs', source => {
  source = replaceOnce(
    source,
    "requireText(personalizer, \"const MUG_CAPACITY = '350 ml'\", 'Capacidade padrão não está em 350 ml.');",
    "requireText(personalizer, \"const MUG_CAPACITY = '350ml'\", 'Capacidade padrão não está em 350ml.');",
    'teste de capacidade',
  );
  source = replaceOnce(
    source,
    "requireText(personalizer, 'Caneca de Porcelana ${middle} - 350ml', 'Nome não é normalizado no padrão comercial.');",
    "requireText(personalizer, 'Caneca de Porcelana ${middle} - 350ml', 'Nome não é normalizado no padrão comercial.');\nrequireText(personalizer, \"const MUG_CATEGORY = 'Caneca de Porcelana'\", 'Categoria oficial das novas canecas não está no singular.');\nrequireText(personalizer, 'subcategoria: productTheme', 'Subcategoria não é criada a partir do tema.');\nrequireText(personalizer, 'tema: productTheme', 'Tema identificado não é persistido no cadastro.');\nrequireText(personalizer, 'Caneca de porcelana branca, com capacidade de 350ml', 'Descrição não informa porcelana branca e 350ml.');\nrequireText(personalizer, 'A IA não conseguiu identificar o tema da caneca', 'Criador ainda permite cadastro com tema genérico.');",
    'testes de metadados',
  );
  source = replaceOnce(
    source,
    "requireText(gallery, 'const RECENT_LIMIT = 6;', 'Histórico rápido não está limitado a 6 canecas.');",
    "requireText(gallery, 'const RECENT_LIMIT = 6;', 'Histórico rápido não está limitado a 6 canecas.');\nrequireText(gallery, \"const CATEGORY_NAMES = ['Caneca de Porcelana', 'Canecas de Porcelana', 'Canecas'];\", 'Galeria não lê a categoria oficial e as categorias legadas.');",
    'teste de compatibilidade da galeria',
  );
  source = source.replace('Criador de Canecas V8 validado:', 'Criador de Canecas V9 validado:');
  return source;
});

patch('scripts/test-caneca-print.mjs', source => {
  source = replaceOnce(
    source,
    "requireText(html, \"const CATEGORY='Canecas de Porcelana'\", 'Caneca Print não fixa a categoria Canecas de Porcelana.');",
    "requireText(html, \"const CATEGORY='Caneca de Porcelana'\", 'Caneca Print não fixa a categoria oficial Caneca de Porcelana.');\nrequireText(html, \"const CATEGORY_LEGACY='Canecas de Porcelana'\", 'Caneca Print não preserva leitura da categoria legada.');",
    'teste de categoria do Print',
  );
  source = replaceOnce(
    source,
    "requireText(html, \"function isCanecasCategory(value){return norm(value?.categoria)===norm(CATEGORY);}\", 'Filtro de categoria não exige exatamente Canecas de Porcelana.');",
    "requireText(html, \"function isCanecasCategory(value){return CATEGORIES.some(category=>norm(value?.categoria)===norm(category));}\", 'Filtro não aceita categoria oficial e legada.');",
    'teste do filtro de categoria',
  );
  source = replaceOnce(
    source,
    "requireText(html, \"live.searchParams.set('equalTo',JSON.stringify(CATEGORY))\", 'Consulta ao vivo não está limitada à categoria Canecas de Porcelana.');",
    "requireText(html, \"live.searchParams.set('equalTo',JSON.stringify(category))\", 'Consulta ao vivo não recebe a categoria individualmente.');",
    'teste equalTo',
  );
  source = replaceOnce(
    source,
    "requireText(html, \"fetch(liveUrl(),{cache:'no-store'\", 'Fonte ao vivo não força dados frescos da categoria Canecas de Porcelana.');",
    "requireText(html, \"Promise.all(CATEGORIES.map(async category=>\", 'Caneca Print não consulta categoria oficial e legada em paralelo.');",
    'teste de consulta dupla',
  );
  source = replaceOnce(
    source,
    "requireText(sync, \"normalized(value.categoria) === 'canecas de porcelana'\", 'Snapshot de impressão não exige categoria Canecas de Porcelana.');",
    "requireText(sync, \"PRINT_CATEGORY_NAMES.some(category => normalized(value.categoria) === normalized(category))\", 'Snapshot não aceita categoria oficial e legada de porcelana.');",
    'teste do snapshot',
  );
  source = source.replace('Caneca Print validado: somente Canecas de Porcelana ativas,', 'Caneca Print validado: categoria Caneca de Porcelana + legado,');
  return source;
});

for (const file of ['producao/index.html', 'admin/index.html']) {
  patch(file, source => replaceOnce(source, '20260825-mug-v8', '20260825-mug-v9-cadastro', `release ${file}`));
}

patch('producao-v2/js/mug-make-native-openai-bridge.js', source =>
  replaceOnce(source, "|| '20260825-mug-v8';", "|| '20260825-mug-v9-cadastro';", 'fallback do bridge'),
);

patch('producao-v2/js/mug-studio-v8-finalizer.js', source =>
  replaceOnce(source, "|| '20260825-mug-v8';", "|| '20260825-mug-v9-cadastro';", 'fallback do finalizer'),
);

console.log('Patch do cadastro temático V9 aplicado aos arquivos locais.');
