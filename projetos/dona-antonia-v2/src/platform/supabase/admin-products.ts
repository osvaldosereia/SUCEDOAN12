import type { SupabaseClient } from '@supabase/supabase-js';
import { CATEGORIES } from '../../core/model';
import type { Category } from '../../core/model';
import type {
  AdminProduct,
  AdminProductPage,
  AdminProductQuery,
  AdminProductsRepository,
  ProductPrivateProfile,
  ProductPrivateProfileDraft,
  ProductStockMovement,
} from '../../application/admin-products';
import { ProductProfileConflict, ProductRevisionConflict } from '../../application/admin-products';

type JsonObject = Record<string, unknown>;
const PATCH_KEYS: Readonly<Record<string, string>> = {
  sku: 'sku',
  name: 'name',
  brand: 'brand',
  category: 'category',
  gtin: 'gtin',
  priceCents: 'price_cents',
  stockUnits: 'stock_units',
  active: 'active',
  photoUrl: 'photo_url',
  validUntil: 'valid_until',
};
const PRIVATE_PATCH_KEYS: Readonly<Record<keyof ProductPrivateProfileDraft, string>> = {
  originCode: 'origin_code',
  ncm: 'ncm',
  cest: 'cest',
  packagingGtin: 'packaging_gtin',
  unitsPerCase: 'units_per_case',
  supplierName: 'supplier_name',
  supplierCode: 'supplier_code',
  purchaseCostExact: 'purchase_cost_exact',
};

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Resposta inválida ao ${label}.`);
  return value as JsonObject;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Campo ${field} ausente na resposta do catálogo.`);
  return value;
}

function integer(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new Error(`Campo ${field} inválido na resposta do catálogo.`);
  return parsed;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field);
}

function productFrom(value: unknown): AdminProduct {
  const row = object(value, 'carregar produto');
  const category = text(row.category, 'category');
  if (!CATEGORIES.includes(category as Category))
    throw new Error('Categoria inválida na resposta do catálogo.');
  if (typeof row.active !== 'boolean')
    throw new Error('Campo active inválido na resposta do catálogo.');
  return {
    id: text(row.id, 'id'),
    sku: text(row.sku, 'sku'),
    name: text(row.name, 'name'),
    brand: text(row.brand, 'brand'),
    category: category as Category,
    gtin: nullableText(row.gtin, 'gtin'),
    priceCents: integer(row.price_cents, 'price_cents'),
    stockUnits: integer(row.stock_units, 'stock_units'),
    active: row.active,
    photoUrl: nullableText(row.photo_url, 'photo_url'),
    validUntil: nullableText(row.valid_until, 'valid_until'),
    revision: integer(row.revision, 'revision'),
    updatedAt: text(row.updated_at, 'updated_at'),
  };
}

function movementFrom(value: unknown): ProductStockMovement {
  const row = object(value, 'carregar histórico de estoque');
  return {
    id: text(row.id, 'id'),
    deltaUnits: integer(row.delta_units, 'delta_units'),
    reason: text(row.reason, 'reason'),
    note: nullableText(row.note, 'note'),
    createdAt: text(row.created_at, 'created_at'),
  };
}

function privateProfileFrom(value: unknown): ProductPrivateProfile {
  const row = object(value, 'carregar ficha fiscal');
  if (row.unit !== 'UN') throw new Error('Unidade inválida na ficha fiscal.');
  const revision =
    row.revision === null || row.revision === undefined ? null : integer(row.revision, 'revision');
  const unitsPerCase =
    row.units_per_case === null || row.units_per_case === undefined
      ? null
      : integer(row.units_per_case, 'units_per_case');
  return {
    sku: text(row.sku, 'sku'),
    unit: 'UN',
    originCode: nullableText(row.origin_code, 'origin_code'),
    ncm: nullableText(row.ncm, 'ncm'),
    cest: nullableText(row.cest, 'cest'),
    packagingGtin: nullableText(row.packaging_gtin, 'packaging_gtin'),
    unitsPerCase,
    supplierName: nullableText(row.supplier_name, 'supplier_name'),
    supplierCode: nullableText(row.supplier_code, 'supplier_code'),
    purchaseCostExact: nullableText(row.purchase_cost_exact, 'purchase_cost_exact'),
    revision,
    updatedAt: nullableText(row.updated_at, 'updated_at'),
  };
}

