const BASE_URL = String(process.env.ADMIN_BASE_URL || 'https://donaantonia.com.br').replace(/\/+$/, '');
const ATTEMPTS = Math.max(1, Number(process.env.CHECK_ATTEMPTS || 4));
const RETRY_DELAY_MS = Math.max(1000, Number(process.env.CHECK_RETRY_DELAY_MS || 4000));
const TIMEOUT_MS = Math.max(3000, Number(process.env.CHECK_TIMEOUT_MS || 15000));

const failures = [];
const checks = [];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchText(pathname) {
  const url = `${BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const separator = url.includes('?') ? '&' : '?';
      const response = await fetch(`${url}${separator}_mug_health=${Date.now()}-${attempt}`, {
        cache: 'no-store',
        redirect: 'follow',
        headers: { Accept: 'text/html,text/javascript,text/plain,*/*' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${url}: ${lastError?.message || lastError || 'falha desconhecida'}`);
}

function validate(name, source, { required = [], forbidden = [] } = {}) {
  const missing = required.filter(marker => !source.includes(marker));
  const presentForbidden = forbidden.filter(marker => source.includes(marker));
  const ok = missing.length === 0 && presentForbidden.length === 0;
  const detail = ok
    ? 'OK'
    : `${missing.length ? `ausente: ${missing.join(' | ')}` : ''}${missing.length && presentForbidden.length ? ' · ' : ''}${presentForbidden.length ? `proibido: ${presentForbidden.join(' | ')}` : ''}`;
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}: ${detail}`);
}

async function check(pathname, name, rules) {
  try {
    const source = await fetchText(pathname);
    validate(name, source, rules);
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
    failures.push(`${name}: ${error.message}`);
  }
}

await check('/producao/', 'Entrada pública do Produção', {
  required: [
    'var build = String(Date.now());',
    "destination.searchParams.set('admin_build', build)",
    "destination.searchParams.set('save_build', build)",
  ],
  forbidden: ["destination.searchParams.set('admin_build', '2026"],
});

await check('/producao-v2/js/navigation-v12.js', 'Navegação publicada do Criador', {
  required: [
    'meta[name="admin-save-build"]',
    'function withBuild(path)',
    "import(withBuild('./mug-make-native-openai-bridge.js'))",
  ],
  forbidden: ['mug-make-native-openai-bridge.js?admin_build='],
});

await check('/producao-v2/js/mug-make-native-openai-bridge.js', 'Bridge publicado do Criador', {
  required: [
    'meta[name="admin-save-build"]',
    'const MODULES = [',
    "'./mug-command-layout-v4-force.js'",
    "'./mug-config-compact-v4-1.js'",
    "'./mug-preset-phrases-v1.js'",
    'for (const path of MODULES) await import(withBuild(path));',
  ],
  forbidden: ["import './mug-"],
});

await check('/producao-v2/js/mug-command-layout-v4-force.js', 'Layout publicado do Criador', {
  required: [
    'grid-template-columns:minmax(190px,1fr) minmax(0,4fr)',
    'repeat(3,minmax(0,1fr))',
    '.mugv7-info{display:none!important}',
  ],
});

await check('/producao-v2/js/mug-config-compact-v4-1.js', 'Configuração Make publicada', {
  required: [
    '<summary>Configuração</summary>',
    'id="mugv7Webhook"',
    'localStorage.setItem(WEBHOOK_KEY',
  ],
});

await check('/producao-v2/js/mug-preset-phrases-v1.js', '200 frases prontas publicadas', {
  required: [
    '200 frases prontas',
    'id="mugPresetPhraseSearch"',
    'id="mugPresetPhraseCategory"',
    'id="mugPresetPhraseSelect"',
    'field.value = phrase;',
    '"Deus ainda escreve milagres."',
    '"Com Deus, sempre."',
  ],
});

for (const row of checks) console.log(`${row.ok ? 'OK' : 'FALHA'} · ${row.name}: ${row.detail}`);

if (failures.length) {
  console.error(`Criador de Canecas em produção: ${failures.length} falha(s).`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Criador de Canecas em produção validado no domínio ${BASE_URL}, incluindo as 200 frases prontas.`);
}
