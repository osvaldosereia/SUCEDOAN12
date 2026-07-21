import { readFile, writeFile } from "node:fs/promises";

const SITE_PATH = "index.html";
const ADMIN_PATH = "producao/index.html";
const VERSION_PATH = "site/app-version.json";
const VERSION = "2026-07-21-catalog-sync-v16";

async function patchSite(){
  let html = await readFile(SITE_PATH, "utf8");
  const original = html;

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

  if(html.includes(oldCacheBust)) html = html.replace(oldCacheBust, newCacheBust);
  else if(!html.includes("const liveCatalog = /(?:^|\\/)produtos-home\\.json")) throw new Error("Bloco withCacheBust do site não encontrado.");

  html = html.replace(
    "const data = await fetchJson(withCacheBust(url), 6500, { cache: 'default' });",
    "const data = await fetchJson(withCacheBust(url), 6500, { cache: 'no-store' });"
  );

  html = html.replace(
    "if (!forceFresh && state.catalogMode === 'compact-full' && state.products.length) return true;",
    "if (!forceFresh && isHomeRoute() && state.catalogMode === 'compact-full' && state.products.length) return true;"
  );

  const compactReturn = `          await loadHomeProducts();
          return true;`;
  const homeOnlyReturn = `          await loadHomeProducts();
          if (isHomeRoute()) return true;`;
  if(html.includes(compactReturn)) html = html.replace(compactReturn, homeOnlyReturn);
  else if(!html.includes(homeOnlyReturn)) throw new Error("Retorno do catálogo compacto no loadProducts não encontrado.");

  if(html !== original) await writeFile(SITE_PATH, html, "utf8");
}

async function patchAdmin(){
  let html = await readFile(ADMIN_PATH, "utf8");
  const original = html;
  const directLoader = '<script src="catalog-sync-admin.js?v=2026-07-21-catalog-v4"></script>';

  if(!html.includes(directLoader)){
    html = html.replace(
      /<script src="nfe-import\.js\?v=[^"]+"><\/script>/u,
      `${directLoader}\n<script src="nfe-import.js?v=2026-07-21-catalog-v4"></script>`
    );
  }else{
    html = html.replace(/<script src="nfe-import\.js\?v=[^"]+"><\/script>/u, '<script src="nfe-import.js?v=2026-07-21-catalog-v4"></script>');
  }

  if(!html.includes(directLoader)) throw new Error("Não foi possível instalar o carregador direto no admin.");
  if(html !== original) await writeFile(ADMIN_PATH, html, "utf8");
}

async function writeVersion(){
  const payload = {
    version: VERSION,
    updatedAt: "2026-07-21T20:00:00Z",
    purpose: "Firebase como fonte oficial; produtos-home sempre atualizado e catálogo completo sincronizado"
  };
  await writeFile(VERSION_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

await Promise.all([patchSite(), patchAdmin(), writeVersion()]);
console.log("Leitura do site, carregamento do admin e versão do catálogo corrigidos.");
