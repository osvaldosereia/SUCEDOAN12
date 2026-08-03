import { NfeAdvancedModule } from './modules/nfe-advanced.js?admin_build=20260726-admin-v13-xml-editor-parity';
import { updateNfeItem } from './core/nfe-simulation.js?admin_build=20260726-admin-v13-xml-editor-parity';
import { clone, productCode, productKey, text } from './core/utils.js';
import {
  assertMakeProductIdentity,
  callMake,
  compactProductForMake,
  extractMakeImage,
} from './services/make.js';
import { rawGithubUrl, upsertBase64File } from './services/github-binary.js';

const PATCH_FLAG = '__nfeImageMakeReferenceV2';

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'produto';
}

function imageSource(draft = {}) {
  return text(draft.url_imagem || draft.imagem_url || draft.imagem || draft.imagem_referencia);
}

function imageExtension(dataUrl) {
  const mime = text(dataUrl).match(/^data:image\/([^;]+);base64,/i)?.[1]?.toLowerCase() || 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'png';
}

function itemById(instance, itemId) {
  return instance.analysis?.items?.find(item => String(item.id) === String(itemId)) || null;
}

function identityFor(item, draft = {}) {
  const fallback = text(draft.codigo || item?.ean || item?.id);
  return item?.matchedProduct || {
    firebaseKey: fallback,
    id: fallback,
    codigo: fallback,
    gtin: text(draft.gtin || draft.ean || item?.ean),
    ...draft,
  };
}

function publicImage(value) {
  return /^https?:\/\//i.test(text(value));
}

async function ensurePublicReference(instance, itemId, config) {
  let item = itemById(instance, itemId);
  if (!item) throw new Error('Item da NF-e não encontrado.');
  let draft = clone(item.productDraft || {});
  let source = imageSource(draft);
  if (!source) throw new Error('Cole ou escolha uma imagem antes de executar a IA.');

  if (!publicImage(source)) {
    instance.onToast('Preparando a imagem colada e enviando a referência ao GitHub…');
    if (typeof instance.uploadNfeEditedImage === 'function') {
      await instance.uploadNfeEditedImage(itemId);
      item = itemById(instance, itemId);
      draft = clone(item?.productDraft || {});
      source = imageSource(draft);
    }
  }

  if (!publicImage(source) && /^data:image\//i.test(source)) {
    if (!config.writeMode) throw new Error('Ative “Permitir gravações” para preparar a imagem de referência.');
    const folder = text(config.githubImagesPath || 'site/img/produtos_3').replace(/^\/+|\/+$/g, '');
    const path = `${folder}/${slug(draft.codigo || draft.nome || item?.name)}-xml-ref-${Date.now()}.${imageExtension(source)}`;
    const uploaded = await upsertBase64File(
      config,
      path,
      source,
      `Adiciona referência da IA para ${draft.nome || item?.name} pela NF-e`,
    );
    source = uploaded.url || rawGithubUrl(config, path);
    instance.analysis = updateNfeItem(instance.analysis, itemId, {
      productDraft: {
        url_imagem: source,
        imagem: source,
        imagem_url: source,
        imagens: [source],
        imagem_path: path,
        imagem_storage: 'github',
        imagem_origem: 'referencia_nfe_para_make',
        imagem_status: 'referencia_publicada',
        imagem_editada_em: new Date().toISOString(),
      },
    }, instance.margin);
    instance.refreshSimulation();
    item = itemById(instance, itemId);
    draft = clone(item?.productDraft || {});
  }

  if (!publicImage(source)) {
    throw new Error('Não foi possível gerar uma URL pública para a imagem colada. Confira o token do GitHub.');
  }
  return { item, draft, source };
}

function nfeData(instance, item) {
  return {
    chave_nfe: text(instance.analysis?.note?.key),
    numero_nfe: text(instance.analysis?.note?.number),
    fornecedor: text(instance.analysis?.note?.supplier),
    nome_xml: text(item?.name),
    ean: text(item?.ean),
    ncm: text(item?.ncm),
    cest: text(item?.cest),
    embalagem: text(item?.packaging),
    custo_unitario: Number(item?.unitCost || 0),
  };
}

