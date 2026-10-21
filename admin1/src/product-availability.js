/** Product publication rules shared by the Admin1 interface and its tests. */
export function getProductAvailability(product = {}) {
  const stock = Number(product.stock_quantity);
  const stockKnown = product.stock_known !== false;
  const hasStock = stockKnown && Number.isFinite(stock) && stock > 0;
  const active = product.active === true;

  if (!stockKnown) {
    return {
      active,
      canActivate: false,
      action: active ? 'deactivate' : null,
      label: 'Estoque indisponível',
      reason: 'Não foi possível confirmar o estoque vendável.'
    };
  }

  if (!hasStock) {
    return {
      active: false,
      canActivate: false,
      action: active ? 'deactivate' : null,
      label: 'Sem estoque · desativado',
      reason: 'Produto sem estoque não pode ser ativado.'
    };
  }

  return {
    active,
    canActivate: !active,
    action: active ? 'deactivate' : 'activate',
    label: active ? 'Ativo' : 'Inativo',
    reason: ''
  };
}

export function canSetProductActive(product = {}, active) {
  if (typeof active !== 'boolean') return false;
  if (!active) return true;
  if (product.stock_known === false) return false;
  return Number.isFinite(Number(product.stock_quantity)) && Number(product.stock_quantity) > 0;
}
