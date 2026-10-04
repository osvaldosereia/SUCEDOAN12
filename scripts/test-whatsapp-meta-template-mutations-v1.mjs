import assert from 'node:assert/strict';

const helperUrl = new URL('../supabase/functions/_shared/whatsapp-meta-templates-v1.mjs', import.meta.url);
const helper = await import(helperUrl.href);

for (const name of ['validateTemplateDraft','createTemplateViaMeta','editTemplateViaMeta','deleteTemplateViaMeta']) {
  assert.equal(typeof helper[name], 'function', `${name} deve existir`);
}

const {
  validateTemplateDraft,
  createTemplateViaMeta,
  editTemplateViaMeta,
  deleteTemplateViaMeta,
  MetaTemplatesError,
} = helper;

const validDraft = validateTemplateDraft({
  name: 'ofertas_outubro_01',
  language: 'pt_BR',
  category: 'MARKETING',
  components: [
    { type: 'HEADER', format: 'TEXT', text: 'Ofertas Dona Antônia' },
    { type: 'BODY', text: 'Oi {{1}}, veja nossas ofertas.', example: { body_text: [['Maria']] } },
    { type: 'FOOTER', text: 'Para não receber promoções, responda SAIR.' },
    { type: 'BUTTONS', buttons: [
      { type: 'URL', text: 'Ver ofertas', url: 'https://www.donaantonia.com.br/#/ofertas' },
      { type: 'QUICK_REPLY', text: 'Não quero ofertas' },
    ] },
  ],
});
assert.equal(validDraft.name, 'ofertas_outubro_01');
assert.equal(validDraft.language, 'pt_BR');
assert.equal(validDraft.category, 'MARKETING');
assert.equal(validDraft.components.find((item) => item.type === 'BODY')?.text, 'Oi {{1}}, veja nossas ofertas.');

for (const bad of [
  { ...validDraft, name: 'Oferta Com Espaço' },
  { ...validDraft, language: 'pt-br' },
  { ...validDraft, category: 'NOT_A_CATEGORY' },
  { ...validDraft, components: [{ type: 'FOOTER', text: 'sem body' }] },
  { ...validDraft, components: [{ type: 'BODY', text: '' }] },
  { ...validDraft, components: [{ type: 'IMAGE', text: 'não suportado na V1' }, { type: 'BODY', text: 'ok' }] },
  { ...validDraft, components: [{ type: 'BODY', text: 'Oi {{1}}, tudo bem?' }] },
]) {
  assert.throws(() => validateTemplateDraft(bad), MetaTemplatesError);
}

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return new Response(JSON.stringify({ id: '1234567890', status: 'PENDING', success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const cfg = {
  accessToken: 'unit-test-token',
  graphVersion: 'v23.0',
  fetchImpl,
  timeoutMs: 5000,
};

await createTemplateViaMeta({
  ...cfg,
  wabaId: '1497253794754816',
  template: validDraft,
});
assert.equal(calls[0].url, 'https://graph.facebook.com/v23.0/1497253794754816/message_templates');
assert.equal(calls[0].options.method, 'POST');
assert.equal(calls[0].options.headers.Authorization, 'Bearer unit-test-token');
assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
assert.deepEqual(JSON.parse(calls[0].options.body), validDraft);

await editTemplateViaMeta({
  ...cfg,
  templateId: '1234567890',
  template: validDraft,
});
assert.equal(calls[1].url, 'https://graph.facebook.com/v23.0/1234567890');
assert.equal(calls[1].options.method, 'POST');
assert.deepEqual(JSON.parse(calls[1].options.body), validDraft);

await deleteTemplateViaMeta({
  ...cfg,
  wabaId: '1497253794754816',
  name: 'ofertas_outubro_01',
  templateId: '1234567890',
});
const deleteUrl = new URL(calls[2].url);
assert.equal(deleteUrl.origin + deleteUrl.pathname, 'https://graph.facebook.com/v23.0/1497253794754816/message_templates');
assert.equal(deleteUrl.searchParams.get('name'), 'ofertas_outubro_01');
assert.equal(deleteUrl.searchParams.get('hsm_id'), '1234567890');
assert.equal(calls[2].options.method, 'DELETE');

await assert.rejects(
  () => createTemplateViaMeta({ ...cfg, wabaId: 'https://evil.example/1', template: validDraft }),
  MetaTemplatesError,
  'WABA arbitrária/host injection deve ser rejeitada',
);
await assert.rejects(
  () => editTemplateViaMeta({ ...cfg, templateId: '../evil', template: validDraft }),
  MetaTemplatesError,
  'template id inválido deve ser rejeitado',
);

console.log('PASS test-whatsapp-meta-template-mutations-v1');
