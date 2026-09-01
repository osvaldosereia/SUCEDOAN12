import fs from 'node:fs';

function replaceRegex(path, regex, replacement, label) {
  let source = fs.readFileSync(path, 'utf8');
  if (!regex.test(source)) throw new Error(`${label}: trecho não encontrado em ${path}`);
  source = source.replace(regex, replacement);
  fs.writeFileSync(path, source);
  console.log(`OK ${label}`);
}

const embeddedBulk = `function liDescription(product = {}) {
  const base = text(product.descricao_completa || product.descricao || '')
    .replace(/<div[^>]*class=["'][^"']*cf-personalizer-box[^"']*["'][\\s\\S]*?<\\/div>/gi, '')
    .replace(/<a[^>]*>PERSONALIZAR ESTA CANECA<\\/a>/gi, '')
    .trim();
  if (!isPersonalizable(product)) return base;
  const model = encodeURIComponent(productKey(product));
  const frameUrl = \`${PERSONALIZER_BASE}?model=\${model}&embed=1&return=\${encodeURIComponent('https://canecafacil.com.br/')}\`;
  return \`\${base}\\n<div class="cf-personalizer-box" style="margin:18px 0;padding:0;border:0;text-align:left"><details id="cfPersonalizadorInline" style="width:100%;margin:0;padding:0"><summary class="cf-personalize-link" style="display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;box-sizing:border-box;padding:10px 14px;background:#fff;border:1px solid #f47621;border-radius:9px;color:#f47621;font-size:13px;font-weight:800;text-decoration:none;cursor:pointer;list-style:none">PERSONALIZAR ESTA CANECA</summary><div style="width:100%;margin:10px 0 0;padding:0;overflow:hidden;border:1px solid #ece8e4;border-radius:11px;background:#fff"><iframe title="Personalizar esta caneca" src="\${esc(frameUrl)}" loading="lazy" style="display:block;width:100%;height:520px;margin:0;border:0;background:#fff" allow="clipboard-write"></iframe></div></details></div>\`.trim();
}
function liPayload`;
replaceRegex(
  'admin-canecas/bulk-actions-v1.js',
  /function liDescription\(product = \{\}\) \{[\s\S]*?\n\}\nfunction liPayload/,
  embeddedBulk,
  'bulk-actions sempre embute o personalizador'
);

// O gerenciador de conteúdo continua podendo editar textos/estilo do botão,
// mas a URL tokenizada deixa de apontar para javascript antigo e passa a apontar
// para a aplicação funcional. Isso evita links quebrados em templates customizados.
replaceRegex(
  'admin-canecas/product-content-manager-v1.js',
  /const personalizerUrl = "javascript:[\s\S]*?";\n  return \{/,
  `const personalizerUrl = \`\${base}?model=\${encodeURIComponent(key)}&embed=1&return=\${encodeURIComponent(returnUrl)}\`;\n  return {`,
  'content manager remove javascript legado'
);

// O sincronizador de conteúdo também deixa de gerar javascript legado.
replaceRegex(
  'scripts/sincronizar-conteudo-canecafacil.mjs',
  /const url = "javascript:[\s\S]*?";\n  return \{/,
  `const url = \`\${base}?model=\${encodeURIComponent(key)}&embed=1&return=\${encodeURIComponent(ret)}\`;\n  return {`,
  'content sync remove javascript legado'
);

console.log('Alinhamento concluído.');
