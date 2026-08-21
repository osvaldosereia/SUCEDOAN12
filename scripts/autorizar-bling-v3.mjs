import { writeFileSync } from 'node:fs';

const API_BASE = 'https://api.bling.com.br/Api/v3';
const text = value => String(value ?? '').trim();
const required = name => {
  const value = text(process.env[name]);
  if (!value) throw new Error(`O segredo ${name} não foi configurado.`);
  return value;
};

const clientId = required('BLING_NEW_CLIENT_ID');
const clientSecret = required('BLING_NEW_CLIENT_SECRET');
const authorizationCode = required('BLING_AUTHORIZATION_CODE');
const redirectUri = text(process.env.BLING_REDIRECT_URI) || 'https://donaantonia.com.br/bling-oauth-callback.html';
const refreshTokenFile = required('BLING_REFRESH_TOKEN_FILE');

const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
const response = await fetch(`${API_BASE}/oauth/token`, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${basic}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    'enable-jwt': '1'
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: redirectUri
  })
});

if (!response.ok) {
  const body = (await response.text()).slice(0, 500);
  throw new Error(`Troca do código OAuth: HTTP ${response.status} ${body}`);
}

const tokens = await response.json();
if (!text(tokens.access_token) || !text(tokens.refresh_token)) {
  throw new Error('O Bling não retornou os tokens esperados.');
}

const check = await fetch(`${API_BASE}/produtos?pagina=1&limite=1`, {
  headers: {
    Authorization: `Bearer ${text(tokens.access_token)}`,
    Accept: 'application/json',
    'enable-jwt': '1'
  }
});
if (!check.ok) {
  const body = (await check.text()).slice(0, 500);
  throw new Error(`Teste de leitura de produtos: HTTP ${check.status} ${body}`);
}

writeFileSync(refreshTokenFile, text(tokens.refresh_token), { encoding: 'utf8', mode: 0o600 });
console.log('Autorização OAuth validada e acesso aos produtos confirmado.');
