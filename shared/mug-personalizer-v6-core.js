export const MUG_V6 = Object.freeze({
  version: 'v6',
  width: 2300,
  height: 1000,
  leftRatio: 0.5,
});

export const IMAGE_TYPES = Object.freeze({
  people: {
    label: 'Pessoa ou pessoas', icon: '👤',
    treatments: [
      ['original', 'Foto original', 'Mantém a foto fiel e apenas encaixa na arte.'],
      ['artistic', 'Desenho artístico', 'Transforma em ilustração elegante preservando identidade.'],
      ['caricature', 'Caricatura engraçada', 'Cria uma caricatura reconhecível e divertida.'],
      ['premium', 'Retrato premium', 'Retrato sofisticado, fiel e com acabamento profissional.'],
    ],
    decorations: [['none','Sem decoração'],['floral','Floral'],['hearts','Corações'],['leaves','Folhagens'],['sparkles','Brilhos']],
  },
  pet: {
    label: 'Pet', icon: '🐾',
    treatments: [
      ['original', 'Foto original', 'Mantém exatamente o pet e suas características.'],
      ['artistic', 'Retrato artístico', 'Ilustração bonita preservando pelagem, manchas e olhos.'],
      ['caricature', 'Caricatura divertida', 'Mais expressão sem perder a identidade do pet.'],
      ['majestic', 'Retrato majestoso', 'Visual elegante, marcante e sofisticado.'],
    ],
    decorations: [['none','Sem decoração'],['paws','Patinhas'],['hearts','Corações'],['playful','Divertida'],['delicate','Delicada']],
  },
  character: {
    label: 'Desenho ou personagem', icon: '🎨',
    treatments: [
      ['original', 'Usar o original', 'Preserva exatamente o desenho enviado.'],
      ['enhance', 'Melhorar acabamento', 'Melhora nitidez e acabamento sem mudar o personagem.'],
      ['comic', 'Estilo HQ / Comic', 'Reinterpretação com acabamento de quadrinhos.'],
      ['watercolor', 'Aquarela artística', 'Reinterpretação em aquarela preservando os elementos principais.'],
    ],
    decorations: [['none','Sem decoração'],['comic','Comic'],['geometric','Geométrica'],['stars','Estrelas'],['energy','Energia']],
  },
  logo: {
    label: 'Logomarca', icon: '🏷️',
    treatments: [
      ['original', 'Logo original', 'Usa exatamente o arquivo enviado.'],
      ['clean', 'Logo clean', 'Logo intacto com composição limpa ao redor.'],
      ['modern', 'Composição moderna', 'Logo intacto com formas modernas ao redor.'],
      ['premium', 'Composição elegante', 'Logo intacto com acabamento premium ao redor.'],
    ],
    decorations: [['none','Sem decoração'],['geometric','Geométrica'],['corporate','Corporativa'],['premium','Premium'],['minimal','Minimalista']],
  },
  other: {
    label: 'Objeto ou outro', icon: '📷',
    treatments: [
      ['original', 'Foto original', 'Mantém a imagem enviada.'],
      ['artistic', 'Ilustração artística', 'Transforma em uma ilustração mantendo o objeto reconhecível.'],
      ['stylized', 'Desenho estilizado', 'Simplifica formas e cria linguagem gráfica.'],
      ['cartoon', 'Cartoon divertido', 'Transformação leve e expressiva.'],
    ],
    decorations: [['none','Sem decoração'],['minimal','Minimalista'],['modern','Moderna'],['vintage','Vintage'],['elegant','Elegante']],
  },
});

export const PHRASE_STYLES = Object.freeze([
  ['elegant','Elegante'], ['modern','Moderna'], ['romantic','Romântica'],
  ['fun','Divertida'], ['delicate','Delicada'], ['impact','Impactante'],
]);

export const ART_DIRECTIONS = Object.freeze([
  ['clean','Clean'], ['delicate','Delicada'], ['fun','Divertida'],
  ['romantic','Romântica'], ['elegant','Elegante'], ['vibrant','Vibrante'], ['thematic','Temática'],
]);

