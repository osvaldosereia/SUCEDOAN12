import { validateProduct } from '../core/catalog.js';
import { buildNfeImportRecord, digits, round } from '../core/nfe.js';
import { clone, number, productKey, text } from '../core/utils.js';
import { loadProduct, saveProduct } from './firebase.js';
import { archiveNfeXml, inspectNfeImport, nfeXmlPath, writeNfeImportRecord } from './github.js';

function listFromValue(value) {
  if (Array.isArray(value)) return clone(value);
  if (value && typeof value === 'object') return Object.values(clone(value));
  return [];
}

function ensureNotApplied(remote, entryId) {
  const entries = listFromValue(remote?.entradas_nfe);
  if (entries.some(entry => String(entry?.id || '') === entryId)) {
    throw new Error('Esta entrada da NF-e já existe no produto remoto. O estoque não foi somado novamente.');
  }
}

export function materializeExistingPlan(plan, remote) {
  if (!remote) throw new Error(`O produto ${plan.productKey} não existe mais no Firebase.`);
  const entryId = plan.entryRecord.id;
  ensureNotApplied(remote, entryId);

  const originalStock = round(number(plan.originalSnapshot?.estoque));
  const remoteStock = round(number(remote.estoque));
  const originalStockStamp = text(plan.originalSnapshot?.stock_updated_at);
  const remoteStockStamp = text(remote.stock_updated_at);
  if (plan.item.addStock !== false && (remoteStock !== originalStock || remoteStockStamp !== originalStockStamp)) {
    throw new Error(`O estoque mudou após a simulação (${originalStock} → ${remoteStock}). Recarregue a nota antes de importar.`);
  }

  const payload = clone(remote);
  const scalarFields = ['nome', 'gtin', 'ean', 'ncm', 'embalagem', 'preco_custo', 'preco', 'validade'];
  scalarFields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(plan.nextProduct, field)) payload[field] = clone(plan.nextProduct[field]);
  });
  payload.estoque = plan.item.addStock !== false ? round(remoteStock + number(plan.item.incomingUnits)) : remoteStock;

  const entries = listFromValue(remote.entradas_nfe);
  payload.entradas_nfe = [...entries, clone(plan.entryRecord)];

  const lots = listFromValue(remote.lotes);
  if (plan.lotRecord) {
    payload.lotes = [...lots.filter(lot => String(lot?.id || '') !== String(plan.lotRecord.id)), clone(plan.lotRecord)];
  } else {
    payload.lotes = lots;
  }

  const history = listFromValue(remote.historico_custos);
  const plannedHistory = listFromValue(plan.nextProduct.historico_custos);
  const newHistory = plannedHistory.find(entry => String(entry?.id || '') === entryId);
  payload.historico_custos = newHistory && !history.some(entry => String(entry?.id || '') === entryId)
    ? [...history, clone(newHistory)]
    : history;

  return payload;
}

export function materializeNewPlan(plan, remote) {
  if (remote) throw new Error(`A chave ${plan.productKey} passou a existir no Firebase após a simulação. Refaça o vínculo antes de importar.`);
  return clone(plan.nextProduct);
}

function assertConfig(config) {
  if (!config.writeMode) throw new Error('O modo de gravação geral da V2 está bloqueado.');
  if (!config.nfeImportMode) throw new Error('A importação de NF-e está bloqueada. Ative-a somente para um teste controlado.');
  if (!text(config.githubToken)) throw new Error('Informe o token do GitHub para registrar e arquivar a NF-e.');
}

