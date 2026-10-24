import { useEffect, useMemo, useState } from 'react';
import type { BasketId, BasketTemplate, Product, ProductType } from '../../../core/model';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from '../../../data/demo';
import { DEMO_EXTRA_GROUPS, DEMO_EXTRA_PRODUCTS, DEMO_EXTRA_TYPES } from '../../../data/demo-extra';
import type { ExtraGroup } from '../../../core/extras';
import type { AdminProductsRepository } from '../../../application/admin-products';
import type {
  AdminBasketConfiguration,
  AdminBasketConfigurationRepository,
} from '../../../application/admin-basket-configuration';

export function useBasketConfigurationAdmin(
  repository: AdminBasketConfigurationRepository | null,
  productsRepository: AdminProductsRepository | null,
) {
  const [products, setProducts] = useState<Product[]>([...DEMO_PRODUCTS, ...DEMO_EXTRA_PRODUCTS]);
  const [types, setTypes] = useState<ProductType[]>([...DEMO_TYPES, ...DEMO_EXTRA_TYPES]);
  const [templates, setTemplates] = useState<BasketTemplate[]>(DEMO_TEMPLATES);
  const [extraGroups, setExtraGroups] = useState<ExtraGroup[]>(DEMO_EXTRA_GROUPS);
  const [privateBasketAdjustments, setPrivateBasketAdjustments] = useState<
    Record<BasketId, number>
  >({
    economica: 0,
    mini: 0,
    pequena: 0,
    media: 0,
    grande: 0,
  });
  const [selectedTypeId, setSelectedTypeId] = useState('arroz');
  const [selectedBasketId, setSelectedBasketId] = useState<BasketId>('mini');
  const [newTypeName, setNewTypeName] = useState('');
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(!repository);
  const selectedType = types.find((type) => type.id === selectedTypeId);
  const selectedBasket = templates.find((template) => template.id === selectedBasketId)!;

  const apply = (configuration: AdminBasketConfiguration) => {
    setTypes(configuration.types.map((type) => ({ ...type, productSkus: [...type.productSkus] })));
    setTemplates(
      configuration.baskets.map((basket) => ({
        ...basket,
        id: basket.id as BasketId,
        imageUrl: basket.imageUrl ?? undefined,
      })),
    );
    setPrivateBasketAdjustments(
      Object.fromEntries(
        configuration.baskets.map((basket) => [basket.id, basket.privateAdjustmentCents ?? 0]),
      ) as Record<BasketId, number>,
    );
    setExtraGroups(configuration.extras.map((group) => ({ ...group })));
    setSelectedTypeId(configuration.types[0]?.id ?? '');
    if (configuration.baskets[0]) setSelectedBasketId(configuration.baskets[0].id as BasketId);
  };

  useEffect(() => {
    if (!repository) return;
    let active = true;
    const loadProducts = async () => {
      if (!productsRepository) return null;
      const first = await productsRepository.list({
        search: '',
        category: null,
        status: 'todos',
        page: 1,
        pageSize: 100,
      });
      const rest = await Promise.all(
        Array.from({ length: Math.ceil(first.total / first.pageSize) - 1 }, (_, index) =>
          productsRepository.list({
            search: '',
            category: null,
            status: 'todos',
            page: index + 2,
            pageSize: first.pageSize,
          }),
        ),
      );
      return [first, ...rest].flatMap((page) => page.items);
    };
    void Promise.all([repository.load(), loadProducts()])
      .then(([configuration, catalog]) => {
        if (!active) return;
        apply(configuration);
        if (catalog)
          setProducts(
            catalog.map((product) => ({
              sku: product.sku,
              name: product.name,
              gtin: product.gtin,
              category: product.category,
              brand: product.brand,
              priceCents: product.priceCents,
              active: product.active,
              stock: product.stockUnits,
              imageUrl: product.photoUrl ?? undefined,
            })),
          );
        setReady(true);
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice(error instanceof Error ? error.message : 'Falha ao carregar configuração.');
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [repository, productsRepository]);

  const configFrom = (
    overrides: Partial<AdminBasketConfiguration> = {},
  ): AdminBasketConfiguration => ({
    types: overrides.types ?? types,
    baskets:
      overrides.baskets ??
      templates.map((basket, index) => ({
        id: basket.id,
        code: basket.id.toUpperCase(),
        name: basket.name,
        order: index + 1,
        active: basket.active,
        lines: basket.lines,
        privateAdjustmentCents: privateBasketAdjustments[basket.id] ?? 0,
        imageUrl: basket.imageUrl ?? null,
      })),
    extras: overrides.extras ?? extraGroups,
  });
  const persist = (overrides: Partial<AdminBasketConfiguration> = {}) => {
    if (!repository) {
      setNotice('Persistência V2 indisponível.');
      return;
    }
    void repository
      .save(configFrom(overrides))
      .then(() => setNotice('Configuração salva.'))
      .catch((error: unknown) =>
        setNotice(
          error instanceof Error ? error.message : 'Não foi possível salvar a configuração.',
        ),
      );
  };
  const filteredProducts = useMemo(
    () =>
      products.filter((product) =>
        (product.name + ' ' + product.sku + ' ' + (product.gtin || ''))
          .toLocaleLowerCase('pt-BR')
          .includes(filter.toLocaleLowerCase('pt-BR')),
      ),
    [products, filter],
  );
  const addType = () => {
    const name = newTypeName.trim();
    if (
      !name ||
      types.some((item) => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
    ) {
      setNotice('Informe um nome novo para o tipo.');
      return;
    }
    const type = { id: crypto.randomUUID(), name, productSkus: [], order: types.length + 1 };
    setTypes((current) => [...current, type]);
    persist({ types: [...types, type] });
    setSelectedTypeId(type.id);
    setNewTypeName('');
  };
  const toggleOption = (sku: string) => {
    const updated = types.map((type) =>
      type.id !== selectedTypeId
        ? type
        : {
            ...type,
            productSkus: type.productSkus.includes(sku)
              ? type.productSkus.filter((item) => item !== sku)
              : [...type.productSkus, sku],
          },
    );
    setTypes(updated);
    persist({ types: updated });
  };
  const reorderType = (typeId: string, delta: number) => {
    const ordered = [...types].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((type) => type.id === typeId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const [item] = ordered.splice(index, 1);
    if (!item) return;
    ordered.splice(target, 0, item);
    const updated = ordered.map((type, position) => ({ ...type, order: position + 1 }));
    setTypes(updated);
    persist({ types: updated });
  };
  const toggleTypeActive = (typeId: string) => {
    const updated = types.map((type) =>
      type.id === typeId ? { ...type, active: type.active === false } : type,
    );
    setTypes(updated);
    persist({ types: updated });
  };
  const renameType = (typeId: string, name: string) => {
    const clean = name.trim();
    if (!clean || clean.length > 120) return;
    const updated = types.map((type) => (type.id === typeId ? { ...type, name: clean } : type));
    setTypes(updated);
    persist({ types: updated });
  };
  const setQuantity = (typeId: string, quantity: number) => {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 999) return;
    const updated = templates.map((basket) => {
      if (basket.id !== selectedBasketId) return basket;
      const previous = basket.lines.find((line) => line.typeId === typeId);
      const lines = basket.lines.filter((line) => line.typeId !== typeId);
      if (quantity > 0)
        lines.push({
          typeId,
          defaultQuantity: quantity,
          order: previous?.order ?? types.find((type) => type.id === typeId)?.order ?? 99,
        });
      return { ...basket, lines: lines.sort((a, b) => a.order - b.order) };
    });
    setTemplates(updated);
    persist({
      baskets: updated.map((basket, index) => ({
        id: basket.id,
        code: basket.id.toUpperCase(),
        name: basket.name,
        order: index + 1,
        active: basket.active,
        lines: basket.lines,
        privateAdjustmentCents: privateBasketAdjustments[basket.id] ?? 0,
        imageUrl: basket.imageUrl ?? null,
      })),
    });
  };
  const setPrivateFee = (fee: number) => {
    const next = { ...privateBasketAdjustments, [selectedBasketId]: fee };
    setPrivateBasketAdjustments(next);
    persist({
      baskets: templates.map((basket, index) => ({
        id: basket.id,
        code: basket.id.toUpperCase(),
        name: basket.name,
        order: index + 1,
        active: basket.active,
        lines: basket.lines,
        privateAdjustmentCents: next[basket.id] ?? 0,
        imageUrl: basket.imageUrl ?? null,
      })),
    });
  };
  const createBasket = (name: string) => {
    const clean = name.trim();
    if (
      !clean ||
      templates.some(
        (basket) => basket.name.toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR'),
      )
    ) {
      setNotice('Informe um nome de tamanho novo.');
      return;
    }
    const id =
      clean
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') +
      '-' +
      crypto.randomUUID().slice(0, 8);
    const basket: BasketTemplate = { id, name: clean, active: false, lines: [] };
    const updated = [...templates, basket];
    setTemplates(updated);
    setSelectedBasketId(id);
    persist({
      baskets: updated.map((item, index) => ({
        id: item.id,
        code: item.id.toUpperCase(),
        name: item.name,
        order: index + 1,
        active: item.active,
        lines: item.lines,
        privateAdjustmentCents: privateBasketAdjustments[item.id] ?? 0,
      })),
    });
  };
  const updateBasket = (id: BasketId, patch: Partial<BasketTemplate>) => {
    const updated = templates.map((basket) =>
      basket.id === id ? { ...basket, ...patch } : basket,
    );
    setTemplates(updated);
    persist({
      baskets: updated.map((basket, index) => ({
        id: basket.id,
        code: basket.id.toUpperCase(),
        name: basket.name,
        order: index + 1,
        active: basket.active,
        lines: basket.lines,
        privateAdjustmentCents: privateBasketAdjustments[basket.id] ?? 0,
        imageUrl: basket.imageUrl ?? null,
      })),
    });
  };
  const moveBasket = (id: BasketId, delta: number) => {
    const ordered = [...templates].sort((a, b) => templates.indexOf(a) - templates.indexOf(b));
    const index = ordered.findIndex((basket) => basket.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const [item] = ordered.splice(index, 1);
    if (!item) return;
    ordered.splice(target, 0, item);
    const updated = ordered.map((basket) => ({ ...basket }));
    setTemplates(updated);
    persist({
      baskets: updated.map((basket, position) => ({
        id: basket.id,
        code: basket.id.toUpperCase(),
        name: basket.name,
        order: position + 1,
        active: basket.active,
        lines: basket.lines,
        privateAdjustmentCents: privateBasketAdjustments[basket.id] ?? 0,
        imageUrl: basket.imageUrl ?? null,
      })),
    });
  };
  const changeExtras = (groups: ExtraGroup[]) => {
    setExtraGroups(groups);
    persist({ extras: groups });
  };
  const changeTypes = (next: ProductType[]) => {
    setTypes(next);
    persist({ types: next });
  };
  return {
    products,
    setProducts,
    types,
    templates,
    extraGroups,
    privateBasketAdjustments,
    selectedTypeId,
    setSelectedTypeId,
    selectedBasketId,
    setSelectedBasketId,
    newTypeName,
    setNewTypeName,
    filter,
    setFilter,
    notice,
    setNotice,
    selectedType,
    selectedBasket,
    filteredProducts,
    ready,
    addType,
    toggleOption,
    reorderType,
    toggleTypeActive,
    renameType,
    setQuantity,
    setPrivateFee,
    createBasket,
    updateBasket,
    moveBasket,
    changeExtras,
    changeTypes,
  };
}
