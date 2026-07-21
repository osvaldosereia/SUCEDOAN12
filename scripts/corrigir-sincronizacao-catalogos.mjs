import { readFile, writeFile, rm } from "node:fs/promises";

const ROOT_SITE_PATH = "index.html";
const LEGACY_SITE_PATH = "site/index.html";
const ADMIN_PATH = "producao/index.html";
const STOCK_PATH = "estoque.html";
const ORDER_PATH = "producao/pedido.html";
const OFFERS_SCRIPT_PATH = "scripts/processar-ofertas.mjs";
const OFFERS_RECONCILE_PATH = "scripts/reconciliar-publicacao-ofertas.mjs";
const OFFERS_WORKFLOW_PATH = ".github/workflows/processar-ofertas.yml";
const README_PATH = "cadastro/teste/README.md";
const VERSION_PATH = "site/app-version.json";
const LEGACY_PRODUCTS_PATH = ["site", "produtos.json"].join("/");
const VERSION = "2026-07-21-firebase-unico-v17";

async function patchFile(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (typeof after !== "string") throw new Error(`Transformação inválida em ${path}.`);
  if (after !== before) await writeFile(path, after, "utf8");
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    if (source.includes(replacement.trim())) return source;
    throw new Error(`Início não encontrado: ${label}.`);
  }
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Fim não encontrado: ${label}.`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function patchRootSite(html) {
  html = html.replace(/APP_VERSION:\s*'[^']+'/u, `APP_VERSION: '${VERSION}'`);

  const oldCacheBust = `    function withCacheBust(url, forceFresh) {
      const separator = String(url).includes('?') ? '&' : '?';
      const version = forceFresh ? Date.now() : CONFIG.APP_VERSION;
      return \`${"${url}${separator}v=${encodeURIComponent(version)}"}\`;
    }`;
  const newCacheBust = `    function withCacheBust(url, forceFresh) {
      const source = String(url || '');
      const separator = source.includes('?') ? '&' : '?';
      const liveCatalog = /(?:^|\\/)produtos-home\\.json(?:\\?|$)/i.test(source);
      const version = forceFresh || liveCatalog ? Date.now() : CONFIG.APP_VERSION;
      return \`${"${source}${separator}v=${encodeURIComponent(version)}"}\`;
    }`;

  if (html.includes(oldCacheBust)) html = html.replace(oldCacheBust, newCacheBust);
  html = html.replace(
    "const data = await fetchJson(withCacheBust(url), 6500, { cache: 'default' });",
    "const data = await fetchJson(withCacheBust(url), 6500, { cache: 'no-store' });"
  );
  html = html.replace(
    "if (!forceFresh && state.catalogMode === 'compact-full' && state.products.length) return true;",
    "if (!forceFresh && isHomeRoute() && state.catalogMode === 'compact-full' && state.products.length) return true;"
  );
  html = html.replace(
    `          await loadHomeProducts();
          return true;`,
    `          await loadHomeProducts();
          if (isHomeRoute()) return true;`
  );

  if (html.includes(LEGACY_PRODUCTS_PATH)) throw new Error("O index da raiz ainda referencia o catálogo completo removido.");
  return html;
}

