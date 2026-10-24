(() => {
  'use strict';

  const text = value => String(value ?? '').trim();
  const order = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  };

  function normalizeBasketTypes(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row, index) => {
        const name = text(row?.name);
        if (!name) throw new Error('basket_type_name_required');
        const templateId = text(row?.linked_template_id || row?.basket_template_id);
        return {
          id: text(row?.id),
          name,
          sort_order: order(row?.sort_order, index),
          is_active: row?.is_active !== false,
          linked_template_id: templateId || null,
          site_visible: Boolean(templateId) && row?.template_active !== false
        };
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  }

  function normalizeQuantities(rows) {
    return (Array.isArray(rows) ? rows : []).map(row => {
      const quantity = Number(row?.quantity);
      if (!text(row?.basket_type_id) || !text(row?.product_type_id) ||
          !Number.isFinite(quantity) || quantity < 0) {
        throw new Error('basket_quantity_invalid');
      }
      return {
        basket_type_id: text(row.basket_type_id),
        product_type_id: text(row.product_type_id),
        quantity
      };
    });
  }

  function normalizeCarouselOptions(rows) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .map((row, index) => {
        const id = text(row?.product_id || row?.id);
        if (!id) throw new Error('carousel_product_id_required');
        if (seen.has(id)) throw new Error('duplicate_carousel_product');
        seen.add(id);
        return { product_id: id, sort_order: order(row?.sort_order, index) };
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.product_id.localeCompare(b.product_id));
  }

  const api = { normalizeBasketTypes, normalizeQuantities, normalizeCarouselOptions };
  globalThis.DonaAntoniaBasketAdminDomain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
