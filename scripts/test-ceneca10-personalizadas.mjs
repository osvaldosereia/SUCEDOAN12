import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const htmlPath = path.join(root, 'ceneca10', 'personalizar.html');
const jsPath = path.join(root, 'ceneca10', 'personalizar-v2.js');
const resultPath = path.join(root, 'ceneca10', 'resultado.html');

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const result = fs.readFileSync(resultPath, 'utf8');
const failures = [];
const requireText = (source, needle, message) => { if (!source.includes(needle)) failures.push(message); };
const forbidText = (source, needle, message) => { if (source.includes(needle)) failures.push(message); };

const syntax = spawnSync(process.execPath, ['--check', jsPath], { encoding: 'utf8' });
if (syntax.status !== 0) failures.push(`personalizar-v2.js possui erro de sintaxe:\n${syntax.stderr || syntax.stdout}`);

requireText(html, 'id="whatsappUnlockButton"', 'Página não possui botão obrigatório para abrir o WhatsApp da empresa.');
requireText(html, 'id="whatsappSentConfirm"', 'Página não exige confirmação do envio da mensagem.');
requireText(html, 'id="generateButton"', 'Página não possui botão de geração.');
requireText(html, 'disabled>Criar minha caneca</button>', 'Botão de geração não inicia bloqueado.');
requireText(html, 'personalizar-v2.js', 'Página não carrega o controlador V2 do fluxo WhatsApp.');
requireText(html, 'id="sendResultWhatsappButton"', 'Resultado não possui envio final da criação para a empresa.');

forbidText(html, 'customerPhoneInput', 'Página ainda pede telefone do cliente no formulário.');
forbidText(html, 'whatsappConsentInput', 'Página ainda usa consentimento do fluxo antigo de envio para o cliente.');
forbidText(js, 'send_mug_customer_whatsapp', 'Código ainda tenta disparar WhatsApp por automação Make.');
forbidText(js, 'whatsapp_fila', 'Código ainda grava fila automática de WhatsApp.');
forbidText(js, 'customerPhoneInput', 'Código ainda depende de telefone digitado pelo cliente.');

requireText(js, "const BUSINESS_WHATSAPP = '5565998150975';", 'Número oficial da Dona Antônia não está configurado no fluxo.');
requireText(js, 'function contactWhatsappUrl', 'Código não prepara a mensagem obrigatória anterior à criação.');
requireText(js, 'function resultWhatsappUrl', 'Código não prepara a mensagem final com o link da criação.');
requireText(js, 'state.whatsappOpened && state.whatsappConfirmed', 'Geração não está condicionada ao contato/confirmacão de WhatsApp.');
requireText(js, "situacao: 'I'", 'Produto personalizado não está sendo cadastrado como inativo.');
requireText(js, 'ativo: false', 'Produto personalizado não possui ativo=false.');
requireText(js, "tipo_produto: 'caneca_personalizada'", 'Produto não está identificado como caneca personalizada.');
requireText(js, 'const publicUrl = resultUrl(id);', 'Fluxo não cria o link público da caneca.');
requireText(js, 'await saveCreationRecords(id, data, urls);', 'Fluxo não salva a página pública com as quatro imagens.');
requireText(js, "$('sendResultWhatsappButton').href = resultWhatsappUrl(id, publicUrl, data.customerName);", 'Link final não é enviado ao WhatsApp da empresa após ser criado.');
requireText(result, 'resultado.js', 'Página pública de resultado não está ligada ao seu controlador.');

if (failures.length) {
  console.error(`Falhas (${failures.length}):`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exit(1);
}

console.log('Caneca 10 personalizadas: fluxo WhatsApp obrigatório validado.');
