import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const htmlPath = path.join(root, 'ceneca10', 'personalizar.html');
const jsPath = path.join(root, 'ceneca10', 'personalizar-v4.js');
const resultHtmlPath = path.join(root, 'ceneca10', 'resultado.html');
const resultJsPath = path.join(root, 'ceneca10', 'resultado.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const resultHtml = fs.readFileSync(resultHtmlPath, 'utf8');
const resultJs = fs.readFileSync(resultJsPath, 'utf8');
const failures = [];
const requireText = (source, needle, message) => { if (!source.includes(needle)) failures.push(message); };
const forbidText = (source, needle, message) => { if (source.includes(needle)) failures.push(message); };

for (const file of [jsPath, resultJsPath]) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) failures.push(`${path.basename(file)} possui erro de sintaxe:\n${syntax.stderr || syntax.stdout}`);
}

requireText(html, 'personalizar-v4.js', 'Página não carrega o controlador V4.');
requireText(html, 'id="modelsTrack"', 'Página não possui lista unificada de modelos.');
requireText(html, 'id="createdTrack"', 'Página não mostra as canecas criadas.');
requireText(html, 'id="selectedModelPhrase"', 'Página não mostra a frase original do modelo.');
requireText(html, 'id="useModelPhraseButton"', 'Página não permite reutilizar a frase do modelo.');
requireText(html, 'id="highlightNameInput"', 'Página não possui campo de nome em destaque.');
requireText(html, 'id="whatsappUnlockButton"', 'Página não possui botão obrigatório para abrir o WhatsApp da empresa.');
requireText(html, 'id="whatsappSentConfirm"', 'Página não exige confirmação do contato pelo WhatsApp.');
requireText(html, 'disabled>Criar minha caneca</button>', 'Botão de geração não inicia bloqueado.');
requireText(html, 'id="sendResultWhatsappButton"', 'Resultado não possui envio final da criação para a empresa.');

forbidText(html, 'customerPhoneInput', 'Página voltou a pedir telefone do cliente no formulário.');
forbidText(js, 'send_mug_customer_whatsapp', 'Código tenta disparar WhatsApp por automação Make.');
forbidText(js, 'whatsapp_fila', 'Código grava fila automática de WhatsApp.');
forbidText(js, 'customerPhoneInput', 'Código depende de telefone digitado pelo cliente.');
forbidText(js, 'limitToLast', 'A busca voltou a limitar a quantidade de canecas carregadas.');
forbidText(js, '.slice(0,30)', 'A faixa de canecas criadas voltou a limitar a exibição a 30 itens.');
forbidText(js, '.slice(0, 30)', 'A faixa de canecas criadas voltou a limitar a exibição a 30 itens.');

requireText(js, "WA='5565998150975'", 'Número oficial da Dona Antônia não está configurado.');
requireText(js, 'async function allCreated()', 'Código não busca as canecas criadas diretamente em produtos.');
requireText(js, "orderBy:JSON.stringify('categoria')", 'Busca das canecas não consulta a categoria no Firebase.');
requireText(js, 'S.models=[...mm.values()]', 'Modelos salvos e canecas criadas não são unificados.');
requireText(js, "m.ativo?'Ativa':'Inativa'", 'Interface não identifica canecas ativas e inativas.');
requireText(js, 'function phrase(p={},f=', 'Código não recupera a frase da caneca original.');
requireText(js, 'phraseInput.value=S.selected.frase', 'Botão de reutilizar frase não preenche o campo.');
requireText(js, 'highlightName:txt(highlightNameInput.value)', 'Nome em destaque não entra nos dados da personalização.');
requireText(js, 'NOME EM DESTAQUE — ESCREVER EXATAMENTE ASSIM', 'Prompt não exige o nome destacado.');
requireText(js, 'FOTO + NOME EM DESTAQUE de um lado e FRASE do outro lado da caneca', 'Prompt não separa foto/nome e frase em lados opostos.');
requireText(js, "layout_instruction:'nome destacado próximo da imagem; frase no lado oposto da caneca'", 'Payload do Make não explicita o layout solicitado.');
requireText(js, "situacao:'I'", 'Produto personalizado não está cadastrado como inativo.');
requireText(js, 'ativo:false', 'Produto personalizado não possui ativo=false.');
requireText(js, 'modelo_caneca:true', 'Toda nova caneca não está marcada para servir como modelo.');
requireText(js, '`${FB}/${N.models}/${encodeURIComponent(id)}.json`', 'Nova criação não é salva em canecas/modelos_criacao.');
requireText(js, "tipo_produto:'caneca_personalizada'", 'Produto não está identificado como caneca personalizada.');
requireText(js, 'const id=S.id,pubUrl=resultUrl(id)', 'Fluxo não cria o link público da caneca antes da etapa final.');
requireText(js, "sendResultWhatsappButton.href=waEnd(id,pubUrl,d)", 'Link público final não é preparado para o WhatsApp da empresa.');
requireText(js, 'createdTrack.innerHTML=S.created.length?S.created.map', 'Todas as canecas criadas não são renderizadas na faixa sem limite.');
requireText(resultHtml, 'id="publicHighlightName"', 'Página de resultado não mostra o nome destacado.');
requireText(resultJs, "$('publicHighlightName').textContent", 'Resultado não carrega o nome destacado salvo.');

if (failures.length) {
  console.error(`Falhas (${failures.length}):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('Caneca 10 V4: todas as canecas ativas/inativas, frase reutilizável, nome destacado, layout em lados opostos e WhatsApp validados.');
