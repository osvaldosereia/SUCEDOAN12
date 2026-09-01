import fs from 'node:fs';

const appPath = 'loja-integrada/personalizar/app.js';
const htmlPath = 'loja-integrada/personalizar/index.html';
const workerPath = '.github/workflows/gerenciar-produtos-personalizados-temporarios-li.yml';

let app = fs.readFileSync(appPath, 'utf8');

app = app.replace(
  "const BUILD = '20260830-loja-integrada-personalizador-v2';",
  "const BUILD = '20260901-loja-integrada-personalizador-v3-commerce';"
);

app = app.replace(
  "    arte_aprovada: { url: source, versao:'v1' },\n    arte_versao: 'v1',\n    arte_versao_aprovada: 'v1',",
  "    arte_aprovada: null,\n    arte_versao: 'v1',\n    arte_versao_aprovada: '',\n    aprovada: false,"
);

const approveBlock = `async function approveAndBuy() {
  if (!currentCode || !currentSource) return;
  const button = $('#returnButton');
  if (button.disabled) return;
  button.disabled = true;
  $('#errorBox').hidden = true;
  $('#progressBox').hidden = false;
  $('#progressText').textContent = 'Aprovando sua arte e preparando o item personalizado…';
  try {
    const at = new Date().toISOString();
    await writeJson(\`\${CREATIONS_NODE}/\${safeKey(currentCode)}\`, {
      aprovada: true,
      arte_aprovada: { url: currentSource, versao:'v1', aprovado_em:at },
      arte_versao_aprovada: 'v1',
      status: 'pronta_para_compra',
      atualizado_em: at,
      loja_integrada_temporario: {
        status: 'solicitado',
        solicitado_em: at,
        atualizado_em: at,
        origem: 'personalizador_web'
      }
    }, 'PATCH');

    const started = Date.now();
    const timeout = 6 * 60 * 1000;
    while (Date.now() - started < timeout) {
      const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
      $('#progressText').textContent = \`Preparando seu item personalizado para o carrinho · \${elapsed}s\`;
      const creation = await fetchJson(\`\${CREATIONS_NODE}/\${safeKey(currentCode)}\`);
      const temp = creation?.loja_integrada_temporario || {};
      if (temp.status === 'ativo' && temp.produto_id) {
        const cart = new URL(\`/carrinho/produto/\${encodeURIComponent(temp.produto_id)}/adicionar\`, STOREFRONT);
        cart.searchParams.set('utm_source', 'canecafacil');
        cart.searchParams.set('utm_medium', 'personalizador');
        cart.searchParams.set('utm_content', currentCode);
        location.href = cart.href;
        return;
      }
      if (temp.status === 'revisar') throw new Error(temp.erro || 'A criação precisa de revisão antes da compra.');
      if (temp.status === 'pendente_retry' && temp.erro) $('#progressText').textContent = 'Ainda preparando seu item. Nova tentativa automática em instantes…';
      await sleep(2500);
    }
    throw new Error('Sua arte foi aprovada, mas o item ainda está sendo preparado. Tente novamente em alguns minutos.');
  } catch (error) {
    $('#progressBox').hidden = true;
    showError(error?.message || String(error));
    button.disabled = false;
  }
}

`;

if (!app.includes('async function approveAndBuy()')) {
  const marker = 'async function init() {';
  if (!app.includes(marker)) throw new Error('Marcador init() não encontrado em app.js');
  app = app.replace(marker, approveBlock + marker);
}

const oldReturn = "  $('#returnButton').addEventListener('click', () => { location.href = returnUrl(); });";
if (app.includes(oldReturn)) app = app.replace(oldReturn, "  $('#returnButton').addEventListener('click', approveAndBuy);");
if (!app.includes("$('#returnButton').addEventListener('click', approveAndBuy)")) throw new Error('Não foi possível ligar o botão ao approveAndBuy().');

fs.writeFileSync(appPath, app);

let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(
  'Guarde este código. Ele identifica exatamente a arte que será usada na produção.',
  'Confira a arte com atenção. Ao aprovar, vamos preparar este item personalizado e enviar você ao carrinho.'
);
html = html.replace('id="returnButton">VOLTAR PARA COMPRAR</button>', 'id="returnButton">APROVAR E COMPRAR</button>');
html = html.replace('./app.js?v=20260830-3', './app.js?v=20260901-1');
if (!html.includes('id="returnButton">APROVAR E COMPRAR</button>')) throw new Error('Botão APROVAR E COMPRAR não foi aplicado.');
fs.writeFileSync(htmlPath, html);

let worker = fs.readFileSync(workerPath, 'utf8');
worker = worker.replace("cron: '*/10 * * * *'", "cron: '*/5 * * * *'");
fs.writeFileSync(workerPath, worker);

console.log('Personalizador comercial finalizado nos arquivos de produção.');
