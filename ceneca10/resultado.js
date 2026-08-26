(() => {
  'use strict';
  const FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const PUBLIC_NODE = 'canecas/personalizadas_publicas';
  const BUSINESS_WHATSAPP = '5565998150975';
  const id = new URLSearchParams(location.search).get('id') || '';
  const $ = id => document.getElementById(id);
  const text = value => String(value ?? '').trim();
  const orderUrl = data => {
    const url = location.href;
    const msg = `Olá! Quero encomendar esta caneca personalizada.\nCódigo: ${data.id || id}\n${data.nome_publico ? `Nome da criação: ${data.nome_publico}\n` : ''}Link: ${url}`;
    return `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(msg)}`;
  };
  async function load() {
    if (!id || !/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error('Link de criação inválido.');
    const res = await fetch(`${FIREBASE_URL}/${PUBLIC_NODE}/${encodeURIComponent(id)}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Não foi possível carregar esta criação.');
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('Esta criação não foi encontrada.');
    const urls = [data.arte_horizontal, data.mockup_1, data.mockup_2, data.mockup_3].map(text);
    if (urls.some(url => !/^https?:\/\//i.test(url))) throw new Error('As imagens desta criação ainda não estão disponíveis.');
    $('publicTitle').textContent = data.nome_publico || 'Sua caneca está pronta';
    $('publicArt').src = urls[0];
    $('publicMockup1').src = urls[1];
    $('publicMockup2').src = urls[2];
    $('publicMockup3').src = urls[3];
    $('publicModel').textContent = data.modelo_nome || 'Modelo personalizado';
    $('publicPhrase').textContent = data.frase || 'Sem frase';
    $('publicOrderButton').href = orderUrl(data);
    $('resultLoading').hidden = true;
    $('publicResult').hidden = false;
  }
  load().catch(error => { $('resultLoading').textContent = error?.message || String(error); });
})();
