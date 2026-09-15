import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  'https://donaantonia.com.br',
  'https://www.donaantonia.com.br',
]);
const BASE_CORS = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const cors = (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return null;
  return {
    ...BASE_CORS,
    'Access-Control-Allow-Origin': origin || 'https://donaantonia.com.br',
    'Vary': 'Origin',
  };
};
const json = (req: Request, body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      ...(cors(req) || BASE_CORS),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  },
);
const clean = (value: unknown, max = 100) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);
const validToken = (value: unknown) => /^[a-f0-9]{64}$/i.test(clean(value, 80));

Deno.serve(async (req: Request) => {
  const headers = cors(req);
  if (!headers) return new Response('forbidden', { status: 403 });
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json(req, { ok: false, error: 'method_not_allowed' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, error: 'invalid_json' }, 400);
  }

  const action = clean(body?.action || '', 40).toLowerCase();
  if (action !== 'reset_cart') return json(req, { ok: false, error: 'invalid_action' }, 400);
  if (!validToken(body?.token)) return json(req, { ok: false, error: 'invalid_token' }, 400);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json(req, { ok: false, error: 'server_config' }, 500);

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc('room_reset_open_cart_v1', {
    p_public_token: clean(body.token, 80),
  });
  if (error) {
    const detail = clean(error.message, 160);
    const status = /room_unavailable|cart_not_editable/.test(detail) ? 409 : 400;
    return json(req, { ok: false, error: 'reset_cart_failed', detail }, status);
  }

  return json(req, { ok: true, ...(data || {}) });
});
