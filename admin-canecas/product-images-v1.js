import { text, mugImage, mugArt } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { getMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260829-admin-canecas-product-images-v1';
const IMAGE_KEY = /(^|_|-)(imagem|imagens|image|images|foto|fotos|photo|photos|mockup|mockups|arte|art|galeria|gallery|thumb|thumbnail|capa|cover|media)(_|-|$)/i;
const IMAGE_EXT = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const URL_LIKE = /^(?:https?:\/\/|data:image\/)/i;

const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

function prettyLabel(path = '') {
  const known = {
    'imagem principal': 'Imagem principal',
    'arte horizontal': 'Arte horizontal',
    mockup_1: 'Mockup 1',
    mockup_2: 'Mockup 2',
    mockup_3: 'Mockup 3',
    url_imagem: 'Imagem principal',
    imagem_url: 'Imagem',
    imagem: 'Imagem'
  };
  if (known[path]) return known[path];
  return path
    .replace(/\[(\d+)\]/g, ' $1')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) || 'Imagem';
}

function collectProductImages(product = {}) {
  const found = [];
  const seen = new Set();

  const add = (url, label, source = '') => {
    const value = text(url);
    if (!value || !URL_LIKE.test(value) || seen.has(value)) return;
    seen.add(value);
    found.push({ url: value, label: prettyLabel(label), source });
  };

  add(mugImage(product), 'imagem principal', 'mugImage');
  add(mugArt(product), 'arte horizontal', 'mugArt');
  add(product.mockup_1, 'mockup_1', 'mockup_1');
  add(product.mockup_2, 'mockup_2', 'mockup_2');
  add(product.mockup_3, 'mockup_3', 'mockup_3');

  const walk = (value, path = '', imageContext = false, depth = 0) => {
    if (depth > 7 || value == null) return;

    if (typeof value === 'string') {
      const raw = text(value);
      if (!raw || !URL_LIKE.test(raw)) return;
      if (imageContext || IMAGE_EXT.test(raw)) add(raw, path || 'imagem', path);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index + 1}]`, imageContext, depth + 1));
      return;
    }

    if (typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      const childContext = imageContext || IMAGE_KEY.test(key) || IMAGE_KEY.test(path);

      if (child && typeof child === 'object' && !Array.isArray(child) && childContext) {
        const direct = child.url || child.src || child.href || child.download_url || child.public_url;
        if (typeof direct === 'string') add(direct, childPath, childPath);
      }

      walk(child, childPath, childContext, depth + 1);
    }
  };

  walk(product);
  return found;
}

function ensureStyles() {
  if (document.getElementById('cfAllProductImagesStyles')) return;
  const style = document.createElement('style');
  style.id = 'cfAllProductImagesStyles';
  style.textContent = `
    .cf-all-images{margin-top:14px;padding-top:14px;border-top:1px solid rgba(17,19,21,.10)}
    .cf-all-images-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    .cf-all-images-head strong{font-size:14px}
    .cf-all-images-head span{font-size:12px;color:#6e756d}
    .cf-all-images-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px}
    .cf-all-image-card{display:block;text-decoration:none;color:inherit;border:1px solid rgba(17,19,21,.10);border-radius:12px;overflow:hidden;background:#fff;min-width:0}
    .cf-all-image-card img{display:block;width:100%;aspect-ratio:1/1;object-fit:contain;background:#f3f4f0}
    .cf-all-image-card span{display:block;padding:7px 8px 2px;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cf-all-image-card small{display:block;padding:0 8px 8px;color:#6e756d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cf-all-images-empty{padding:12px;border:1px dashed rgba(17,19,21,.18);border-radius:10px;color:#6e756d;font-size:13px}
  `;
  document.head.appendChild(style);
}

function galleryHtml(items) {
  if (!items.length) {
    return '<div class="cf-all-images" id="cfAllProductImages"><div class="cf-all-images-head"><strong>Todas as imagens</strong><span>0 encontrada(s)</span></div><div class="cf-all-images-empty">Nenhuma imagem vinculada a este produto.</div></div>';
  }
  return `<div class="cf-all-images" id="cfAllProductImages">
    <div class="cf-all-images-head"><strong>Todas as imagens</strong><span>${items.length} encontrada(s)</span></div>
    <div class="cf-all-images-grid">${items.map((item, index) => `<a class="cf-all-image-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" title="Abrir imagem original"><img src="${esc(item.url)}" alt="${esc(item.label || `Imagem ${index + 1}`)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span>${esc(item.label || `Imagem ${index + 1}`)}</span><small>Imagem ${index + 1}</small></a>`).join('')}</div>
  </div>`;
}

function findImageSection(content) {
  return [...content.querySelectorAll('.form-section')]
    .find(section => /arte\s+e\s+imagens/i.test(text(section.querySelector('h3')?.textContent)));
}

async function renderAllImages(key) {
  const content = document.getElementById('drawerContent');
  if (!content || content.dataset.productKey !== key) return;

  const previous = document.getElementById('cfAllProductImages');
  if (previous) previous.remove();

  try {
    const product = await getMug(key);
    if (!product) return;
    if (content.dataset.productKey !== key) return;

    const section = findImageSection(content);
    if (!section) return;
    ensureStyles();
    section.insertAdjacentHTML('beforeend', galleryHtml(collectProductImages(product)));
  } catch (error) {
    console.warn(`[${BUILD}] Falha ao carregar galeria completa`, error);
  }
}

window.addEventListener('admin-canecas:drawer', event => {
  if (event?.detail?.kind !== 'mug') return;
  const key = text(event.detail.id);
  if (!key) return;
  renderAllImages(key);
});

console.info(`[${BUILD}] galeria completa de imagens ativa`);
