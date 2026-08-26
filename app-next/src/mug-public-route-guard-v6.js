const BUILD = '20260826-site-mug-route-guard-v6';
let timer = 0;
let lastKey = '';
let attempts = 0;

function productKey() {
  const match = String(location.hash || '').match(/^#\/produto\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function hasPersonalizer() {
  return Boolean(document.getElementById('mug-public-personalizer'));
}

function nudge() {
  const key = productKey();
  if (!key) {
    lastKey = '';
    attempts = 0;
    return;
  }
  if (key !== lastKey) {
    lastKey = key;
    attempts = 0;
  }
  if (hasPersonalizer() || !document.querySelector('.product-detail')) return;
  attempts += 1;
  window.dispatchEvent(new Event('hashchange'));
  window.dispatchEvent(new CustomEvent('da:catalog-ready', { detail:{ source:BUILD, key } }));
}

function schedule(delay = 40) {
  clearTimeout(timer);
  timer = setTimeout(nudge, delay);
}

window.addEventListener('hashchange', () => schedule(30));
window.addEventListener('popstate', () => schedule(30));
window.addEventListener('da:route-rendered', () => schedule(20));
window.addEventListener('da:catalog-ready', event => {
  if (event?.detail?.source !== BUILD) schedule(30);
});

const observer = new MutationObserver(() => {
  if (productKey() && !hasPersonalizer()) schedule(40);
});
observer.observe(document.documentElement, { childList:true, subtree:true });

setInterval(() => {
  if (productKey() && !hasPersonalizer() && attempts < 12) nudge();
}, 500);

schedule(0);
document.documentElement.dataset.mugRouteGuard = BUILD;
