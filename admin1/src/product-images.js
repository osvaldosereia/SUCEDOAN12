const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function decodeInBrowser(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Não consegui abrir esta imagem.')); };
    image.src = objectUrl;
  });
}

function createBrowserCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encodeCanvas(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não consegui preparar a imagem.')), mime, quality);
  });
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não consegui ler a imagem preparada.'));
    reader.readAsDataURL(blob);
  });
}

export async function compressProductImage(file, options = {}) {
  const maxBytes = Number(options.maxBytes || 30_000);
  if (!file || !ALLOWED_TYPES.has(String(file.type || '').toLowerCase())) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
  if (!Number(file.size) || Number(file.size) > (options.maxInputBytes || MAX_INPUT_BYTES)) throw new Error('A imagem original deve ter até 10 MB.');
  const image = await (options.decodeImage || decodeInBrowser)(file);
  const sourceWidth = Number(image.width || image.naturalWidth);
  const sourceHeight = Number(image.height || image.naturalHeight);
  if (!sourceWidth || !sourceHeight) throw new Error('A imagem não tem dimensões válidas.');
  const maxDimension = Number(options.maxDimension || 1200);
  let scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const qualities = [0.84, 0.76, 0.68, 0.60, 0.52, 0.44, 0.36];
  let smallest = null;

  while (scale >= 0.2) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = (options.createCanvas || createBrowserCanvas)(width, height);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador não oferece compressão de imagem.');
    context.drawImage(image, 0, 0, width, height);

    for (const quality of qualities) {
      const blob = await encodeCanvas(canvas, 'image/webp', quality);
      if (!smallest || blob.size < smallest.blob.size) smallest = { blob, width, height };
      if (blob.size <= maxBytes) {
        return {
          dataUrl: await (options.readAsDataUrl || readBlobAsDataUrl)(blob),
          mimeType: blob.type || 'image/webp', size: blob.size, width, height
        };
      }
    }
    if (width <= 320 && height <= 320) break;
    scale *= 0.8;
  }
  const sizeKb = smallest ? Math.ceil(smallest.blob.size / 1024) : 0;
  throw new Error(`Não foi possível reduzir a imagem a 30 KB (menor resultado: ${sizeKb} KB). Escolha outra imagem.`);
}

