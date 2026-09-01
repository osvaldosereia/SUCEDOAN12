import fs from 'node:fs';

const path='scripts/sincronizar-loja-integrada.mjs';
let s=fs.readFileSync(path,'utf8');

const re=/function description\(p, key\) \{[\s\S]*?\n\}\nfunction stableAlias/;
if(!re.test(s)) throw new Error('Função description() não encontrada');

const replacement=`function description(p, key) {
  const base = baseDescription(p);
  if (!isPersonalizable(p)) return base;

  const model = encodeURIComponent(key);
  const returnUrl = encodeURIComponent('https://www.canecafacil.com.br/');
  const frameUrl = \`https://donaantonia.com.br/loja-integrada/personalizar/?model=\${model}&embed=1&return=\${returnUrl}\`;

  return \`\${base}\n<div class="cf-personalizer-box" style="margin:18px 0;padding:0;border:0;text-align:left">\n<details id="cfPersonalizadorInline" style="width:100%;margin:0;padding:0">\n<summary class="cf-personalize-link" style="display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;box-sizing:border-box;padding:10px 14px;background:#fff;border:1px solid #f47621;border-radius:9px;color:#f47621;font-size:13px;font-weight:800;text-decoration:none;cursor:pointer;list-style:none">PERSONALIZAR ESTA CANECA</summary>\n<div style="width:100%;margin:12px 0 0;padding:0;overflow:hidden;border:1px solid #ece8e4;border-radius:12px;background:#fff">\n<iframe title="Personalizar esta caneca" src="\${esc(frameUrl)}" loading="lazy" style="display:block;width:100%;height:920px;margin:0;border:0;background:#fff" allow="clipboard-write"></iframe>\n</div>\n</details>\n</div>\`.trim();
}
function stableAlias`;

s=s.replace(re,replacement);
fs.writeFileSync(path,s);
console.log('description() alterada para personalizador embutido em iframe.');
