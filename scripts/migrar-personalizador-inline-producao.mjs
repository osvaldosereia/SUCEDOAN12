import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path,content){ fs.writeFileSync(path,content); console.log(`OK ${path}`); }
function replaceRequired(source, oldText, newText, label){
  if (!source.includes(oldText)) throw new Error(`Trecho não encontrado: ${label}`);
  return source.replace(oldText,newText);
}

// 1) Personalizador inline: sai da homologação visual e passa a aprovar/comprar na própria página.
const inlinePath='loja-integrada/personalizador-inline-v1.js';
let s=read(inlinePath);
s=replaceRequired(s,
  "const BUILD = '20260901-li-personalizador-inline-v1';",
  "const BUILD = '20260901-li-personalizador-inline-v1.2-commerce';",
  'BUILD inline');
s=replaceRequired(s,
  "  let generatedSource = '';\n  const files = {};",
  "  let generatedSource = '';\n  let generatedCode = '';\n  const files = {};",
  'estado generatedCode');
s=replaceRequired(s,
`  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    return response.json();
  }
`,
`  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    return response.json();
  }

  async function writeJson(url, data, method = 'PUT') {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
    return response.json().catch(() => null);
  }
`,
  'writeJson');

s=s.replace("        <span class=\"cfip-test\">HOMOLOGAÇÃO · SOMENTE VOCÊ VÊ COM ?cf_personalizador=teste</span>\n",'');
s=replaceRequired(s,
  '<div class="cfip-status" id="cfipStatus">Teste seguro: a geração funciona aqui, mas a compra personalizada ainda está desativada nesta homologação.</div>',
  '<div class="cfip-status" id="cfipStatus">Preencha os campos liberados para este modelo e gere sua arte.</div>',
  'status produção');
s=replaceRequired(s,
  '<p>Confira com atenção. Nesta etapa de homologação ainda não enviaremos a caneca personalizada ao carrinho.</p>',
  '<p>Confira a arte com atenção. Se estiver correta, aprove para continuar a compra.</p>\n          <div class="cfip-status" id="cfipResultStatus">Sua arte ainda não foi aprovada.</div>',
  'texto resultado');
s=replaceRequired(s,
  '<button class="cfip-primary" type="button" disabled>APROVAR E COMPRAR · EM BREVE</button>',
  '<button class="cfip-primary" id="cfipApprove" type="button">APROVAR E COMPRAR</button>',
  'botão aprovar');
s=replaceRequired(s,
  "${config.obrigatoria ? 'Neste modelo a personalização será obrigatória quando entrarmos em produção.' : 'Neste modelo a personalização é opcional; a compra sem alterações continuará disponível.'}",
  "${config.obrigatoria ? 'A personalização deste modelo é obrigatória antes da compra.' : 'A personalização é opcional; você também pode comprar o modelo sem alterações.'}",
  'nota compra');
s=s.replaceAll('cfHomologacaoOriginalDisplay','cfOriginalDisplay');

s=replaceRequired(s,
`    panel.querySelector('#cfipForm').addEventListener('submit', generate);
    panel.querySelector('#cfipAgain').addEventListener('click', () => {
      generatedSource = '';
      panel.querySelector('#cfipResult').hidden = true;
      panel.querySelector('#cfipForm').hidden = false;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });`,
`    panel.querySelector('#cfipForm').addEventListener('submit', generate);
    panel.querySelector('#cfipApprove').addEventListener('click', approveAndBuy);
    panel.querySelector('#cfipAgain').addEventListener('click', () => {
      generatedSource = '';
      generatedCode = '';
      panel.querySelector('#cfipResult').hidden = true;
      panel.querySelector('#cfipForm').hidden = false;
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });`,
  'listeners');

