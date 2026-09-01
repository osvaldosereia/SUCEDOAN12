import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function write(path,value){fs.writeFileSync(path,value);console.log(`OK ${path}`);}
function mustReplace(source,search,replacement,label){if(!source.includes(search))throw new Error(`Trecho não encontrado: ${label}`);return source.replace(search,replacement);}

// Admin: nova camada de vitrine com somente 2 recortes.
{
  const path='admin-canecas/index.html';
  let s=read(path);
  s=mustReplace(s,'storefront-crops-github-v2.js?v=20260831-1','storefront-crops-github-v3.js?v=20260901-1','loader storefront v3');
  write(path,s);
}

// Worker principal da Loja Integrada: 2 imagens + personalizador já aberto.
{
  const path='scripts/sincronizar-loja-integrada.mjs';
  let s=read(path);
  const oldImages=`function storefrontImages(p = {}) {\n  return [\n    p.mockup_2,\n    p.mockup_1,\n    p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda,\n    p.vitrine_recorte_direita || p.vitrine_recortes?.direita,\n    p.vitrine_recorte_centro || p.vitrine_recortes?.centro,\n  ].map(text);\n}`;
  const newImages=`function storefrontImages(p = {}) {\n  return [\n    p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda,\n    p.vitrine_recorte_direita || p.vitrine_recortes?.direita,\n  ].map(text);\n}`;
  s=mustReplace(s,oldImages,newImages,'storefrontImages 2 recortes');
  const rx=/function description\(p, key\) \{[\s\S]*?\n\}\nfunction stableAlias/;
  if(!rx.test(s))throw new Error('Função description não encontrada.');
  s=s.replace(rx,`function description(p, key) {\n  const base = baseDescription(p);\n  if (!isPersonalizable(p)) return base;\n  const model = encodeURIComponent(key);\n  const returnUrl = encodeURIComponent('https://www.canecafacil.com.br/');\n  const frameUrl = \`https://donaantonia.com.br/loja-integrada/personalizar/?model=\${model}&embed=1&return=\${returnUrl}\`;\n  const fields = Object.values(p.personalizacao?.campos || {}).filter(item => item?.ativo === true).length;\n  const frameHeight = Math.min(520, Math.max(235, 190 + fields * 48));\n  return \`\${base}\n<div class="cf-personalizer-box" style="margin:14px 0 18px;padding:0;border:1px solid #ece8e4;border-radius:12px;overflow:hidden;background:#fff;text-align:left">\n<iframe title="Personalizar esta caneca" src="\${esc(frameUrl)}" loading="eager" style="display:block;width:100%;height:\${frameHeight}px;margin:0;border:0;background:#fff" allow="clipboard-write"></iframe>\n</div>\`.trim();\n}\nfunction stableAlias`);
  write(path,s);
}

// Ações em lote: não exigir mockup e nunca voltar ao botão fechado.
{
  const path='admin-canecas/bulk-actions-v1.js';
  let s=read(path);
  s=mustReplace(s,"  if (!text(product.mockup_1)) issues.push('imagem 1');","  if (!text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url || product.arte_final_url)) issues.push('arte horizontal');",'validação horizontal');
  const rx=/function liDescription\(product = \{\}\) \{[\s\S]*?\n\}\nfunction liPayload/;
  if(!rx.test(s))throw new Error('Função liDescription não encontrada.');
  s=s.replace(rx,`function liDescription(product = {}) {\n  const base = text(product.descricao_completa || product.descricao || '')\n    .replace(/<div[^>]*class=["'][^"']*cf-personalizer-box[^"']*["'][\\s\\S]*?<\\/div>/gi, '')\n    .replace(/<a[^>]*>PERSONALIZAR ESTA CANECA<\\/a>/gi, '')\n    .trim();\n  if (!isPersonalizable(product)) return base;\n  const model = encodeURIComponent(productKey(product));\n  const frameUrl = \`\${PERSONALIZER_BASE}?model=\${model}&embed=1&return=\${encodeURIComponent('https://canecafacil.com.br/')}\`;\n  const fields = Object.values(product.personalizacao?.campos || {}).filter(item => item?.ativo === true).length;\n  const frameHeight = Math.min(520, Math.max(235, 190 + fields * 48));\n  return \`\${base}\\n<div class="cf-personalizer-box" style="margin:14px 0 18px;padding:0;border:1px solid #ece8e4;border-radius:12px;overflow:hidden;background:#fff;text-align:left"><iframe title="Personalizar esta caneca" src="\${esc(frameUrl)}" loading="eager" style="display:block;width:100%;height:\${frameHeight}px;margin:0;border:0;background:#fff" allow="clipboard-write"></iframe></div>\`.trim();\n}\nfunction liPayload`);
  write(path,s);
}

console.log('V13 produção aplicada.');