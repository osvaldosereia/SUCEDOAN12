import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const source = fs.readFileSync('vitrine/index.html', 'utf8');
const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
assert.ok(css, 'expected storefront CSS');

const cards = Array.from({ length: 18 }, (_, i) =>
  '<article class="basket-extra-product"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="><strong>Produto extra ' + (i + 1) + '</strong><small>500 ml</small><b>R$ 5,99</b><button class="basket-extra-add">Adicionar</button></article>'
).join('');
const theme = (name) =>
  '<article class="basket-extra-theme"><div class="basket-extra-theme-head"><strong>' + name + '<small>18 produtos disponíveis</small></strong><button class="basket-extra-theme-toggle">Ocultar produtos</button></div><div class="basket-extra-products">' + cards + '</div></article>';
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + css +
  '.sheet{position:fixed;inset:auto 0 0;width:100%;height:88dvh;max-height:760px;overflow:hidden;background:#fff}.sheet-inner{height:100%;max-height:none!important}.sheet-head,.sheet-action{flex:0 0 auto}.basket-edit-list{height:180px;flex:0 0 auto;border-bottom:1px solid #ddd}.basket-extra-theme-head{min-height:40px}</style></head><body>' +
  '<section class="sheet"><div class="sheet-inner"><header class="sheet-head"><strong>Grande</strong></header><main class="sheet-scroll"><section class="basket-edit-list">Itens da cesta</section><section class="basket-extras"><h3>Você também pode adicionar</h3><p>Extras opcionais</p>' +
  theme('Limpador') + theme('Desinfetante') + '</section></main><footer class="sheet-action">Adicionar cesta</footer></div></section></body></html>';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(html);
  for (const width of [320, 390, 1363]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet');
      const scroll = document.querySelector('.sheet-scroll');
      const extras = document.querySelector('.basket-extras');
      const themes = [...document.querySelectorAll('.basket-extra-theme')];
      const tracks = [...document.querySelectorAll('.basket-extra-products')];
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        sheet: [sheet.clientWidth, sheet.scrollWidth],
        scroll: [scroll.clientWidth, scroll.scrollWidth],
        extras: [extras.clientWidth, extras.scrollWidth],
        themes: themes.map(x => [x.clientWidth, x.scrollWidth]),
        tracks: tracks.map(x => [x.clientWidth, x.scrollWidth])
      };
    });
    assert.ok(layout.document <= width + 1, 'page must not gain horizontal overflow at ' + width + 'px: ' + JSON.stringify(layout));
    assert.ok(layout.sheet[1] <= layout.sheet[0] + 1, 'sheet must not gain horizontal overflow: ' + JSON.stringify(layout));
    assert.ok(layout.scroll[1] <= layout.scroll[0] + 1, 'modal content must not scroll sideways: ' + JSON.stringify(layout));
    assert.ok(layout.extras[1] <= layout.extras[0] + 1, 'extras section must stay inside modal: ' + JSON.stringify(layout));
    assert.ok(layout.themes.every(([client, scrollWidth]) => scrollWidth <= client + 1), 'theme cards must stay inside extras section: ' + JSON.stringify(layout));
    assert.ok(layout.tracks.every(([client, scrollWidth]) => scrollWidth > client), 'each individual product row must have its own horizontal scroll: ' + JSON.stringify(layout));
  }
  const before = await page.evaluate(() => ({
    first: document.querySelectorAll('.basket-extra-products')[0].scrollLeft,
    second: document.querySelectorAll('.basket-extra-products')[1].scrollLeft,
    modal: document.querySelector('.sheet-scroll').scrollLeft
  }));
  await page.evaluate(() => {
    const first = document.querySelectorAll('.basket-extra-products')[0];
    first.scrollLeft = first.scrollWidth;
  });
  const after = await page.evaluate(() => ({
    first: document.querySelectorAll('.basket-extra-products')[0].scrollLeft,
    second: document.querySelectorAll('.basket-extra-products')[1].scrollLeft,
    modal: document.querySelector('.sheet-scroll').scrollLeft
  }));
  assert.ok(after.first > before.first + 100, 'first category must scroll');
  assert.equal(after.second, before.second, 'scrolling one category must not move the next category');
  assert.equal(after.modal, before.modal, 'scrolling a category must not move the modal content');
  console.log('PASS: extra product carousels scroll independently at 320px, 390px and 1363px; page, modal and theme cards stay constrained');
} finally {
  await browser.close();
}
