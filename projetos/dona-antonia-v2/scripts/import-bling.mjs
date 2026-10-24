import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse } from 'csv-parse/sync';

export const EXPECTED_FIELDS = [
  'ID',
  'Código',
  'Descrição',
  'Unidade',
  'NCM',
  'Origem',
  'Preço',
  'Valor IPI fixo',
  'Observações',
  'Situação',
  'Estoque',
  'Preço de custo',
  'Cód no fornecedor',
  'Fornecedor',
  'Localização',
  'Estoque maximo',
  'Estoque minimo',
  'Peso líquido (Kg)',
  'Peso bruto (Kg)',
  'GTIN/EAN',
  'GTIN/EAN da embalagem',
  'Largura do Produto',
  'Altura do Produto',
  'Profundidade do produto',
  'Data Validade',
  'Descrição do Produto no Fornecedor',
  'Descrição Complementar',
  'Itens p/ caixa',
  'Produto Variação',
  'Tipo Produção',
  'Classe de enquadramento do IPI',
  'Código da lista de serviços',
  'Tipo do item',
  'Grupo de Tags/Tags',
  'Tributos',
  'Código Pai',
  'Código Integração',
  'Grupo de produtos',
  'Marca',
  'CEST',
  'Volumes',
  'Descrição Curta',
  'Cross-Docking',
  'URL Imagens Externas',
  'Link Externo',
  'Meses Garantia no Fornecedor',
  'Clonar dados do pai',
  'Condição do produto',
  'Frete Grátis',
  'Número FCI',
  'Vídeo',
  'Departamento',
  'Unidade de medida',
  'Preço de compra',
  'Valor base ICMS ST para retenção',
  'Valor ICMS ST para retenção',
  'Valor ICMS próprio do substituto',
  'Categoria do produto',
  'Informações Adicionais',
];

const CATEGORIES = new Set([
  'MERCEARIA BÁSICA',
  'LIMPEZA',
  'LAVANDERIA',
  'HIGIÊNE',
  'BELEZA',
  'UTILIDADES',
  'PET',
]);

function csvDelimiter(raw) {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t'];
  return (
    candidates
      .map((delimiter) => {
        try {
          return { delimiter, columns: parse(firstLine, { delimiter })[0]?.length ?? 0 };
        } catch {
          return { delimiter, columns: 0 };
        }
      })
      .sort((a, b) => b.columns - a.columns)[0]?.delimiter ?? ','
  );
}

