const FIREBASE_PRODUCTS_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos';
const MAX_IMAGES = 3;
let activeRequest = 0;

function text(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function localAsset(value) {
  const raw = text(value);
  if (!raw) return '';
  let match = raw.match(/^https?:\/\/raw\.githubusercontent\.com\/osvaldosereia\/SUCEDOAN12\/[^/]+\/(.+)$/i);
  if (!match) match = raw.match(/^https?:\/\/github\.com\/osvaldosereia\/SUCEDOAN12\/(?:raw|blob)\/[^/]+\/(.+)$/i);
  if (match?.[1]) return `/${match[1].replace(/^\/+/, '')}`;
  return raw;
}

function productImages(raw = {}) {
  const values = [
    raw.url_imagem,
    raw.imagem_url,
    raw.imagem,
    ...(Array.isArray(raw.imagens) ? raw.imagens : []),
    ...(Array.isArray(raw.images) ? raw.images : []),
  ];
  return [...new Set(values.map(localAsset).filter(Boolean))].slice(0, MAX_IMAGES);
}

function youtubeId(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      id = url.searchParams.get('v') || '';
      if (!id) {
        const parts = url.pathname.split('/').filter(Boolean);
        const marker = parts.findIndex(part => ['embed', 'shorts', 'live'].includes(part));
        if (marker >= 0) id = parts[marker + 1] || '';
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
  } catch {
    return '';
  }
}

function routeReference() {
  const match = location.hash.match(/^#\/produto\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function bindGallery(images) {
  const media = document.querySelector('.product-detail-media');
  const main = document.getElementById('product-main-image');
  if (!media || !main || !images.length) return;

  main.src = images[0];
  main.dataset.fallback = images.slice(1).join('|');

  media.querySelector('.image-thumbs')?.remove();
  if (images.length <= 1) return;

  const thumbs = document.createElement('div');
  thumbs.className = 'image-thumbs product-media-thumbs';
  thumbs.setAttribute('aria-label', 'Fotos do produto');
  thumbs.innerHTML = images.map((image, index) => `<button type="button" class="product-media-thumb${index === 0 ? ' active' : ''}" data-product-media-src="${escapeHtml(image)}" aria-label="Ver foto ${index + 1}"><img loading="lazy" decoding="async" src="${escapeHtml(image)}" alt="Foto ${index + 1} do produto"></button>`).join('');
  media.appendChild(thumbs);

  thumbs.addEventListener('click', event => {
    const button = event.target.closest('[data-product-media-src]');
    if (!button) return;
    main.src = button.dataset.productMediaSrc;
    thumbs.querySelectorAll('.product-media-thumb').forEach(item => item.classList.toggle('active', item === button));
  });
}

function bindYoutube(raw) {
  document.querySelector('[data-product-youtube]')?.remove();
  const id = youtubeId(raw.video_youtube || raw.video_url || raw.youtube || raw.youtube_url);
  if (!id) return;
  const detail = document.querySelector('.product-detail');
  if (!detail) return;

  const section = document.createElement('section');
  section.className = 'product-youtube-section';
  section.dataset.productYoutube = '1';
  section.innerHTML = `<div class="product-youtube-heading"><strong>Vídeo do produto</strong><span>Veja mais detalhes</span></div><div class="product-youtube-frame"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}" title="Vídeo do produto no YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
  detail.insertAdjacentElement('afterend', section);
}

async function enhanceCurrentProduct() {
  const reference = routeReference();
  if (!reference) return;
  const request = ++activeRequest;
  try {
    const response = await fetch(`${FIREBASE_PRODUCTS_URL}/${encodeURIComponent(reference)}.json`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const raw = await response.json();
    if (!raw || request !== activeRequest || reference !== routeReference()) return;
    bindGallery(productImages(raw));
    bindYoutube(raw);
  } catch (error) {
    console.warn('Mídia complementar do produto não pôde ser carregada:', error);
  }
}

function injectStyle() {
  if (document.getElementById('productMediaStyle')) return;
  const style = document.createElement('style');
  style.id = 'productMediaStyle';
  style.textContent = `
    .product-media-thumbs{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.product-media-thumb{border:1px solid #e2e2e2;background:#fff;border-radius:12px;padding:5px;cursor:pointer;overflow:hidden}.product-media-thumb.active{border-color:#111;box-shadow:0 0 0 1px #111}.product-media-thumb img{display:block;width:100%;aspect-ratio:1;object-fit:contain;border-radius:8px;background:#fff}
    .product-youtube-section{margin:18px 0 28px;padding:18px;background:#fff;border:1px solid #e9e9e9;border-radius:18px}.product-youtube-heading{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:12px}.product-youtube-heading strong{font-size:18px}.product-youtube-heading span{font-size:12px;color:#777}.product-youtube-frame{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#000}.product-youtube-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    @media(max-width:700px){.product-youtube-section{margin:14px 0 22px;padding:12px;border-radius:14px}.product-media-thumbs{gap:7px}.product-media-thumb{border-radius:9px}}
  `;
  document.head.appendChild(style);
}

injectStyle();
window.addEventListener('da:route-rendered', enhanceCurrentProduct);
window.addEventListener('hashchange', () => setTimeout(enhanceCurrentProduct, 0));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceCurrentProduct, { once: true });
else enhanceCurrentProduct();