function install() {
  const prototype = NfeAdvancedModule.prototype;
  if (prototype[PATCH_FLAG]) return;
  Object.defineProperty(prototype, PATCH_FLAG, { value: true });
  const originalRunAi = prototype.runAi;

  prototype.runAi = async function runNfeImageWithPublicReference(action, itemId) {
    if (action !== 'image') return originalRunAi.call(this, action, itemId);
    if (!this.analysis || this.busy) return;

    const busyKey = `${itemId}:image`;
    if (this.aiBusy?.has(busyKey)) return;
    if (typeof this.reloadConfig === 'function') this.store.state.config = this.reloadConfig();
    const config = this.store.state.config || {};

    this.aiBusy?.add(busyKey);
    this.renderAnalysis();
    try {
      const prepared = await ensurePublicReference(this, itemId, config);
      const item = prepared.item;
      const draft = prepared.draft;
      const reference = prepared.source;
      const identity = identityFor(item, draft);
      const key = text(productKey(identity) || draft.codigo || item.ean || item.id);
      const code = text(productCode(identity) || draft.codigo || item.ean || item.id);
      const outputPath = `${text(config.githubImagesPath || 'site/img/produtos_3').replace(/^\/+|\/+$/g, '')}/${slug(code || draft.nome || item.name)}-ia.webp`;
      const compact = compactProductForMake({
        ...identity,
        ...draft,
        firebaseKey: key,
        id: text(identity.id || key),
        codigo: code,
        url_imagem: reference,
        imagem_url: reference,
        imagem: reference,
        imagens: [reference],
      });
      const productPayload = {
        ...compact,
        firebaseKey: key,
        key,
        id: text(compact.id || key),
        codigo: code,
        gtin: text(compact.gtin || draft.gtin || draft.ean || item.ean),
        ean: text(draft.ean || draft.gtin || item.ean),
        imagem_referencia: reference,
        imagem_url: reference,
        url_imagem: reference,
        imagem: reference,
        imagens: [reference],
      };

      this.onToast(`Make: enviando ${draft.nome || item.name} com a imagem colada como referência…`);
      const raw = await callMake(config, 'image', {
        versao_payload: 'nfe-imagem-v2',
        acao: 'melhorar_imagem_produto',
        origem: 'entrada_nfe_admin_v2',
        fluxo: 'imagem_produto_xml_com_referencia',
        quantidade_imagens: 1,
        key,
        firebaseKey: key,
        id_produto: key,
        codigo: code,
        ean: productPayload.ean,
        imagem_referencia: reference,
        imagem_url: reference,
        url_imagem: reference,
        imagem: reference,
        dados_nfe: nfeData(this, item),
        produto: productPayload,
        storage_destino: 'github',
        substituir_imagens_existentes: true,
        imagem_path: outputPath,
        instrucoes: 'Usar obrigatoriamente a imagem de referência enviada. Gerar exatamente 1 imagem quadrada fiel ao produto, fundo branco puro, sem cenário e sem inventar ou alterar textos da embalagem.',
      });

      const checked = assertMakeProductIdentity(identity, raw);
      let generated = extractMakeImage(checked) || extractMakeImage(raw);
      let publishedPath = outputPath;

      if (!generated) {
        generated = `${rawGithubUrl(config, outputPath)}?v=${Date.now()}`;
      } else if (/^data:image\//i.test(generated)) {
        const extension = imageExtension(generated);
        publishedPath = `${text(config.githubImagesPath || 'site/img/produtos_3').replace(/^\/+|\/+$/g, '')}/${slug(code || draft.nome || item.name)}-ia-${Date.now()}.${extension}`;
        const uploaded = await upsertBase64File(
          config,
          publishedPath,
          generated,
          `Atualiza imagem IA de ${draft.nome || item.name} pela entrada de NF-e`,
        );
        generated = uploaded.url || rawGithubUrl(config, publishedPath);
      }

      this.analysis = updateNfeItem(this.analysis, itemId, {
        productDraft: {
          url_imagem: generated,
          imagem: generated,
          imagem_url: generated,
          imagens: [generated],
          imagem_path: publishedPath,
          imagem_storage: 'github',
          imagem_origem: 'ia_make_nfe',
          imagem_status: 'ok',
          imagem_referencia_usada: reference,
          imagem_gerada_em: new Date().toISOString(),
        },
      }, this.margin);
      this.refreshSimulation();
      this.onToast('Imagem gerada pelo Make, aplicada ao produto do XML e pronta para importar.', 'success');
    } catch (error) {
      console.error('Falha na imagem IA da NF-e:', error);
      this.onToast(error?.message || String(error), 'error');
      throw error;
    } finally {
      this.aiBusy?.delete(busyKey);
      this.renderAnalysis();
    }
  };
}

install();
