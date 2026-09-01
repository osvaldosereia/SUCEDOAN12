import fs from 'node:fs';

const CLICK_LINK = "javascript:(function(){try{var u=new URL(location.href);u.searchParams.set('cf_personalizador','teste');u.hash='cfInlinePersonalizer';history.replaceState(history.state,'',u.href);var p=document.getElementById('cfInlinePersonalizer');if(p){p.scrollIntoView({behavior:'smooth',block:'center'});return;}if(window.__CF_INLINE_CLICK_LOADING__)return;window.__CF_INLINE_CLICK_LOADING__=1;var s=document.createElement('script');s.src='https://donaantonia.com.br/loja-integrada/personalizador-inline-v2.js?v=20260901-5';s.async=true;s.onload=function(){window.__CF_INLINE_CLICK_LOADING__=0};s.onerror=function(){window.__CF_INLINE_CLICK_LOADING__=0;alert('Não foi possível abrir a personalização. Atualize a página e tente novamente.')};document.head.appendChild(s)}catch(e){console.error(e);alert('Não foi possível abrir a personalização.')}})();";

function patch(path, oldText, newText) {
  let src = fs.readFileSync(path, 'utf8');
  if (!src.includes(oldText)) throw new Error(`Trecho esperado não encontrado em ${path}`);
  src = src.replace(oldText, newText);
  fs.writeFileSync(path, src);
  console.log(`OK ${path}`);
}

patch(
  'scripts/sincronizar-loja-integrada.mjs',
  "  const link = '?cf_personalizador=teste#cfInlinePersonalizer';",
  `  const link = ${JSON.stringify(CLICK_LINK)};`
);

patch(
  'scripts/sincronizar-conteudo-canecafacil.mjs',
  "  const url = '?cf_personalizador=teste#cfInlinePersonalizer';",
  `  const url = ${JSON.stringify(CLICK_LINK)};`
);

patch(
  'admin-canecas/product-content-manager-v1.js',
  "  const personalizerUrl = '?cf_personalizador=teste#cfInlinePersonalizer';",
  `  const personalizerUrl = ${JSON.stringify(CLICK_LINK)};`
);

console.log('Botão agora carrega o personalizador diretamente na própria página.');
