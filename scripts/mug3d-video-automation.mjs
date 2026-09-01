import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import sharp from 'sharp';

const FIREBASE_URL = String(process.env.FIREBASE_URL || 'https://cedar-chemist-310801-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const PRODUCTS_NODE = String(process.env.PRODUCTS_NODE || 'produtos').replace(/^\/+|\/+$/g, '');
const FIREBASE_AUTH = String(process.env.FIREBASE_AUTH_TOKEN || '').trim();
const REQUESTED_KEY = String(process.env.PRODUCT_KEY || '').trim();
const MUG3D_URL = String(process.env.MUG3D_URL || 'https://mug3d.com/?model=1').trim();
const OUTPUT_DIR = String(process.env.VIDEO_OUTPUT_DIR || 'site/videos/canecas').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const RESULT_FILE = String(process.env.MUG3D_RESULT_FILE || '.mug3d-result.json');
const MAX_LOOP_MS = Math.max(90000, Number(process.env.MUG3D_MAX_LOOP_MS || 190000));
const MIN_LOOP_MS = Math.max(30000, Number(process.env.MUG3D_MIN_LOOP_MS || 80000));
const SPEED = Math.max(1, Math.min(100, Number(process.env.MUG3D_SPEED || 8)));
const LOOP_RETURN_THRESHOLD = Math.max(0.015, Math.min(0.09, Number(process.env.MUG3D_LOOP_RETURN_THRESHOLD || 0.055)));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = value => String(value ?? '').trim();
const safeKey = value => text(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || `mug-${Date.now()}`;

function authQuery() {
  return FIREBASE_AUTH ? `?auth=${encodeURIComponent(FIREBASE_AUTH)}` : '';
}

async function firebase(pathname, { method = 'GET', body } = {}) {
  const url = `${FIREBASE_URL}/${pathname.replace(/^\/+/, '')}.json${authQuery()}`;
  const response = await fetch(url, {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firebase ${method} ${pathname}: HTTP ${response.status}`);
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

function horizontalArt(product = {}) {
  return text(product.arte_horizontal || product.arte_impressao?.url || product.arte_personalizacao || product.art_url || product.arte_url);
}

async function selectProduct() {
  if (REQUESTED_KEY) {
    const product = await firebase(`${PRODUCTS_NODE}/${encodeURIComponent(REQUESTED_KEY)}`);
    if (!product || typeof product !== 'object') throw new Error(`Produto ${REQUESTED_KEY} não encontrado.`);
    return { key: REQUESTED_KEY, product };
  }
  const all = await firebase(PRODUCTS_NODE);
  const candidates = Object.entries(all || {})
    .filter(([, product]) => product && typeof product === 'object' && ['pending', 'queued'].includes(text(product.video_360_status).toLowerCase()))
    .sort((a, b) => Date.parse(a[1].video_360_requested_at || 0) - Date.parse(b[1].video_360_requested_at || 0));
  if (!candidates.length) return null;
  return { key: candidates[0][0], product: candidates[0][1] };
}

async function patchProduct(key, patch) {
  return firebase(`${PRODUCTS_NODE}/${encodeURIComponent(key)}`, { method: 'PATCH', body: patch });
}

async function downloadArt(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Não foi possível baixar a arte horizontal: HTTP ${response.status}.`);
  const input = Buffer.from(await response.arrayBuffer());
  if (!input.length) throw new Error('A arte horizontal foi baixada vazia.');
  if (input.length > 20 * 1024 * 1024) throw new Error('A arte horizontal excede 20 MB.');
  await sharp(input).png({ compressionLevel: 9 }).toFile(destination);
  return { bytes: input.length };
}

async function fabricState(page) {
  return page.evaluate(() => {
    const isFabricCanvas = value => {
      try { return Boolean(value && typeof value === 'object' && typeof value.getObjects === 'function' && typeof value.renderAll === 'function' && value.lowerCanvasEl?.id === 'c'); }
      catch { return false; }
    };
    for (const key of Object.getOwnPropertyNames(window)) {
      let value;
      try { value = window[key]; } catch { continue; }
      if (!isFabricCanvas(value)) continue;
      try { return { found: true, count: value.getObjects().length, key }; } catch { continue; }
    }
    return { found: false, count: 0, key: '' };
  });
}

async function injectFabricImage(page, filePath) {
  const png = await fs.readFile(filePath);
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  return page.evaluate(async source => {
    const isFabricCanvas = value => {
      try { return Boolean(value && typeof value === 'object' && typeof value.getObjects === 'function' && typeof value.renderAll === 'function' && value.lowerCanvasEl?.id === 'c'); }
      catch { return false; }
    };
    let canvas = null;
    for (const key of Object.getOwnPropertyNames(window)) {
      let value;
      try { value = window[key]; } catch { continue; }
      if (isFabricCanvas(value)) { canvas = value; break; }
    }
    let fabricImage = null;
    try { fabricImage = window.fabric?.Image; } catch {}
    if (!canvas || !fabricImage?.fromURL) return { ok: false, reason: 'fabric_canvas_not_found' };
    const image = await new Promise((resolve, reject) => {
      fabricImage.fromURL(source, img => img ? resolve(img) : reject(new Error('fabric_image_failed')), { crossOrigin: 'anonymous' });
    });
    canvas.add(image);
    canvas.setActiveObject(image);
    canvas.renderAll();
    canvas.fire?.('object:added', { target: image });
    canvas.fire?.('object:modified', { target: image });
    return { ok: true, count: canvas.getObjects().length };
  }, dataUrl);
}

async function fitActiveArt(page) {
  return page.evaluate(() => {
    const isFabricCanvas = value => {
      try { return Boolean(value && typeof value === 'object' && typeof value.getObjects === 'function' && typeof value.renderAll === 'function' && value.lowerCanvasEl?.id === 'c'); }
      catch { return false; }
    };
    let found = null;
    for (const key of Object.getOwnPropertyNames(window)) {
      let value;
      try { value = window[key]; } catch { continue; }
      if (isFabricCanvas(value)) { found = { key, value }; break; }
    }
    if (!found) return { ok: false, reason: 'fabric_canvas_not_found' };
    const canvas = found.value;
    const objects = canvas.getObjects();
    const object = canvas.getActiveObject?.() || objects[objects.length - 1];
    if (!object || !object.width || !object.height) return { ok: false, reason: 'art_object_not_found', count: objects.length };
    const width = Number(canvas.getWidth?.() || canvas.lowerCanvasEl?.width || 600);
    const height = Number(canvas.getHeight?.() || canvas.lowerCanvasEl?.height || 270);
    const scale = Math.max(width / Number(object.width), height / Number(object.height));
    object.set({ left: width / 2, top: height / 2, originX: 'center', originY: 'center', angle: 0, scaleX: scale, scaleY: scale });
    object.setCoords?.();
    canvas.setActiveObject?.(object);
    canvas.renderAll?.();
    canvas.requestRenderAll?.();
    canvas.fire?.('object:modified', { target: object });
    return { ok: true, key: found.key, count: objects.length, width, height, scale };
  });
}

async function uploadArt(page, filePath) {
  const before = await fabricState(page);
  let uploadError = '';
  try {
    await page.locator('#controlAddImage').click({ timeout: 10000 });
    await page.locator('#file').setInputFiles(filePath);
    await page.locator('#uploadForm input[type="submit"]').click({ force: true });
    await page.waitForFunction(previous => {
      const isFabricCanvas = value => {
        try { return Boolean(value && typeof value === 'object' && typeof value.getObjects === 'function' && value.lowerCanvasEl?.id === 'c'); }
        catch { return false; }
      };
      for (const key of Object.getOwnPropertyNames(window)) {
        let value;
        try { value = window[key]; } catch { continue; }
        if (!isFabricCanvas(value)) continue;
        try { if (value.getObjects().length > previous) return true; } catch {}
      }
      return false;
    }, before.count, { timeout: 20000 });
  } catch (error) {
    uploadError = error?.message || String(error);
    const injected = await injectFabricImage(page, filePath);
    if (!injected.ok) throw new Error(`Upload pela interface falhou (${uploadError}) e o fallback Fabric falhou (${injected.reason}).`);
  }
  const fitted = await fitActiveArt(page);
  if (!fitted.ok) throw new Error(`A arte entrou no editor, mas não foi possível ajustá-la automaticamente (${fitted.reason}).`);
  return { ...fitted, uploadFallback: Boolean(uploadError), uploadError };
}

async function setAnimation(page, enabled) {
  await page.evaluate(value => {
    const input = document.querySelector('#run_animate');
    if (input && input.checked !== value) input.click();
  }, enabled);
}

async function forceMugWhite(page) {
  await page.waitForFunction(() => {
    const ids = ['colorfor_ring', 'colorfor_inner', 'colorfor_handle', 'colorfor_print', 'colorfor_base'];
    return ids.every(id => document.getElementById(id)) && typeof window.jscolor !== 'undefined';
  }, { timeout: 15000 }).catch(() => {});

  const result = await page.evaluate(() => {
    const white = '#FFFFFF';
    const parts = [
      { part: 'ring', pickerId: 'colorfor_ring', inputId: 'controlObjectColor_ring', globalName: 'rim_color' },
      { part: 'inner', pickerId: 'colorfor_inner', inputId: 'controlObjectColor_inner', globalName: 'inner_color' },
      { part: 'handle', pickerId: 'colorfor_handle', inputId: 'controlObjectColor_handle', globalName: 'handle_color' },
      { part: 'print', pickerId: 'colorfor_print', inputId: 'controlObjectColor_print', globalName: 'print_color' },
      { part: 'base', pickerId: 'colorfor_base', inputId: 'controlObjectColor_base', globalName: 'base_color' },
    ];
    const changed = [];
    for (const item of parts) {
      const picker = document.getElementById(item.pickerId);
      const input = document.getElementById(item.inputId);
      const before = {
        input: input?.value || '',
        data: picker?.getAttribute('data-current-color') || '',
        picker: (() => { try { return picker?.jscolor?.toHEXString?.() || ''; } catch { return ''; } })(),
      };
      let apiApplied = false;
      if (picker?.jscolor?.fromString) {
        try {
          apiApplied = picker.jscolor.fromString(white) !== false;
          picker.jscolor.trigger?.('input change');
        } catch {}
      }
      if (input) {
        input.value = 'FFFFFF';
        input.setAttribute('value', 'FFFFFF');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));
      }
      if (picker) {
        picker.setAttribute('data-current-color', white);
        picker.style.backgroundColor = 'rgb(255, 255, 255)';
      }
      try { window[item.globalName] = 'FFFFFF'; } catch {}
      try {
        if (window.jQuery && input) {
          window.jQuery(input).trigger('input').trigger('change').trigger('keyup');
        }
      } catch {}
      const after = {
        input: input?.value || '',
        data: picker?.getAttribute('data-current-color') || '',
        picker: (() => { try { return picker?.jscolor?.toHEXString?.() || ''; } catch { return ''; } })(),
      };
      changed.push({ ...item, apiApplied, before, after });
    }
    try { window.jscolor?.trigger?.('input change'); } catch {}
    return { changed, jscolorReady: typeof window.jscolor !== 'undefined' };
  });

  await sleep(1200);
  return result;
}

async function configureScene(page) {
  await setAnimation(page, false);
  const colors = await forceMugWhite(page);
  const animation = await page.evaluate(speed => {
    const range = document.querySelector('#speed');
    let speedMeta = null;
    if (range) {
      range.value = String(speed);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
      speedMeta = { requested: speed, actual: range.value, min: range.min || '', max: range.max || '', step: range.step || '' };
    }
    const reverse = document.querySelector('#reverse_animate');
    if (reverse?.checked) reverse.click();
    const grid = document.querySelector('#show_grid');
    if (grid?.checked) grid.click();
    return { speed: speedMeta, reverse: Boolean(reverse?.checked), grid: Boolean(grid?.checked) };
  }, SPEED);
  let angleApplied = false;
  try {
    await page.locator('#controlShowAngle').click({ timeout: 5000 });
    await page.locator('#controlCustomAngle_text').fill('90');
    await page.locator('#controlSetCustomAngle').click();
    angleApplied = true;
  } catch {}
  await sleep(1200);
  return { colors, animation, angleApplied, startAngle: 90 };
}

async function signature(buffer) {
  const { data } = await sharp(buffer).resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

function frameDiff(a, b) {
  const length = Math.min(a.length, b.length);
  if (!length) return 1;
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / (length * 255);
}

async function waitForOneLoop(page, preview, baseline) {
  const start = Date.now();
  let diverged = false;
  let maxDiff = 0;
  let bestDiff = 1;
  let bestAt = 0;
  const samples = [];
  while (Date.now() - start < MAX_LOOP_MS) {
    await sleep(450);
    const current = await signature(await preview.screenshot());
    const diff = frameDiff(baseline, current);
    const elapsed = Date.now() - start;
    maxDiff = Math.max(maxDiff, diff);
    if (diff > 0.075) diverged = true;
    if (elapsed > MIN_LOOP_MS && diff < bestDiff) { bestDiff = diff; bestAt = elapsed; }
    if (samples.length < 24 && elapsed % 5000 < 700) samples.push({ elapsedMs: elapsed, diff });
    if (diverged && elapsed > MIN_LOOP_MS && diff < LOOP_RETURN_THRESHOLD) {
      return { detected: true, elapsedMs: elapsed, diff, maxDiff, bestDiff: Math.min(bestDiff, diff), bestAt: elapsed, threshold: LOOP_RETURN_THRESHOLD, samples };
    }
  }
  return { detected: false, elapsedMs: Date.now() - start, diff: bestDiff, maxDiff, bestDiff, bestAt, threshold: LOOP_RETURN_THRESHOLD, samples };
}

async function recordVideo(page, outputPath) {
  const preview = page.locator('#preview3d canvas').first();
  await preview.waitFor({ state: 'visible', timeout: 30000 });
  const scene = await configureScene(page);
  const baseline = await signature(await preview.screenshot());
  const startButton = page.locator('#controlStartVideo');
  await startButton.waitFor({ state: 'visible', timeout: 15000 });
  await startButton.click();
  await sleep(500);
  await setAnimation(page, true);
  const loop = await waitForOneLoop(page, preview, baseline);
  await setAnimation(page, false);
  await sleep(300);
  const stopButton = page.locator('#controlStopVideo');
  await stopButton.waitFor({ state: 'visible', timeout: 10000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await stopButton.click();
  const download = await downloadPromise;
  await download.saveAs(outputPath);
  const stat = await fs.stat(outputPath);
  if (stat.size < 10_000) throw new Error(`O WEBM exportado ficou pequeno demais (${stat.size} bytes).`);
  if (!loop.detected) throw new Error(`O vídeo foi exportado, mas o detector não confirmou o retorno visual após 360° em ${Math.round(loop.elapsedMs / 1000)} s de render.`);
  return { ...loop, bytes: stat.size, suggestedFilename: download.suggestedFilename(), scene };
}

async function main() {
  await fs.writeFile(RESULT_FILE, JSON.stringify({ status: 'idle', created_at: new Date().toISOString() }, null, 2));
  const selected = await selectProduct();
  if (!selected) { console.log('Nenhuma caneca pendente de vídeo 360°.'); return; }
  const { key, product } = selected;
  const artUrl = horizontalArt(product);
  if (!/^https?:\/\//i.test(artUrl)) {
    await patchProduct(key, { video_360_status: 'error', video_360_error: 'Produto sem arte_horizontal pública.', video_360_finished_at: new Date().toISOString() }).catch(() => {});
    throw new Error(`Produto ${key} não possui arte_horizontal pública.`);
  }
  await patchProduct(key, { video_360_status: 'processing', video_360_started_at: new Date().toISOString(), video_360_error: null, video_360_engine: 'mug3d-playwright-github-actions-v4-white-jscolor-10s' });
  const workDir = path.resolve('.tmp-mug3d');
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(path.resolve(OUTPUT_DIR), { recursive: true });
  const artPath = path.join(workDir, `${safeKey(key)}.png`);
  const videoRel = `${OUTPUT_DIR}/${safeKey(key)}-360.webm`;
  const videoPath = path.resolve(videoRel);
  let browser;
  try {
    await downloadArt(artUrl, artPath);
    browser = await chromium.launch({
      headless: false,
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'],
    });
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 }, locale: 'en-US' });
    const page = await context.newPage();
    page.on('console', message => console.log(`[mug3d:${message.type()}] ${message.text()}`));
    page.on('pageerror', error => console.warn(`[mug3d:pageerror] ${error.message}`));
    await page.goto(MUG3D_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('#preview3d canvas').first().waitFor({ state: 'visible', timeout: 60000 });
    await page.locator('#editor_area canvas').first().waitFor({ state: 'visible', timeout: 60000 });
    await sleep(1800);
    const placement = await uploadArt(page, artPath);
    await sleep(1200);
    const recording = await recordVideo(page, videoPath);
    await context.close();
    await browser.close();
    browser = null;
    const result = { status: 'generated', product_key: key, product_name: text(product.nome), art_url: artUrl, video_path: videoRel, generated_at: new Date().toISOString(), placement, recording };
    await fs.writeFile(RESULT_FILE, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    const message = error?.stack || error?.message || String(error);
    await patchProduct(key, { video_360_status: 'error', video_360_error: message.slice(0, 1800), video_360_finished_at: new Date().toISOString() }).catch(() => {});
    await fs.writeFile(RESULT_FILE, JSON.stringify({ status: 'error', product_key: key, error: message, failed_at: new Date().toISOString() }, null, 2));
    throw error;
  }
}

await main();