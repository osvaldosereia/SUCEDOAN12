import fs from 'node:fs/promises';

const FILE = 'index.html';
const VERSION = '2026-07-17-home-cards-proporcionais-v9';
let html = await fs.readFile(FILE, 'utf8');

const css = `
<style id="da-home-month-cards-v9">
@media (max-width: 767px) {
  .da-home-journey-grid {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
  .da-home-journey-grid > * {
    min-height: 132px !important;
    padding: 18px 20px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 118px !important;
    align-items: center !important;
    column-gap: 18px !important;
    border-radius: 22px !important;
    box-sizing: border-box !important;
  }
  .da-home-journey-grid > * > div:first-child,
  .da-home-journey-grid .da-home-journey-copy {
    min-width: 0 !important;
    align-self: center !important;
  }
  .da-home-journey-grid h3,
  .da-home-journey-grid strong,
  .da-home-journey-grid .da-home-journey-title {
    font-size: clamp(21px, 5.4vw, 25px) !important;
    line-height: 1.12 !important;
    font-weight: 850 !important;
    letter-spacing: -0.02em !important;
    margin: 0 0 8px !important;
  }
  .da-home-journey-grid p,
  .da-home-journey-grid span,
  .da-home-journey-grid .da-home-journey-count {
    font-size: clamp(16px, 4.1vw, 18px) !important;
    line-height: 1.25 !important;
    font-weight: 750 !important;
  }
  .da-home-journey-grid img {
    width: 112px !important;
    height: 112px !important;
    max-width: 112px !important;
    max-height: 112px !important;
    object-fit: cover !important;
    border-radius: 16px !important;
    justify-self: end !important;
  }
}
@media (max-width: 390px) {
  .da-home-journey-grid > * {
    grid-template-columns: minmax(0, 1fr) 100px !important;
    min-height: 120px !important;
    padding: 16px 17px !important;
    column-gap: 14px !important;
  }
  .da-home-journey-grid img {
    width: 96px !important;
    height: 96px !important;
    max-width: 96px !important;
    max-height: 96px !important;
  }
}
</style>`;

html = html.replace(/<style id="da-home-month-cards-v9">[\s\S]*?<\/style>/, '');
html = html.replace('</head>', `${css}\n</head>`);
html = html.replace(/<meta name="da-build-version" content="[^"]+">/, `<meta name="da-build-version" content="${VERSION}">`);
html = html.replace(/const BUILD = '[^']+';/, `const BUILD = '${VERSION}';`);
html = html.replace(/window\.__DA_BUILD_VERSION__\s*=\s*BUILD;/, 'window.__DA_BUILD_VERSION__ = BUILD;');
html = html.replace(/2026-07-17-home-rapida-oficial-v8/g, VERSION);

if (!html.includes('da-home-month-cards-v9')) throw new Error('CSS proporcional não foi inserido.');
if (!html.includes('grid-template-columns: 1fr !important')) throw new Error('Uma coluna mobile não foi preservada.');

await fs.writeFile(FILE, html, 'utf8');
console.log('Cards da compra do mês ajustados com proporção mobile equilibrada.');