s=replaceRequired(s,
`  function setStatus(message, error = false) {
    const node = document.getElementById('cfipStatus');
    if (!node) return;
    node.textContent = message;
    node.className = \`cfip-status\${error ? ' error' : ''}\`;
  }

  async function generate(event) {`,
`  function setStatus(message, error = false) {
    const node = document.getElementById('cfipStatus');
    if (!node) return;
    node.textContent = message;
    node.className = \`cfip-status\${error ? ' error' : ''}\`;
  }

  function setResultStatus(message, error = false) {
    const node = document.getElementById('cfipResultStatus');
    if (!node) return;
    node.textContent = message;
    node.className = \`cfip-status\${error ? ' error' : ''}\`;
  }

  function creationCode() {
    const d = new Date();
    const date = \`\${String(d.getFullYear()).slice(-2)}\${String(d.getMonth()+1).padStart(2,'0')}\${String(d.getDate()).padStart(2,'0')}\`;
    return \`CF-\${date}-\${Date.now().toString(36).toUpperCase().slice(-6)}\`;
  }

  async function persistCreation(source, values, prompt, email) {
    const code = creationCode();
    const at = new Date().toISOString();
    const record = {
      id: code,
      origem: 'loja_integrada_inline',
      loja_dominio: location.hostname,
      modelo_key: productKey,
      modelo_nome: text(product?.nome),
      produto_key: productKey,
      cliente_email: email,
      campos: values,
      arte_horizontal: source,
      arte_personalizacao: source,
      arte_aprovada: null,
      arte_versao: 'v1',
      arte_versao_aprovada: '',
      aprovada: false,
      versoes: [{ versao:'v1', url:source, criado_em:at, status:'gerada' }],
      personalizacao_snapshot: {
        config_version: config.config_version,
        prompt_base_id: config.prompt_base_id,
        prompt_base_versao: config.prompt_base_versao,
        prompt_final: prompt,
        campos_liberados: config.campos.map(f => ({ id:f.id, rotulo:f.rotulo, tipo:f.tipo, obrigatorio:f.obrigatorio }))
      },
      status: 'arte_pronta',
      atendimento_status: 'novo',
      criado_em: at,
      atualizado_em: at
    };
    await writeJson(\`\${FIREBASE}/canecas/personalizadas/\${safeKey(code)}.json\`, record, 'PUT');
    return code;
  }

  async function approveAndBuy() {
    if (!generatedSource || !generatedCode) return setResultStatus('Gere a arte antes de aprovar.', true);
    const button = document.getElementById('cfipApprove');
    if (!button || button.disabled) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'PREPARANDO CARRINHO…';
    try {
      const at = new Date().toISOString();
      await writeJson(\`\${FIREBASE}/canecas/personalizadas/\${safeKey(generatedCode)}.json\`, {
        aprovada: true,
        arte_aprovada: { url: generatedSource, versao:'v1', aprovado_em:at },
        arte_versao_aprovada: 'v1',
        status: 'pronta_para_compra',
        atualizado_em: at,
        loja_integrada_temporario: {
          status: 'solicitado',
          solicitado_em: at,
          atualizado_em: at,
          origem: 'personalizador_inline'
        }
      }, 'PATCH');

      const started = Date.now();
      const timeout = 6 * 60 * 1000;
      while (Date.now() - started < timeout) {
        const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
        setResultStatus(\`Arte aprovada. Preparando seu item personalizado para o carrinho · \${elapsed}s\`);
        const creation = await fetchJson(\`\${FIREBASE}/canecas/personalizadas/\${safeKey(generatedCode)}.json?_\${Date.now()}\`).catch(() => null);
        const temp = creation?.loja_integrada_temporario || {};
        if (temp.status === 'ativo' && temp.produto_id) {
          setResultStatus('Item pronto. Abrindo o carrinho…');
          const cart = new URL(\`/carrinho/produto/\${encodeURIComponent(temp.produto_id)}/adicionar\`, location.origin);
          cart.searchParams.set('utm_source','canecafacil');
          cart.searchParams.set('utm_medium','personalizador_inline');
          cart.searchParams.set('utm_content',generatedCode);
          location.href = cart.href;
          return;
        }
        if (temp.status === 'revisar') throw new Error(temp.erro || 'A criação precisa de revisão antes da compra.');
        if (temp.status === 'pendente_retry') setResultStatus('Arte aprovada. A loja está preparando o item; nova tentativa automática em instantes…');
        await sleep(2500);
      }
      throw new Error('Sua arte foi aprovada, mas o item ainda está sendo preparado. Tente novamente em alguns minutos.');
    } catch (error) {
      console.error('[CanecaFácil inline compra]', error);
      setResultStatus(error?.message || String(error), true);
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function generate(event) {`,
  'funções comerciais');

s=replaceRequired(s,
`      if (!source) source = await waitResult(requestId);
      generatedSource = source;
      document.getElementById('cfipResultImage').src = source;`,
`      if (!source) source = await waitResult(requestId);
      generatedSource = source;
      generatedCode = await persistCreation(source, values, prompt, email);
      document.getElementById('cfipResultImage').src = source;`,
  'persistência após geração');
s=replaceRequired(s,
  "      setStatus('Arte gerada com sucesso.');",
  "      setStatus('Arte gerada com sucesso.');\n      setResultStatus(`Confira a arte. Código da personalização: ${generatedCode}`);",
  'status código');
s=replaceRequired(s,
  "      console.warn('[CanecaFácil inline] homologação não iniciada:', error?.message || error);",
  "      console.warn('[CanecaFácil inline] não iniciado:', error?.message || error);",
  'log produção');
write(inlinePath,s);

// 2) O botão do produto fica na MESMA página. O parâmetro só ativa o loader já instalado no tema.
const syncPath='scripts/sincronizar-loja-integrada.mjs';
let sync=read(syncPath);
sync=replaceRequired(sync,
  "  const link = `${DEFAULTS.personalizerBase}?model=${encodeURIComponent(key)}&return=${encodeURIComponent('https://canecafacil.com.br/')}`;",
  "  const link = '?cf_personalizador=teste#cfInlinePersonalizer';",
  'link inline no sincronizador LI');
write(syncPath,sync);

// 3) Evita que o gerenciador de conteúdo volte a publicar o link externo.
const managerPath='admin-canecas/product-content-manager-v1.js';
let manager=read(managerPath);
manager=replaceRequired(manager,
  "  const personalizerUrl = `${base}${base.includes('?') ? '&' : '?'}model=${encodeURIComponent(key)}&return=${encodeURIComponent(returnUrl)}`;",
  "  const personalizerUrl = '?cf_personalizador=teste#cfInlinePersonalizer';",
  'preview/admin inline');
write(managerPath,manager);

// 4) Evita que a fila de conteúdo volte a publicar o link externo.
const contentSyncPath='scripts/sincronizar-conteudo-canecafacil.mjs';
let contentSync=read(contentSyncPath);
contentSync=replaceRequired(contentSync,
  "  const url = `${base}${base.includes('?') ? '&' : '?'}model=${encodeURIComponent(key)}&return=${encodeURIComponent(ret)}`;",
  "  const url = '?cf_personalizador=teste#cfInlinePersonalizer';",
  'sync conteúdo inline');
write(contentSyncPath,contentSync);

console.log('Migração inline de produção aplicada com sucesso.');
