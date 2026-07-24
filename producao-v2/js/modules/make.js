import { productKey, productName, text } from '../core/utils.js';
import {
  assertMakeProductIdentity, callMake, compactProductForMake, extractMakeImage, extractMakeTags, unwrapMakeResult,
} from '../services/make.js';
import { rawGithubUrl, upsertBase64File } from '../services/github-binary.js';

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'produto';
}

function mergeTags(current, incoming) {
  const base = Array.isArray(current) ? current : text(current).split(/[,;|]/);
  return [...new Set([...base, ...(incoming || [])].map(item => text(item)).filter(Boolean))];
}

function imageExtension(dataUrl) {
  const mime = text(dataUrl).match(/^data:image\/([^;]+);base64,/i)?.[1]?.toLowerCase() || 'png';
  return mime.includes('webp') ? 'webp' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
}

export class MakeModule {
  constructor({ store, productsModule, onToast }) {
    this.store = store;
    this.productsModule = productsModule;
    this.onToast = onToast;
    this.busy = new Set();
    this.chatProductKey = '';
    this.ensureChat();
  }

  config() {
    return this.store.state.config;
  }

  setBusy(key, action, active) {
    const id = `${key}:${action}`;
    active ? this.busy.add(id) : this.busy.delete(id);
    document.querySelectorAll(`[data-make-product="${CSS.escape(action)}"][data-key="${CSS.escape(String(key))}"]`).forEach(button => {
      button.disabled = active;
      button.classList.toggle('is-running', active);
    });
  }

  async runProductAction(action, key) {
    const product = this.store.getProduct(key);
    if (!product) throw new Error('Produto não encontrado.');
    const id = `${key}:${action}`;
    if (this.busy.has(id)) return;
    this.setBusy(key, action, true);
    try {
      if (action === 'chat') {
        this.openChat(key);
        return;
      }
      const compact = compactProductForMake(product);
      const actionMap = {
        full: 'gerar_cadastro_produto',
        name: 'melhorar_nome_produto',
        description: 'gerar_descricao_produto',
        packaging: 'gerar_embalagem',
        tags: 'gerar_tag_produto',
        image: 'melhorar_imagem_produto',
      };
      const makeAction = actionMap[action];
      if (!makeAction) throw new Error('Automação não reconhecida.');
      this.onToast(`Make: ${action === 'image' ? 'gerando imagem' : 'processando cadastro'} de ${productName(product)}…`);
      const channel = action === 'image' ? 'image' : 'text';
      const payload = action === 'image'
        ? {
          acao: makeAction,
          quantidade_imagens: 1,
          produto: compact,
          storage_destino: 'github',
          substituir_imagens_existentes: true,
          imagem_path: `${text(this.config().githubImagesPath || 'site/img/produtos_3').replace(/\/+$/, '')}/${slug(product.codigo || product.nome)}-ia.webp`,
          instrucoes: 'Gerar exatamente 1 imagem quadrada fiel ao produto, fundo branco puro, sem cenário e sem inventar informações da embalagem.',
        }
        : { acao: makeAction, produto: compact };
      const rawResult = await callMake(this.config(), channel, payload);
      const result = assertMakeProductIdentity(product, rawResult);
      const patch = await this.patchFromResult(action, product, result);
      if (!Object.keys(patch).length) throw new Error('O Make concluiu, mas não retornou campos utilizáveis.');
      this.store.updateProduct(key, patch);
      this.productsModule.refreshAfterExternalChange(key);
      this.onToast(`Automação aplicada em ${productName(this.store.getProduct(key))}. Revise e salve o produto.`, 'success');
    } catch (error) {
      console.error(error);
      this.onToast(error?.message || String(error), 'error');
      throw error;
    } finally {
      this.setBusy(key, action, false);
    }
  }

