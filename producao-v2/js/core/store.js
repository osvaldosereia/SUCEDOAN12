import { clone, productKey } from './utils.js';

export class Store extends EventTarget {
  constructor(config) {
    super();
    this.state = {
      config,
      route: 'dashboard',
      loading: false,
      error: '',
      products: [],
      remoteSnapshots: new Map(),
      dirtyProducts: new Map(),
      selectedProductKey: '',
      filters: { query: '', category: '', status: '', quality: '', sort: 'name', page: 1 },
    };
  }

  emit(type = 'change', detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  setLoading(loading) {
    this.state.loading = Boolean(loading);
    this.emit('status');
  }

  setError(message = '') {
    this.state.error = String(message || '');
    this.emit('status');
  }

  setProducts(products) {
    this.state.products = products;
    this.state.remoteSnapshots = new Map(products.map(product => [productKey(product), clone(product)]));
    this.state.dirtyProducts.clear();
    this.emit('products');
    this.emit('dirty');
  }

  getProduct(key) {
    return this.state.products.find(product => productKey(product) === String(key)) || null;
  }

  updateProduct(key, patch) {
    const product = this.getProduct(key);
    if (!product) return null;
    Object.assign(product, patch);
    this.state.dirtyProducts.set(String(key), clone(product));
    this.emit('product-updated', { key: String(key) });
    this.emit('dirty');
    return product;
  }

  discardProduct(key) {
    const snapshot = this.state.remoteSnapshots.get(String(key));
    const index = this.state.products.findIndex(product => productKey(product) === String(key));
    if (snapshot && index >= 0) this.state.products[index] = clone(snapshot);
    this.state.dirtyProducts.delete(String(key));
    this.emit('product-updated', { key: String(key) });
    this.emit('dirty');
  }

  markProductSaved(key, savedProduct) {
    const normalizedKey = String(key);
    const index = this.state.products.findIndex(product => productKey(product) === normalizedKey);
    if (index >= 0) this.state.products[index] = clone(savedProduct);
    this.state.remoteSnapshots.set(normalizedKey, clone(savedProduct));
    this.state.dirtyProducts.delete(normalizedKey);
    this.emit('product-updated', { key: normalizedKey });
    this.emit('dirty');
  }
}
