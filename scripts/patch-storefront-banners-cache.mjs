import fs from 'node:fs/promises';

const file = 'index.html';
let html = await fs.readFile(file, 'utf8');
const before = html;

html = html
  .replace(/\s*<style id="da-banners-after-four-v10">[\s\S]*?<\/style>/g, '')
  .replace(/\s*<script id="da-storefront-banners-cache-v10">[\s\S]*?<\/script>\s*(?:<!-- DA_STOREFRONT_BANNERS_CACHE_V10 -->)?/g, '')
  .replace(/\s*\$\{bannerSlotHtml\('home\.hero',[\s\S]*?\}\)\}/g, '');

await fs.writeFile(file, html, 'utf8');
console.log(html === before ? 'Nenhum banner promocional presente.' : 'Banners promocionais antigos removidos.');
