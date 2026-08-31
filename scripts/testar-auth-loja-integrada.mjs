const BASE = (process.env.LOJA_INTEGRADA_BASE_URL || 'https://api.awsli.com.br/v1').replace(/\/$/, '');
const AUTH = String(process.env.LOJA_INTEGRADA_AUTHORIZATION || '').trim();
if (!AUTH) throw new Error('LOJA_INTEGRADA_AUTHORIZATION ausente.');
const response = await fetch(`${BASE}/categoria?limit=1`, {
  method: 'GET',
  headers: {
    Authorization: AUTH,
    Accept: 'application/json',
    'User-Agent': 'CanecaFacil-GitHub-Auth-Test/1.0'
  }
});
const raw = await response.text();
let data = null;
try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw: raw.slice(0, 500) }; }
const message = data?.error_message || data?.detail || data?.message || data?.error || '';
console.log(`HTTP_STATUS=${response.status}`);
if (message) console.log(`MESSAGE=${String(message).slice(0, 500)}`);
if (!response.ok) process.exitCode = 10;
else console.log('AUTENTICACAO_OK=1');