  async patchFromResult(action, product, rawResult) {
    const result = unwrapMakeResult(rawResult);
    const patch = {};
    const tags = extractMakeTags(result);
    if (action === 'full') {
      const fields = {
        nome: result.nome_sugerido || result.nome || result.name,
        descricao: result.descricao || result.description || result.texto,
        descricao_curta: result.descricao_curta || result.short_description,
        embalagem: result.embalagem_sugerida || result.embalagem,
        categoria: result.categoria,
        subcategoria: result.subcategoria,
        subsubcategoria: result.subsubcategoria,
        marca: result.marca,
        fornecedor: result.fornecedor,
        ncm: result.ncm,
      };
      Object.entries(fields).forEach(([field, value]) => { if (text(value)) patch[field] = text(value); });
      if (tags.length) patch.tags = mergeTags(product.tags, tags);
    }
    if (action === 'name') {
      const value = result.nome_sugerido || result.nome || result.name || result.texto;
      if (text(value)) patch.nome = text(value);
    }
    if (action === 'description') {
      const value = result.descricao || result.description || result.texto;
      if (text(value)) patch.descricao = text(value);
      if (text(result.descricao_curta || result.short_description)) patch.descricao_curta = text(result.descricao_curta || result.short_description);
      if (tags.length) patch.tags = mergeTags(product.tags, tags);
    }
    if (action === 'packaging') {
      const value = result.embalagem_sugerida || result.embalagem || result.texto;
      if (text(value)) patch.embalagem = text(value);
    }
    if (action === 'tags' && tags.length) patch.tags = mergeTags(product.tags, tags);
    if (action === 'image') {
      let source = extractMakeImage(result);
      if (!source) throw new Error('O Make não retornou imagem, imagem_url, url_imagem ou base64.');
      if (/^data:image\//i.test(source)) {
        const config = this.config();
        const ext = imageExtension(source);
        const path = `${text(config.githubImagesPath || 'site/img/produtos_3').replace(/\/+$/, '')}/${slug(product.codigo || product.nome)}-ia-${Date.now()}.${ext}`;
        const uploaded = await upsertBase64File(config, path, source, `Atualiza imagem IA de ${product.nome || product.codigo} pelo Admin V2`);
        source = uploaded.url || rawGithubUrl(config, path);
        patch.imagem_path = path;
        patch.imagem_storage = 'github';
      }
      patch.url_imagem = source;
      patch.imagem = source;
      patch.imagem_url = source;
      patch.imagens = [source];
      patch.imagem_origem = 'ia_make';
      patch.imagem_status = 'ok';
      patch.imagem_gerada_em = new Date().toISOString();
    }
    return patch;
  }

  ensureChat() {
    if (document.getElementById('makeProductChat')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="make-chat-backdrop" id="makeChatBackdrop" hidden></div><section class="make-chat" id="makeProductChat" hidden aria-hidden="true"><div class="make-chat-head"><div><span class="eyebrow">IA via Make</span><h2 id="makeChatTitle">Perguntar sobre produto</h2><p id="makeChatSubtitle"></p></div><button class="icon-button" id="makeChatClose" type="button">×</button></div><div class="make-chat-messages" id="makeChatMessages"></div><form class="make-chat-form" id="makeChatForm"><textarea id="makeChatQuestion" placeholder="Pergunte sobre cadastro, nome, descrição, uso ou classificação"></textarea><button class="button primary" type="submit">Enviar</button></form></section>`);
    document.getElementById('makeChatClose').addEventListener('click', () => this.closeChat());
    document.getElementById('makeChatBackdrop').addEventListener('click', () => this.closeChat());
    document.getElementById('makeChatForm').addEventListener('submit', event => {
      event.preventDefault();
      this.sendChat().catch(error => this.onToast(error?.message || String(error), 'error'));
    });
  }

  openChat(key) {
    const product = this.store.getProduct(key);
    if (!product) return;
    this.chatProductKey = String(key);
    document.getElementById('makeChatTitle').textContent = productName(product);
    document.getElementById('makeChatSubtitle').textContent = `${product.codigo || key} · ${product.marca || 'sem marca'}`;
    document.getElementById('makeChatMessages').innerHTML = '<div class="make-chat-bubble ai">Digite uma pergunta sobre este produto.</div>';
    document.getElementById('makeProductChat').hidden = false;
    document.getElementById('makeProductChat').setAttribute('aria-hidden', 'false');
    document.getElementById('makeChatBackdrop').hidden = false;
    setTimeout(() => document.getElementById('makeChatQuestion')?.focus(), 40);
  }

  closeChat() {
    document.getElementById('makeProductChat').hidden = true;
    document.getElementById('makeProductChat').setAttribute('aria-hidden', 'true');
    document.getElementById('makeChatBackdrop').hidden = true;
    this.chatProductKey = '';
  }

  addChat(role, message) {
    const node = document.createElement('div');
    node.className = `make-chat-bubble ${role}`;
    node.textContent = message;
    const region = document.getElementById('makeChatMessages');
    region.appendChild(node);
    region.scrollTop = region.scrollHeight;
    return node;
  }

  async sendChat() {
    const product = this.store.getProduct(this.chatProductKey);
    const input = document.getElementById('makeChatQuestion');
    const question = text(input.value);
    if (!product || !question) return;
    input.value = '';
    this.addChat('user', question);
    const waiting = this.addChat('ai', 'Consultando o Make…');
    try {
      const raw = await callMake(this.config(), 'text', { acao: 'chat_produto', pergunta: question, produto: compactProductForMake(product) });
      const result = assertMakeProductIdentity(product, raw);
      const answer = result.resposta || result.answer || result.texto || result.message || result.content || result.output_text;
      if (!text(answer)) throw new Error('O Make não retornou resposta para o chat.');
      waiting.textContent = text(answer);
    } catch (error) {
      waiting.textContent = `Erro: ${error?.message || error}`;
      throw error;
    }
  }
}
