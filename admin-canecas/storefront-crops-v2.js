// Compatibilidade: os recortes da vitrine agora são processados exclusivamente por GitHub Actions + Sharp.
// Este arquivo permanece para módulos antigos que ainda importam storefront-crops-v2.js.
export { BUILD, ensureCrops, cropUrlsOf, cropSetReady } from './storefront-crops-github-v1.js?v=20260830-1';

export async function generateCrops() {
  throw new Error('Os recortes agora são gerados pelo GitHub Actions. Não há mais geração Base64 no navegador/Make.');
}