export async function executeNfeImport({ config, analysis, simulation, rawXml, onProgress = () => {} }) {
  assertConfig(config);
  if (!analysis?.note?.key || digits(analysis.note.key).length !== 44) throw new Error('Análise sem chave válida da NF-e.');
  if (!simulation?.canImport) throw new Error('A simulação possui bloqueadores. Corrija todos antes de importar.');
  if (!String(rawXml || '').trim()) throw new Error('O XML original não está disponível para arquivamento.');

  const pendingPlans = simulation.plans.filter(plan => ['update', 'new'].includes(plan.status));
  if (!pendingPlans.length) throw new Error('Não há itens válidos para importar.');

  const remoteRecord = await inspectNfeImport(config, analysis.note.key);
  if (remoteRecord?.status === 'concluida') throw new Error(`A NF-e ${analysis.note.key} já está concluída no registro fiscal.`);
  const alreadyApplied = new Set((Array.isArray(remoteRecord?.itens_aplicados) ? remoteRecord.itens_aplicados : [])
    .map(item => String(item?.grupo || '')).filter(Boolean));
  const repeatedPlan = pendingPlans.find(plan => alreadyApplied.has(plan.groupKey));
  if (repeatedPlan) throw new Error(`O grupo ${repeatedPlan.groupKey} já consta como aplicado no registro fiscal.`);

  const session = `nfe_v2_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const applied = Array.isArray(remoteRecord?.itens_aplicados) ? clone(remoteRecord.itens_aplicados) : [];
  const ignored = [
    ...(Array.isArray(remoteRecord?.itens_ignorados) ? clone(remoteRecord.itens_ignorados) : []),
    ...simulation.plans.filter(plan => plan.status === 'skipped').map(plan => ({ grupo: plan.groupKey, motivo: 'Ignorado na simulação V2' })),
  ];
  let record = buildNfeImportRecord(analysis, simulation, { status: 'processando', session, applied, ignored });
  let xmlResult = null;
  const savedProducts = [];

  try {
    onProgress({ step: 'archive', message: 'Arquivando o XML fiscal…', current: 0, total: pendingPlans.length });
    xmlResult = await archiveNfeXml(config, analysis.note, rawXml);
    record.xml_path = nfeXmlPath(analysis.note);
    record.xml_arquivado_em = xmlResult.archivedAt;
    record = (await writeNfeImportRecord(config, record)).record;

    for (let index = 0; index < pendingPlans.length; index += 1) {
      const plan = pendingPlans[index];
      onProgress({
        step: 'product',
        message: `Salvando ${index + 1} de ${pendingPlans.length}: ${plan.nextProduct.nome || plan.productKey}`,
        current: index + 1,
        total: pendingPlans.length,
        plan,
      });

      const remote = await loadProduct(config, plan.productKey);
      const payload = plan.isNew ? materializeNewPlan(plan, remote) : materializeExistingPlan(plan, remote);
      payload.firebaseKey = plan.productKey;
      payload.id = text(payload.id || plan.productKey);
      payload.codigo = text(payload.codigo || payload.sku || payload.id || plan.productKey);
      const validation = validateProduct(payload, config);
      if (validation.errors.length) throw new Error(`${payload.nome || plan.productKey}: ${validation.errors.join(', ')}.`);

      const saved = await saveProduct(config, validation.product, plan.isNew ? null : remote);
      savedProducts.push(saved);
      applied.push({
        grupo: plan.groupKey,
        produto_key: productKey(saved),
        aplicado_em: new Date().toISOString(),
        quantidade: round(plan.item.incomingUnits),
        estoque_somado: plan.item.addStock !== false,
      });
      record = buildNfeImportRecord(analysis, simulation, { status: 'processando', session, applied, ignored });
      record.xml_path = nfeXmlPath(analysis.note);
      record.xml_arquivado_em = xmlResult.archivedAt;
      record = (await writeNfeImportRecord(config, record)).record;
    }

    record = buildNfeImportRecord(analysis, simulation, { status: 'concluida', session, applied, ignored });
    record.xml_path = nfeXmlPath(analysis.note);
    record.xml_arquivado_em = xmlResult.archivedAt;
    record = (await writeNfeImportRecord(config, record)).record;
    onProgress({ step: 'done', message: 'NF-e importada e conciliada com sucesso.', current: pendingPlans.length, total: pendingPlans.length });
    return { record, savedProducts, xml: xmlResult, session };
  } catch (error) {
    const failure = buildNfeImportRecord(analysis, simulation, {
      status: 'falhou',
      session,
      applied,
      ignored,
      error: error?.message || String(error),
    });
    if (xmlResult) {
      failure.xml_path = nfeXmlPath(analysis.note);
      failure.xml_arquivado_em = xmlResult.archivedAt;
    }
    await writeNfeImportRecord(config, failure).catch(() => {});
    if (applied.length) {
      throw new Error(`A importação parou após ${applied.length} item(ns) registrado(s): ${error?.message || error}. Reabra o mesmo XML para conciliar; os itens já aplicados permanecerão bloqueados.`);
    }
    throw error;
  }
}