function parseMoney(raw, field, line, maxDecimals = 2) {
  const value = (raw || '').trim();
  if (!value) throw new Error(`${field} ausente, linha ${line}`);
  const fraction = value.includes(',') ? value.split(',').at(-1) : value.split('.').at(-1);
  const precision =
    value.includes(',') || !/^\d{1,3}(?:\.\d{3})+$/.test(value) ? fraction.length : 0;
  if (
    precision > maxDecimals ||
    (!/^\d+(?:\.\d{1,4})?$/.test(value) && !/^\d+(?:\.\d{3})*(?:,\d{1,4})?$/.test(value))
  ) {
    throw new Error(`${field} inválido, linha ${line}`);
  }
  const normalized = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(?:\.\d{3})+$/.test(value)
      ? value.replace(/\./g, '')
      : value;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} inválido, linha ${line}`);
  return { cents: Math.round(parsed * 100), precision };
}

function normalizedGtin(raw) {
  const value = (raw || '').trim();
  return /^\d+\.0$/.test(value) ? value.slice(0, -2) : value;
}

function validGtin(value) {
  if (!/^\d{8}$|^\d{12,14}$/.test(value)) return false;
  const check = Number(value.at(-1));
  const sum = [...value.slice(0, -1)]
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const fiscalDigits = (value) => value.replace(/\D/g, '');

function compactConflictReport(conflicts) {
  const byType = new Map();
  for (const conflict of conflicts) {
    const lines = byType.get(conflict.type) ?? new Set();
    for (const line of conflict.lines ?? []) lines.add(line);
    byType.set(conflict.type, lines);
  }
  return [...byType].map(([type, lineSet]) => {
    const lines = [...lineSet].sort((a, b) => a - b);
    const lineRanges = [];
    for (const line of lines) {
      const previous = lineRanges.at(-1);
      if (previous && previous[1] === line - 1) previous[1] = line;
      else lineRanges.push([line, line]);
    }
    return { type, rowCount: lines.length, lineRanges };
  });
}

function normalizeStock(raw, line) {
  const value = (raw || '').trim();
  if (!value) return null;
  const stock = Number(value.replace(',', '.'));
  if (!Number.isSafeInteger(stock) || stock < 0) throw new Error(`Estoque inválido, linha ${line}`);
  return stock;
}

export function parseBlingCsv(input) {
  const raw = input.replace(/^\uFEFF/, '');
  const delimiter = csvDelimiter(raw);
  const header = parse(raw, { to_line: 1, bom: true, delimiter })[0] ?? [];
  const fields = header[0] === 'index' ? header.slice(1) : header;
  if (JSON.stringify(fields) !== JSON.stringify(EXPECTED_FIELDS)) {
    throw new Error('Cabeçalho diferente do modelo Bling esperado (59 colunas)');
  }
  const records = parse(raw, {
    columns: true,
    bom: true,
    delimiter,
    skip_empty_lines: true,
    relax_quotes: false,
    trim: false,
  });

  const skuSeen = new Set();
  const gtinLines = new Map();
  const publicIndexByLine = new Map();
  const publicProducts = [];
  const adminProducts = [];
  const conflicts = [];
  const rejections = [];
  let duplicateSkuRows = 0;
  let missingGtin = 0;
  let missingStock = 0;
  let invalidNcm = 0;
  let invalidCest = 0;
  let costPrecisionReviewRows = 0;

  for (const [index, row] of records.entries()) {
    const line = index + 2;
    try {
      const sku = row['Código']?.trim();
      const name = row['Descrição']?.trim();
      const category = row['Categoria do produto']?.trim();
      const unit = row['Unidade']?.trim();
      const gtin = normalizedGtin(row['GTIN/EAN']) || null;
      const packageGtin = normalizedGtin(row['GTIN/EAN da embalagem']) || null;
      const status = row['Situação']?.trim().toLowerCase();
      const unitsPerCaseRaw = row['Itens p/ caixa']?.trim();
      if (!sku || !name) throw new Error(`SKU ou descrição ausente, linha ${line}`);
      if (skuSeen.has(sku)) {
        duplicateSkuRows += 1;
        throw new Error(`SKU duplicado, linha ${line}`);
      }
      skuSeen.add(sku);
      if (!CATEGORIES.has(category)) throw new Error(`Categoria inválida, linha ${line}`);
      if (unit !== 'UN') throw new Error(`Unidade de venda inválida, linha ${line}`);
      if (!['ativo', 'inativo'].includes(status)) {
        throw new Error(`Situação desconhecida, linha ${line}`);
      }
      if (gtin && !validGtin(gtin))
        throw new Error(`GTIN ou dígito verificador inválido, linha ${line}`);
      if (packageGtin && !validGtin(packageGtin)) {
        throw new Error(`GTIN da embalagem ou dígito verificador inválido, linha ${line}`);
      }
      if (
        unitsPerCaseRaw &&
        (!/^\d+$/.test(unitsPerCaseRaw) ||
          !Number.isSafeInteger(Number(unitsPerCaseRaw)) ||
          Number(unitsPerCaseRaw) <= 0)
      ) {
        throw new Error(`Itens por caixa inválido, linha ${line}`);
      }
      const price = parseMoney(row['Preço'], 'Preço', line, 2);
      const cost = parseMoney(row['Preço de custo'], 'Preço de custo', line, 4);
      if (cost.precision > 2) {
        costPrecisionReviewRows += 1;
        conflicts.push({ type: 'cost_precision_exceeds_cents', lines: [line] });
      }
      const priceCents = price.cents;
      const costCents = cost.cents;
      const sourceStock = normalizeStock(row['Estoque'], line);
      if (sourceStock === null) missingStock += 1;
      if (!gtin) missingGtin += 1;
      if (gtin) {
        const previous = gtinLines.get(gtin) ?? [];
        previous.push(line);
        gtinLines.set(gtin, previous);
      }
      if (row['NCM']?.trim() && fiscalDigits(row['NCM'].trim()).length !== 8) {
        invalidNcm += 1;
        conflicts.push({ type: 'invalid_ncm', lines: [line] });
      }
      if (row['CEST']?.trim() && fiscalDigits(row['CEST'].trim()).length !== 7) {
        invalidCest += 1;
        conflicts.push({ type: 'invalid_cest', lines: [line] });
      }

      const active = status === 'ativo';
      const product = {
        sku,
        name,
        gtin,
        category,
        brand: row['Marca']?.trim() || '',
        priceCents,
        active,
        // Blank source balances are unknown; public projection stays non-sellable at zero.
        stock: sourceStock ?? 0,
      };
      publicProducts.push(product);
      publicIndexByLine.set(line, publicProducts.length - 1);
      adminProducts.push({
        ...product,
        sourceStock,
        costCents,
        ncm: row['NCM']?.trim() || null,
        cest: row['CEST']?.trim() || null,
        packageGtin,
        unitsPerCase: row['Itens p/ caixa']?.trim() || null,
        supplier: row['Fornecedor']?.trim() || null,
        supplierCode: row['Cód no fornecedor']?.trim() || null,
        originalBlingFields: Object.fromEntries(
          EXPECTED_FIELDS.map((field) => [field, row[field] ?? '']),
        ),
      });
    } catch (error) {
      rejections.push({
        line,
        reason: error instanceof Error ? error.message : 'Registro inválido',
      });
    }
  }

  for (const lines of gtinLines.values()) {
    if (lines.length > 1) {
      conflicts.push({ type: 'duplicate_gtin', rowCount: lines.length, lines });
      for (const line of lines) {
        const productIndex = publicIndexByLine.get(line);
        if (productIndex !== undefined) publicProducts[productIndex].active = false;
      }
    }
  }
  const duplicateGtinExcess = [...gtinLines.values()].reduce(
    (total, lines) => total + Math.max(0, lines.length - 1),
    0,
  );
  const summary = {
    rows: records.length,
    uniqueSku: skuSeen.size,
    duplicateSkuExcess: duplicateSkuRows,
    missingGtin,
    duplicateGtinExcess,
    missingStock: missingStock,
    stockUnknownRows: missingStock,
    inactiveRows: publicProducts.filter((product) => !product.active).length,
    zeroOrUnknownStockRows: publicProducts.filter((product) => product.stock === 0).length,
    invalidNcm,
    invalidCest,
    costPrecisionReviewRows,
    rejectedRows: rejections.length,
    conflicts,
  };
  summary.sellableRows = publicProducts.filter(
    (product) => product.active && product.stock > 0 && product.priceCents > 0,
  ).length;
  return {
    delimiter,
    summary,
    conflictReport: compactConflictReport(conflicts),
    rejections,
    publicProducts,
    adminProducts,
  };
}

function usage() {
  console.log('Uso: npm run import:bling -- [--dry-run | --write-to DIR] /caminho/arquivo.csv');
}

function runCli(args) {
  let mode = 'dry-run';
  let outputDirectory;
  let inputPath;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') mode = 'dry-run';
    else if (argument === '--write-to') {
      mode = 'write';
      outputDirectory = args[++index];
      if (!outputDirectory) throw new Error('Informe o diretório após --write-to');
    } else if (argument.startsWith('--')) throw new Error(`Opção desconhecida: ${argument}`);
    else if (inputPath) throw new Error('Informe apenas um arquivo CSV');
    else inputPath = argument;
  }
  if (!inputPath) {
    usage();
    process.exitCode = 2;
    return;
  }
  const input = readFileSync(resolve(inputPath), 'utf8');
  const result = parseBlingCsv(input);
  const digest = createHash('sha256').update(input).digest('hex');
  console.log(
    JSON.stringify(
      {
        mode,
        sourceSha256: digest,
        delimiter: result.delimiter === '\t' ? 'tab' : result.delimiter,
        summary: { ...result.summary, conflicts: result.summary.conflicts.length },
        conflictReport: result.conflictReport,
        rejections: result.rejections,
        databaseWrites: 0,
        publicOrProductionWrites: 0,
      },
      null,
      2,
    ),
  );
  if (mode === 'write') {
    const target = resolve(outputDirectory);
    const publicDirectory = resolve(import.meta.dirname, '../public');
    if (target === publicDirectory || target.startsWith(`${publicDirectory}/`)) {
      throw new Error('O importador não escreve arquivos de catálogo dentro de public/.');
    }
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(target, 'catalog.public.json'),
      JSON.stringify(result.publicProducts, null, 2) + '\n',
    );
    writeFileSync(
      join(target, 'catalog.admin.private.json'),
      JSON.stringify(result.adminProducts, null, 2) + '\n',
      { mode: 0o600 },
    );
    chmodSync(join(target, 'catalog.admin.private.json'), 0o600);
    console.log(`Arquivos locais escritos em ${target}. Nenhuma chamada ao banco foi feita.`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Falha desconhecida na importação');
    process.exitCode = 1;
  }
}