export const COLOR_PRESETS = Object.freeze([
  ['auto','Automática'], ['blue','Azul'], ['pink','Rosa'], ['red','Vermelho'],
  ['green','Verde'], ['purple','Roxo'], ['gold','Dourado'], ['black','Preto'],
]);

const COLORS = {
  blue: '#2563eb', pink: '#db2777', red: '#dc2626', green: '#16803c',
  purple: '#7c3aed', gold: '#a66b12', black: '#171717',
};

function directionPalette(direction) {
  const map = {
    clean: ['#ffffff', '#f3f4f6', '#202020'],
    delicate: ['#fff8fa', '#f5dce4', '#9b5268'],
    fun: ['#fff9df', '#f7cf55', '#d45c2f'],
    romantic: ['#fff5f7', '#f5c3cf', '#b83f60'],
    elegant: ['#fbf7ef', '#dbc79e', '#2c2924'],
    vibrant: ['#fff7ed', '#f59e0b', '#b91c1c'],
    thematic: ['#ffffff', '#e8edf3', '#243447'],
  };
  return map[direction] || map.clean;
}

function colorFor(data) {
  if (data.color && data.color !== 'auto' && COLORS[data.color]) return COLORS[data.color];
  return directionPalette(data.art_direction)[2];
}

export function treatmentNeedsAi(type, treatment) {
  if (type === 'logo') return false;
  return treatment !== 'original';
}

export function buildSubjectPrompt(data) {
  const type = data.image_type;
  const treatment = data.image_treatment;
  const common = `Use a imagem enviada como referência principal. Preserve os elementos que identificam o assunto e não invente pessoas, animais, textos, marcas ou acessórios que não existam. Gere uma composição limpa, quadrada, com o assunto bem visível, fundo simples e claro, apropriada para ser colocada no lado direito de uma arte de caneca. Não inclua palavras, molduras de caneca, mockup ou objeto caneca. Observação do usuário: ${data.notes || 'nenhuma'}.`;
  const prompts = {
    people: {
      artistic: 'Transforme a pessoa ou as pessoas em um desenho manual artístico sofisticado. Preserve identidade facial, quantidade de pessoas, cabelo, roupas, tons de pele e características reconhecíveis.',
      caricature: 'Crie uma caricatura engraçada e simpática, com exagero controlado, mantendo todas as pessoas facilmente reconhecíveis e preservando roupas e características importantes.',
      premium: 'Crie um retrato premium, sofisticado e muito fiel, com tratamento artístico sutil, iluminação agradável e acabamento de retrato profissional sem mudar a identidade.',
    },
    pet: {
      artistic: 'Transforme o pet em um retrato artístico. Preserve rigorosamente cor da pelagem, manchas, olhos, focinho, orelhas, coleira e demais características únicas.',
      caricature: 'Crie uma caricatura divertida do pet, expressiva mas reconhecível. Preserve raça, cores, manchas, olhos e acessórios.',
      majestic: 'Crie um retrato majestoso e elegante do pet, com presença forte e acabamento sofisticado, mantendo suas características físicas exatas.',
    },
    character: {
      enhance: 'Melhore nitidez, acabamento, contornos e apresentação do desenho/personagem sem alterar o design, texto, cores essenciais ou proporções.',
      comic: 'Reinterprete o desenho em acabamento HQ/comic, mantendo personagem, cores, roupa, símbolos e identidade visual reconhecíveis.',
      watercolor: 'Reinterprete o desenho em aquarela artística, mantendo personagem, formas, cores e identidade visual reconhecíveis.',
    },
    other: {
      artistic: 'Transforme o objeto/cena em uma ilustração artística elegante, mantendo forma, cor e características que permitem reconhecê-lo.',
      stylized: 'Crie uma versão gráfica estilizada e limpa, mantendo os principais detalhes, cores e identidade do objeto/cena.',
      cartoon: 'Crie uma versão cartoon divertida, mantendo o objeto/cena facilmente reconhecível e preservando detalhes importantes.',
    },
  };
  return `${prompts[type]?.[treatment] || 'Preserve a imagem com alta fidelidade.'}\n\n${common}`;
}