function requestError(error: { code?: string; message?: string } | null, action: string): void {
  if (!error) return;
  if (error.code === '40001' || error.message?.includes('CATALOG_CONFLICT'))
    throw new ProductRevisionConflict();
  if (error.code === '23505')
    throw new Error('SKU ou EAN já cadastrado. Confira os dados informados.');
  if (error.code === '42501') throw new Error('Seu perfil não tem permissão para esta operação.');
  throw new Error(`Não foi possível ${action}. Revise os dados e tente novamente.`);
}

function privateProfileError(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  if (error.code === '40001' || error.message?.includes('PROFILE_CONFLICT'))
    throw new ProductProfileConflict();
  if (error.code === '42501')
    throw new Error('Somente administradores podem editar dados fiscais e de fornecedor.');
  throw new Error('Não foi possível salvar a ficha fiscal. Revise os dados e tente novamente.');
}

export function createSupabaseAdminProductsRepository(
  client: SupabaseClient,
): AdminProductsRepository {
  return {
    async list(query: AdminProductQuery): Promise<AdminProductPage> {
      const page = Math.max(1, Math.trunc(query.page));
      const pageSize = Math.min(100, Math.max(1, Math.trunc(query.pageSize)));
      const { data, error } = await client.rpc('admin_list_products', {
        p_search: query.search.trim() || null,
        p_category: query.category,
        p_status: query.status,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      });
      requestError(error, 'carregar o catálogo');
      const result = object(data, 'carregar catálogo');
      if (!Array.isArray(result.items)) throw new Error('Lista de produtos inválida.');
      return {
        items: result.items.map(productFrom),
        total: integer(result.total, 'total'),
        page,
        pageSize,
      };
    },

    async save(input) {
      const patch: JsonObject = {};
      for (const [key, value] of Object.entries(input.patch)) {
        const databaseKey = PATCH_KEYS[key];
        if (databaseKey) patch[databaseKey] = value;
      }
      const { data, error } = await client.rpc('admin_save_product', {
        p_product_id: input.id,
        p_expected_revision: input.expectedRevision,
        p_patch: patch,
        p_request_id: input.requestId,
        p_stock_note: input.stockNote ?? null,
      });
      requestError(error, 'salvar o produto');
      return productFrom(data);
    },

    async listStockMovements(productId) {
      const { data, error } = await client.rpc('admin_list_product_stock_movements', {
        p_product_id: productId,
        p_limit: 50,
      });
      requestError(error, 'carregar o histórico de estoque');
      if (!Array.isArray(data)) throw new Error('Histórico de estoque inválido.');
      return data.map(movementFrom);
    },

    async getPrivateProfile(productId) {
      const { data, error } = await client.rpc('admin_get_product_private_profile', {
        p_product_id: productId,
      });
      privateProfileError(error);
      return privateProfileFrom(data);
    },

    async savePrivateProfile(input) {
      const patch: JsonObject = {};
      for (const [key, value] of Object.entries(input.patch)) {
        const databaseKey = PRIVATE_PATCH_KEYS[key as keyof ProductPrivateProfileDraft];
        if (databaseKey) patch[databaseKey] = value;
      }
      const { data, error } = await client.rpc('admin_save_product_private_profile', {
        p_product_id: input.productId,
        p_expected_revision: input.expectedRevision,
        p_patch: patch,
        p_request_id: input.requestId,
      });
      privateProfileError(error);
      return privateProfileFrom(data);
    },
  };
}
