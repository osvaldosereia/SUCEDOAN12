const app = document.getElementById('app');
const enhancedTracks = new WeakSet();
const controlsByTrack = new WeakMap();
const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(entries => {
  entries.forEach(entry => {
    const controls = controlsByTrack.get(entry.target);
    if (controls) updateControls(entry.target, controls.previousButton, controls.nextButton);
  });
}) : null;

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
    if (enhancedTracks.has(track)) {
      resizeObserver?.observe(track);
      return;
    }
    enhancedTracks.add(track);
    track.classList.add('bundle-carousel');
    const label = track.closest('.content-section')?.querySelector('h2')?.textContent?.trim() || 'itens';
    createControls(track, label, index);
  });
}

window.addEventListener('da:route-rendered', () => requestAnimationFrame(enhanceHomeCarousels));
window.addEventListener('resize', enhanceHomeCarousels, { passive: true });
requestAnimationFrame(enhanceHomeCarousels);
