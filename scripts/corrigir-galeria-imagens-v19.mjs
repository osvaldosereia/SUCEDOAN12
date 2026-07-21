import { readFile, writeFile } from 'node:fs/promises';

const INDEX_PATH = 'index.html';
const VERSION_PATH = 'site/app-version.json';
const OLD_VERSION = '2026-07-21-carregamento-simples-v18';
const NEW_VERSION = '2026-07-21-imagens-unicas-v19';

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`Não foi possível aplicar: ${label}`);
  return next;
}

let html = await readFile(INDEX_PATH, 'utf8');
html = html.split(OLD_VERSION).join(NEW_VERSION);

html = replaceRequired(
  html,
  /    function productImagesFor\(raw, product\) \{[\s\S]*?\n    \}\n\n    function extractVolume/,
`    function productImagesFor(raw, product) {
      const list = [];
      const seen = new Set();
      const push = value => {
        const source = String(value || '').trim();
        if (!source || /site\\/tmp\\/ia-referencias\\//i.test(source)) return;
        const normalized = normalizePublicAsset(source);
        const logicalKey = String(normalized.external || normalized.path || '').toLowerCase();
        if (!logicalKey || seen.has(logicalKey)) return;
        seen.add(logicalKey);
        const primary = assetCandidates(source)[0];
        if (primary && !/ia-referencias/i.test(primary)) list.push(primary);
      };

      push(raw.url_imagem || '');
      push(raw.imagem_url || raw.urlImagem || '');
      push(raw.imagem || raw.image || raw.img || raw.foto || raw.foto_url || '');
      if (Array.isArray(raw.imagens)) raw.imagens.forEach(push);
      if (Array.isArray(raw.images)) raw.images.forEach(push);
      if (raw.imagem_path) push(raw.imagem_path);

      if (!list.length) list.push(PUBLIC_ASSET_LOGO);
      return list;
    }

    function extractVolume`,
  'deduplicação lógica das imagens dos produtos'
);

html = replaceRequired(
  html,
  /    function normalizeRelativeImage\(value\) \{[\s\S]*?\n    \}\n\n    function normalizeBannerImage/,
`    function normalizeRelativeImage(value) {
      const img = String(value || '').trim();
      if (!img || /site\\/tmp\\/ia-referencias\\//i.test(img)) return PUBLIC_ASSET_LOGO;
      return assetCandidates(img)[0] || PUBLIC_ASSET_LOGO;
    }

    function normalizeBannerImage`,
  'normalização de imagens de kits e cestas'
);

html = replaceRequired(
  html,
  /    function fallbackImg\(el\) \{[\s\S]*?\n    \}\n    window\.__daFallbackImg = fallbackImg;/,
`    function fallbackImg(el) {
      if (!el) return;
      const current = String(el.currentSrc || el.src || '').trim();
      const candidates = [];
      const add = value => {
        const url = String(value || '').trim();
        if (url && !/ia-referencias/i.test(url) && !candidates.includes(url)) candidates.push(url);
      };

      String(el.getAttribute('data-fallback-images') || '')
        .split('|')
        .map(value => value.trim())
        .filter(Boolean)
        .forEach(source => assetCandidates(source).forEach(add));

      assetCandidates(current).forEach(add);

      if (/\\/produtos_2\\//i.test(current)) {
        assetCandidates(current.replace('/produtos_2/', '/produtos/')).forEach(add);
      } else if (/\\/produtos\\//i.test(current) && !/\\/produtos_3\\//i.test(current)) {
        assetCandidates(current.replace('/produtos/', '/produtos_2/')).forEach(add);
      }

      add(PUBLIC_ASSET_LOGO);

      const used = new Set(String(el.getAttribute('data-fallback-used') || '').split('|').filter(Boolean));
      if (current) used.add(current);
      const next = candidates.find(url => url && url !== current && !used.has(url));

      if (next) {
        el.setAttribute('data-fallback-used', Array.from(used).join('|'));
        el.src = next;
        return;
      }

      el.onerror = null;
      el.src = PUBLIC_ASSET_LOGO;
    }
    window.__daFallbackImg = fallbackImg;`,
  'fallback único e silencioso das imagens'
);

await writeFile(INDEX_PATH, html, 'utf8');
await writeFile(VERSION_PATH, `${JSON.stringify({
  version: NEW_VERSION,
  updatedAt: new Date().toISOString(),
  purpose: 'Remove fotos repetidas da galeria e recupera imagens de produtos, kits e cestas'
}, null, 2)}\n`, 'utf8');

console.log(`Correção ${NEW_VERSION} aplicada.`);
