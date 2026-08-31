const BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const COMBINED = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
const APP = String(process.env.LI_APP_TOKEN || '').trim();
if (!COMBINED && !APP) throw new Error('Credenciais de diagnóstico ausentes.');

const attempts = [
  ['chave_api+aplicacao', COMBINED],
  ['personal-token-direto', APP],
  ['bearer-personal-token', APP ? `Bearer ${APP}` : ''],
].filter(([, value]) => value);

let ok = false;
for (const [name, authorization] of attempts) {
  const response = await fetch(`${BASE}/categoria?limit=1`, {
    method: 'GET',
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      'User-Agent': 'CanecaFacil-GitHub-Auth-Test/1.1'
    }
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw: raw.slice(0, 500) }; }
  const message = data?.error_message || data?.detail || data?.message || data?.error || '';
  console.log(`TESTE=${name} HTTP_STATUS=${response.status}`);
  if (message) console.log(`MESSAGE=${String(message).slice(0, 300)}`);
  if (response.ok) { ok = true; console.log(`AUTENTICACAO_OK=${name}`); break; }
}
if (!ok) process.exitCode = 10;
