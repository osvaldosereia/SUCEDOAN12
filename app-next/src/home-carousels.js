const app = document.getElementById('app');
const enhancedTracks = new WeakSet();
const controlsByTrack = new WeakMap();
const kitShuffleSeed = (() => {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0];
  }
  return Math.floor(Math.random() * 0xFFFFFFFF);
})();
const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(entries => {
  entries.forEach(entry => {
    const controls = controlsByTrack.get(entry.target);
    if (controls) updateControls(entry.target, controls.previousButton, controls.nextButton);
  });
}) : null;

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function hashWithSeed(value, seed) {
  let hash = (2166136261 ^ seed) >>> 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function cardShuffleKey(card, index) {
  const link = card.querySelector('.bundle-name, .bundle-media');
  return link?.getAttribute('href') || link?.textContent?.trim() || String(index);
}

function shufflePromotionalKits(track, label) {
  if (normalizeLabel(label) !== 'kits promocionais') return;

  const cards = [...track.querySelectorAll(':scope > .bundle-card')];
  if (cards.length < 2) return;

  const entries = cards.map((card, index) => ({
    card,
    index,
    key: cardShuffleKey(card, index)
  }));
  const collectionKey = entries.map(entry => entry.key).sort().join('|');
  const shuffleToken = `${kitShuffleSeed}:${hashWithSeed(collectionKey, 0)}`;
  if (track.dataset.kitShuffleToken === shuffleToken) return;

  entries
    .sort((first, second) => {
      const rankDifference = hashWithSeed(first.key, kitShuffleSeed) - hashWithSeed(second.key, kitShuffleSeed);
      return rankDifference || first.index - second.index;
    })
    .forEach(entry => track.append(entry.card));

  track.dataset.kitShuffleToken = shuffleToken;
  track.scrollLeft = 0;
}

function scrollStep(track) {
  const card = track.querySelector('.bundle-card');
  if (!card) return Math.max(track.clientWidth * 0.85, 240);
  const styles = getComputedStyle(track);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || '12') || 12;
  return card.getBoundingClientRect().width + gap;
}

function updateControls(track, previousButton, nextButton) {
  const maximum = Math.max(track.scrollWidth - track.clientWidth, 0);
  previousButton.disabled = track.scrollLeft <= 2;
  nextButton.disabled = track.scrollLeft >= maximum - 2;
}

function createControls(track, label, index) {
  const section = track.closest('.content-section');
  const heading = section?.querySelector(':scope > .section-heading');
  if (!heading) return;

  const actions = document.createElement('div');
  actions.className = 'bundle-carousel-heading-actions';

  const existingLink = heading.querySelector(':scope > a');
  if (existingLink) actions.append(existingLink);

  const controls = document.createElement('div');
  controls.className = 'bundle-carousel-controls';
  controls.setAttribute('aria-label', `Navegar em ${label}`);

  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'bundle-carousel-control';
  previousButton.setAttribute('aria-label', `Ver itens anteriores de ${label}`);
  previousButton.innerHTML = '‹';

  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'bundle-carousel-control';
  nextButton.setAttribute('aria-label', `Ver próximos itens de ${label}`);
  nextButton.innerHTML = '›';

  const move = direction => {
    track.scrollBy({ left: direction * scrollStep(track), behavior: 'smooth' });
  };

  previousButton.addEventListener('click', () => move(-1));
  nextButton.addEventListener('click', () => move(1));
  track.addEventListener('scroll', () => updateControls(track, previousButton, nextButton), { passive: true });

  controls.append(previousButton, nextButton);
  actions.append(controls);
  heading.append(actions);

  track.id ||= `home-bundle-carousel-${index + 1}`;
  track.setAttribute('role', 'region');
  track.setAttribute('aria-label', label);
  track.setAttribute('tabindex', '0');
  previousButton.setAttribute('aria-controls', track.id);
  nextButton.setAttribute('aria-controls', track.id);

  controlsByTrack.set(track, { previousButton, nextButton });
  resizeObserver?.observe(track);
  requestAnimationFrame(() => updateControls(track, previousButton, nextButton));
}

function enhanceHomeCarousels() {
  if (!app) return;
  resizeObserver?.disconnect();
  app.querySelectorAll('.home-page .content-section .bundle-grid').forEach((track, index) => {
    const label = track.closest('.content-section')?.querySelector('h2')?.textContent?.trim() || 'itens';
    shufflePromotionalKits(track, label);

    if (enhancedTracks.has(track)) {
      resizeObserver?.observe(track);
      return;
    }
    enhancedTracks.add(track);
    track.classList.add('bundle-carousel');
    createControls(track, label, index);
  });
}

window.addEventListener('da:route-rendered', () => requestAnimationFrame(enhanceHomeCarousels));
window.addEventListener('resize', enhanceHomeCarousels, { passive: true });
requestAnimationFrame(enhanceHomeCarousels);