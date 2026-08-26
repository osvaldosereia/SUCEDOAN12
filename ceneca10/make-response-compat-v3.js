(() => {
  'use strict';
  const TARGET = 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function caneca10Fetch(input, init = {}) {
    const response = await nativeFetch(input, init);
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (url !== TARGET || !init?.body) return response;
    try {
      const clone = response.clone();
      const data = await clone.json();
      if (data?.action !== 'generate_mug_art') return response;
      const publicUrl = String(data.art_source_public_url || '').trim();
      const current = String(data.art_source_url || '').trim();
      if (!/^https?:\/\//i.test(publicUrl) || !/^data:image\//i.test(current)) return response;
      data.art_source_base64 = current;
      data.art_source_url = publicUrl;
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
    } catch {
      return response;
    }
  };
})();
