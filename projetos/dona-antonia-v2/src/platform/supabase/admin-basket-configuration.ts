import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeBasketConfiguration } from '../../application/admin-basket-configuration';
import type {
  AdminBasketConfiguration,
  AdminBasketConfigurationRepository,
} from '../../application/admin-basket-configuration';

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('A configuração recebida do banco está inválida.');
  return value as Record<string, unknown>;
}

export function mapBasketConfiguration(value: unknown): AdminBasketConfiguration {
  const root = asObject(value);
  if (!Array.isArray(root.types) || !Array.isArray(root.baskets) || !Array.isArray(root.extras))
    throw new Error('A configuração recebida do banco está incompleta.');
  return normalizeBasketConfiguration({
    types: root.types.map((value) => {
      const row = asObject(value);
      if (!Array.isArray(row.productSkus)) throw new Error('Vínculos de produtos inválidos.');
      return {
        id: String(row.id),
        name: String(row.name),
        order: Number(row.order),
        active: row.active !== false,
        productSkus: row.productSkus.map(String),
      };
    }),
    baskets: root.baskets.map((value) => {
      const row = asObject(value);
      if (!Array.isArray(row.lines)) throw new Error('Composição de cesta inválida.');
      return {
        id: String(row.id),
        code: String(row.code),
        name: String(row.name),
        order: Number(row.order),
        active: row.active === true,
        privateAdjustmentCents:
          row.privateAdjustmentCents === null ? null : Number(row.privateAdjustmentCents),
        imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null,
        lines: row.lines.map((value) => {
          const line = asObject(value);
          return {
            typeId: String(line.typeId),
            defaultQuantity: Number(line.defaultQuantity),
            order: Number(line.order),
          };
        }),
      };
    }),
    extras: root.extras.map((value) => {
      const row = asObject(value);
      return { typeId: String(row.typeId), order: Number(row.order), active: row.active === true };
    }),
  });
}

export function createSupabaseAdminBasketConfigurationRepository(
  client: SupabaseClient,
): AdminBasketConfigurationRepository {
  let saveQueue: Promise<void> = Promise.resolve();
  return {
    async load() {
      const { data, error } = await client.rpc('admin_get_basket_configuration');
      if (error)
        throw new Error(
          'Não foi possível carregar cestas e tipos. Confira sua permissão e tente novamente.',
        );
      return mapBasketConfiguration(data);
    },
    async save(configuration) {
      const normalized = normalizeBasketConfiguration(configuration);
      const operation = saveQueue
        .catch(() => undefined)
        .then(async () => {
          const { error } = await client.rpc('admin_save_basket_configuration', {
            p_configuration: normalized,
          });
          if (error) {
            if (error.code === '42501')
              throw new Error('Seu perfil não tem permissão para salvar esta configuração.');
            throw new Error(
              'Não foi possível salvar cestas e tipos. Revise os dados e tente novamente.',
            );
          }
        });
      saveQueue = operation;
      await operation;
    },
  };
}