function patchAdmin(html) {
  const directLoader = '<script src="catalog-sync-admin.js?v=2026-07-21-catalog-v4"></script>';
  if (!html.includes(directLoader)) {
    html = html.replace(
      /<script src="nfe-import\.js\?v=[^"]+"><\/script>/u,
      `${directLoader}\n<script src="nfe-import.js?v=2026-07-21-catalog-v4"></script>`
    );
  }

  html = replaceSection(
    html,
    "  async function loadProductsFromGithub(){",
    "  function firebaseProductsSources(){",
    "",
    "remoção do fallback completo do GitHub"
  );

  const fallback = `  async function loadProductsWithFallback(){
    const errors=[];
    let cached=null;
    try{cached=await readProductsCache()}catch(error){errors.push(\`Cache local: \${error.message||error}\`)}

    try{
      const firebase=await loadProductsFromFirebase({attempts:3});
      writeProductsCache(firebase.products,'Firebase').catch(error=>console.warn('Cache de produtos não atualizado:',error));
      return firebase;
    }catch(error){errors.push(\`Firebase: \${error.message||error}\`)}

    if(cached?.products?.length)return {products:cached.products,source:'cache local seguro',warning:errors.join(' | ')};
    if(Array.isArray(state.produtos)&&state.produtos.length){
      console.warn('Não foi possível atualizar o Firebase; mantendo os produtos já carregados.',errors);
      return {products:[...state.produtos],source:'memória da sessão',warning:errors.join(' | ')};
    }
    throw new Error(errors.join(' | '));
  }

`;
  html = replaceSection(
    html,
    "  async function loadProductsWithFallback(){",
    "  let productsSilentRefreshRunning=false;",
    fallback,
    "carregamento exclusivo pelo Firebase"
  );

  const silentRefresh = `  async function refreshProductsSilently(){
    if(productsSilentRefreshRunning||state.dirtyProductKeys.size||state.deletedProductKeys.size)return false;
    productsSilentRefreshRunning=true;
    try{
      let fresh=null;
      try{fresh=await loadProductsFromFirebase({attempts:2})}
      catch(error){console.warn('Atualização silenciosa pelo Firebase falhou:',error)}
      if(!fresh?.products?.length)return false;
      state.produtos=fresh.products;
      markProductsReloaded();
      await writeProductsCache(state.produtos,fresh.source).catch(()=>false);
      renderAll();
      setStatus(\`Produtos atualizados automaticamente: \${state.produtos.length} via Firebase\`,'ok');
      return true;
    }finally{productsSilentRefreshRunning=false}
  }

`;
  html = replaceSection(
    html,
    "  async function refreshProductsSilently(){",
    "  async function loadData(){",
    silentRefresh,
    "atualização silenciosa exclusiva pelo Firebase"
  );

  html = html
    .replaceAll(LEGACY_PRODUCTS_PATH, "")
    .replace(/if\(produtos\)\s*ops\.push\(\(\)=>githubUpsert\(state\.settings\.githubProdutosPath,produtos,"[^"]*"\)\);/g, "")
    .replace(/if\(produtos\)\s*ops\.push\(\{label:"produtos\.json",run:\(\)=>githubUpsert\(state\.settings\.githubProdutosPath,produtos,"[^"]*"\)\}\);/g, "")
    .replace(/payload\.produtos=productsObject\(\);?/g, "")
    .replace(/produtos:productsObject\(\),/g, "")
    .replace(/saveGithubFiles\(\{produtos,metaCatalogCsv/g, "saveGithubFiles({metaCatalogCsv")
    .replace(/async function saveGithubFiles\(\{produtos,/g, "async function saveGithubFiles({")
    .replace(/saveGithubFiles\s*=\s*async function\(\{produtos,produtosHome,/g, "saveGithubFiles = async function({produtosHome,")
    .replace(/githubProdutosPath\s*:\s*["'][^"']*produtos\.json["']/g, 'githubProdutosPath:""');

  if (html.includes(LEGACY_PRODUCTS_PATH)) throw new Error("O admin ainda referencia o catálogo completo removido.");
  if (html.includes("loadProductsFromGithub")) throw new Error("O fallback de produtos pelo GitHub ainda existe no admin.");
  if (/githubProdutosPath,produtos/.test(html)) throw new Error("O admin ainda tenta publicar um catálogo completo no GitHub.");
  return html;
}

function patchOffersScript(source) {
  source = source
    .replace(/^const PRODUCTS_PATH = process\.env\.PRODUCTS_PATH \|\| "site\/produtos\.json";\r?\n/m, "")
    .replace(/^\s*writeJson\(PRODUCTS_PATH, result\.products\),\r?\n/m, "");
  if (source.includes(LEGACY_PRODUCTS_PATH) || source.includes("PRODUCTS_PATH")) {
    throw new Error("O processador de ofertas ainda tenta escrever o catálogo completo.");
  }
  return source;
}

function patchOffersReconcile(source) {
  source = source
    .replace(/^const PRODUCTS_PATH = process\.env\.PRODUCTS_PATH \|\| "site\/produtos\.json";\r?\n/m, "")
    .replace(/\s*generatedProducts,\r?\n\s*generatedHome/m, "\n    generatedHome")
    .replace(/^\s*readJson\(temp\("gerado-produtos\.json"\)\),\r?\n/m, "")
    .replace(/^\s*writeJson\(PRODUCTS_PATH, generatedProducts\),\r?\n/m, "");
  if (source.includes(LEGACY_PRODUCTS_PATH) || source.includes("PRODUCTS_PATH") || source.includes("gerado-produtos.json")) {
    throw new Error("A reconciliação de ofertas ainda depende do catálogo completo.");
  }
  return source;
}

function patchOffersWorkflow(source) {
  source = source
    .replace(/^\s*cp site\/produtos\.json "\$dir\/gerado-produtos\.json"\r?\n/m, "")
    .replace(/^\s*site\/produtos\.json \\\r?\n/m, "");
  if (source.includes(LEGACY_PRODUCTS_PATH)) throw new Error("O workflow de ofertas ainda publica o catálogo completo.");
  return source;
}

function patchLegacyConsumer(source) {
  return source.replaceAll(LEGACY_PRODUCTS_PATH, "site/produtos-home.json");
}

function patchOrder(source) {
  source = source.replace(
    "        const QUEUE_KEY = 'sucedoan_fila_sincronizacao'; ",
    "        const QUEUE_KEY = 'sucedoan_fila_sincronizacao';\n        const FIREBASE_DATABASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com'; "
  );

  source = source.replace(
    /\s*else if \(task\.type === 'PRODUTOS_JSON'\) \{\s*await GitHubAPI\.saveFile\(`site\/produtos\.json`, task\.payload\.vitrine, task\.payload\.message\);\s*\}/u,
    ""
  );

  source = source.replace(
    /\s*function salvarProdutosJSON\(\) \{[\s\S]*?\n\s*\}\n\n\s*async function processarBaixaPedidoTexto\(\) \{/u,
    `
        async function localizarFirebaseKey(produto) {
            const savedKey = String(produto.firebaseKey || produto.key || '').trim();
            if (savedKey) return savedKey;
            const codigo = String(produto.codigo || produto.id || '').trim();
            if (!codigo) throw new Error('Produto sem firebaseKey ou código para atualizar o estoque.');
            const query = new URL(FIREBASE_DATABASE_URL + '/produtos.json');
            query.searchParams.set('orderBy', JSON.stringify('codigo'));
            query.searchParams.set('equalTo', JSON.stringify(codigo));
            query.searchParams.set('limitToFirst', '1');
            const response = await fetch(query, { cache: 'no-store', headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error('Firebase recusou a busca do produto ' + codigo + ': HTTP ' + response.status);
            const data = await response.json();
            const key = Object.keys(data || {})[0];
            if (!key) throw new Error('Produto não localizado no Firebase: ' + codigo);
            produto.firebaseKey = key;
            return key;
        }

        async function salvarProdutosFirebase(produtosAlterados) {
            for (const produto of produtosAlterados) {
                const key = await localizarFirebaseKey(produto);
                const payload = {
                    estoque: Math.max(0, Number(produto.estoque || 0)),
                    last_update: Number(produto.last_update || Date.now()),
                    updated_at: new Date().toISOString()
                };
                const response = await fetch(FIREBASE_DATABASE_URL + '/produtos/' + encodeURIComponent(key) + '.json', {
                    method: 'PATCH',
                    cache: 'no-store',
                    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) throw new Error('Firebase recusou o estoque de ' + (produto.nome || key) + ': HTTP ' + response.status);
            }
        }

        async function processarBaixaPedidoTexto() {`
  );

  source = source.replace(
    "            let itensParaSeparacao = [];",
    "            let itensParaSeparacao = [];\n            const produtosAlterados = [];"
  );
  source = source.replace(
    "                        p.last_update = Date.now(); ",
    "                        p.last_update = Date.now();\n                        if (!produtosAlterados.includes(p)) produtosAlterados.push(p); "
  );
  source = source.replace(
    "                // 4. Salvar produtos\n                salvarProdutosJSON(); ",
    "                // 4. Salvar estoque diretamente na fonte oficial\n                await salvarProdutosFirebase(produtosAlterados); "
  );
  source = source.replace(
    "Enviando para o GitHub em segundo plano.",
    "Estoque salvo no Firebase; enviando somente os arquivos auxiliares em segundo plano."
  );

  if (source.includes(LEGACY_PRODUCTS_PATH) || source.includes("PRODUTOS_JSON") || source.includes("salvarProdutosJSON")) {
    throw new Error("O gestor de pedidos ainda tenta usar o catálogo completo removido.");
  }
  return source;
}

function patchReadme(source) {
  return source.replace(
    `- A aplicação não altera \`${LEGACY_PRODUCTS_PATH}\`.`,
    "- A aplicação grava produtos somente no Firebase e não mantém catálogo completo no GitHub."
  );
}

async function writeVersion() {
  const payload = {
    version: VERSION,
    updatedAt: "2026-07-21T22:00:00Z",
    purpose: "Firebase como única fonte completa; produtos-home como catálogo leve derivado"
  };
  await writeFile(VERSION_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

await patchFile(ROOT_SITE_PATH, patchRootSite);
await patchFile(LEGACY_SITE_PATH, patchLegacyConsumer);
await patchFile(ADMIN_PATH, patchAdmin);
await patchFile(STOCK_PATH, patchLegacyConsumer);
await patchFile(ORDER_PATH, patchOrder);
await patchFile(OFFERS_SCRIPT_PATH, patchOffersScript);
await patchFile(OFFERS_RECONCILE_PATH, patchOffersReconcile);
await patchFile(OFFERS_WORKFLOW_PATH, patchOffersWorkflow);
await patchFile(README_PATH, patchReadme);
await writeVersion();

await rm(LEGACY_PRODUCTS_PATH, { force: true });
await rm("scripts/atualizar-admin-produtos-home.mjs", { force: true });
await rm(".github/workflows/atualizar-admin-produtos-home.yml", { force: true });

console.log("Catálogo completo do GitHub eliminado. Firebase é a fonte oficial e produtos-home é o único catálogo derivado.");