export function buildMockupPrompt(data, side) {
  const view = side === 1
    ? 'Mostre O LADO ESQUERDO da estampa, onde está a FRASE. A frase deve ficar inteira e legível. O lado da imagem não deve dominar esta vista.'
    : 'Gire a MESMA caneca para mostrar O LADO DIREITO da estampa, onde está a IMAGEM enviada/tratada. A imagem deve ser o foco desta vista; a frase não deve dominar.';
  return `Use a arte horizontal fornecida como ARTE-MESTRE IMUTÁVEL e aplique-a em uma caneca branca de cerâmica 325 ml. ${view}\nNão redesenhe a arte, não reescreva a frase, não altere a foto, logomarca, personagem, cores ou elementos. Apenas aplique a arte na curvatura da caneca com perspectiva física real. Crie uma fotografia quadrada 1:1 ultra realista, parecendo tirada por um smartphone premium: cerâmica esmaltada real, reflexos sutis, textura física, sombras de contato, iluminação natural suave, alta nitidez e profundidade de campo discreta. Fundo claro simples, sem mãos, caixas, café, flores ou objetos extras. Tema visual: ${data.art_direction}.`;
}

export function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

export function loadCanvasImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    image.src = source;
  });
}

export async function normalizeUpload(file, size = 1200) {
  const image = await loadCanvasImage(await dataUrlFromFile(file));
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  const pad = size * 0.05;
  const scale = Math.min((size - pad * 2) / image.naturalWidth, (size - pad * 2) / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/webp', 0.94);
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

function drawHeart(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(0, 0.25); ctx.bezierCurveTo(-0.55, -0.15, -0.45, -0.72, 0, -0.42);
  ctx.bezierCurveTo(0.45, -0.72, 0.55, -0.15, 0, 0.25); ctx.fill(); ctx.restore();
}

function drawStar(ctx, x, y, r, color) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.42 : r;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function drawPaw(ctx, x, y, s, color) {
  ctx.save(); ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y + s * .25, s * .45, s * .35, 0, 0, Math.PI * 2); ctx.fill();
  [[-.42,-.25],[-.15,-.48],[.18,-.48],[.45,-.22]].forEach(([dx,dy]) => {
    ctx.beginPath(); ctx.ellipse(x + s*dx, y + s*dy, s*.16, s*.21, 0, 0, Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

function drawDecor(ctx, data, leftW, h) {
  const accent = colorFor(data);
  const decor = data.decoration || 'none';
  ctx.save(); ctx.globalAlpha = .22;
  if (decor === 'hearts' || decor === 'romantic') {
    [[150,180,55],[leftW-180,170,42],[170,h-150,34],[leftW-130,h-150,58]].forEach(v => drawHeart(ctx,...v,accent));
  } else if (decor === 'paws') {
    [[160,180,55],[leftW-180,180,42],[170,h-150,38],[leftW-150,h-150,50]].forEach(v => drawPaw(ctx,...v,accent));
  } else if (['stars','sparkles','energy','playful'].includes(decor)) {
    [[150,160,40],[leftW-150,190,28],[180,h-150,22],[leftW-160,h-150,38]].forEach(v => drawStar(ctx,...v,accent));
  } else if (['geometric','corporate','modern','comic'].includes(decor)) {
    ctx.strokeStyle = accent; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(90,120); ctx.lineTo(leftW-150,120); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(150,h-120); ctx.lineTo(leftW-90,h-120); ctx.stroke();
  } else if (['floral','leaves','delicate','elegant','premium','vintage','minimal'].includes(decor)) {
    ctx.strokeStyle = accent; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(160,160,85,0,Math.PI*1.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(leftW-160,h-160,85,Math.PI,Math.PI*2.4); ctx.stroke();
    for (const [x,y,rx,ry] of [[220,120,35,18],[110,230,38,19],[leftW-220,h-120,35,18],[leftW-110,h-230,38,19]]) {
      ctx.beginPath(); ctx.ellipse(x,y,rx,ry,.5,0,Math.PI*2); ctx.fillStyle = accent; ctx.fill();
    }
  }
  ctx.restore();
}

function fontSpec(style, size) {
  const map = {
    elegant: `italic 700 ${size}px Georgia, serif`, modern: `700 ${size}px Arial, sans-serif`,
    romantic: `italic 700 ${size}px Georgia, serif`, fun: `800 ${size}px Trebuchet MS, sans-serif`,
    delicate: `500 ${size}px Georgia, serif`, impact: `900 ${size}px Impact, Arial Black, sans-serif`,
  };
  return map[style] || map.modern;
}

function wrapText(ctx, value, maxWidth, maxLines = 6) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = word; if (lines.length === maxLines - 1) break; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function fitPhrase(ctx, phrase, style, maxWidth, maxHeight) {
  for (let size = 118; size >= 48; size -= 4) {
    ctx.font = fontSpec(style, size);
    const lines = wrapText(ctx, phrase, maxWidth, 6);
    const lineHeight = size * 1.12;
    if (lines.length * lineHeight <= maxHeight && lines.every(line => ctx.measureText(line).width <= maxWidth)) return { size, lines, lineHeight };
  }
  ctx.font = fontSpec(style, 48);
  return { size: 48, lines: wrapText(ctx, phrase, maxWidth, 6), lineHeight: 54 };
}

export async function composeMasterArt(data, subjectDataUrl) {
  const { width, height } = MUG_V6;
  const leftW = Math.round(width * MUG_V6.leftRatio);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const palette = directionPalette(data.art_direction);
  const accent = colorFor(data);

  const bg = ctx.createLinearGradient(0, 0, width, 0);
  bg.addColorStop(0, palette[0]); bg.addColorStop(.48, palette[1]); bg.addColorStop(.52, '#ffffff'); bg.addColorStop(1, '#ffffff');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  drawDecor(ctx, data, leftW, height);

  ctx.save();
  ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const fit = fitPhrase(ctx, data.phrase, data.phrase_style, leftW * .74, height * .62);
  ctx.font = fontSpec(data.phrase_style, fit.size);
  const total = fit.lines.length * fit.lineHeight;
  let y = height / 2 - total / 2 + fit.lineHeight / 2;
  for (const line of fit.lines) { ctx.fillText(line, leftW / 2, y); y += fit.lineHeight; }
  ctx.restore();

  const subject = await loadCanvasImage(subjectDataUrl);
  const rightX = leftW + 70, rightY = 70, rightW = width - leftW - 140, rightH = height - 140;
  const contain = data.image_type === 'logo' || data.image_treatment !== 'original';
  const scale = contain
    ? Math.min(rightW / subject.naturalWidth, rightH / subject.naturalHeight)
    : Math.max(rightW / subject.naturalWidth, rightH / subject.naturalHeight);
  const sw = subject.naturalWidth * scale, sh = subject.naturalHeight * scale;
  ctx.save(); roundedRect(ctx, rightX, rightY, rightW, rightH, 54); ctx.clip();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(rightX, rightY, rightW, rightH);
  ctx.drawImage(subject, rightX + (rightW - sw)/2, rightY + (rightH - sh)/2, sw, sh);
  ctx.restore();

  const bridge = ctx.createLinearGradient(leftW - 120, 0, leftW + 120, 0);
  bridge.addColorStop(0, 'rgba(255,255,255,0)'); bridge.addColorStop(.5, 'rgba(255,255,255,.72)'); bridge.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bridge; ctx.fillRect(leftW - 120, 0, 240, height);
  return canvas.toDataURL('image/webp', 0.95);
}
