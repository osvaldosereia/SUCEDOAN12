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
      newProductKeys: new Set(),
      selectedProductKey: '',
      filters: { query: '', category: '', status: '', quality: '', sort: 'name', page: 1 },
      firebaseVerified: false,
      loadedAt: '',
      lastPublication: null,
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
    this.state.newProductKeys.clear();
    this.state.firebaseVerified = true;
    this.state.loadedAt = new Date().toISOString();
    this.emit('products');
    this.emit('dirty');
  }

  getProduct(key) {
    return this.state.products.find(product => productKey(product) === String(key)) || null;
  }

  addProductDraft(product) {
    const key = productKey(product);
    if (!key) throw new Error('Rascunho sem chave.');
    if (this.getProduct(key)) throw new Error('Já existe um produto com esta chave.');
    const draft = clone(product);
    this.state.products.unshift(draft);
    this.state.newProductKeys.add(String(key));
    this.state.dirtyProducts.set(String(key), clone(draft));
    this.emit('products');
    this.emit('dirty');
    return draft;
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
    const normalizedKey = String(key);
    if (this.state.newProductKeys.has(normalizedKey)) {
      this.removeProduct(normalizedKey);
      return;
    }
    const snapshot = this.state.remoteSnapshots.get(normalizedKey);
    const index = this.state.products.findIndex(product => productKey(product) === normalizedKey);
    if (snapshot && index >= 0) this.state.products[index] = clone(snapshot);
    this.state.dirtyProducts.delete(normalizedKey);
    this.emit('product-updated', { key: normalizedKey });
    this.emit('dirty');
  }

  removeProduct(key) {
    const normalizedKey = String(key);
    const index = this.state.products.findIndex(product => productKey(product) === normalizedKey);
    if (index >= 0) this.state.products.splice(index, 1);
    this.state.remoteSnapshots.delete(normalizedKey);
    this.state.dirtyProducts.delete(normalizedKey);
    this.state.newProductKeys.delete(normalizedKey);
    if (this.state.selectedProductKey === normalizedKey) this.state.selectedProductKey = '';
    this.emit('products');
    this.emit('dirty');
  }

  markProductSaved(key, savedProduct, { emit = true } = {}) {
    const normalizedKey = String(key);
    const index = this.state.products.findIndex(product => productKey(product) === normalizedKey);
    if (index >= 0) this.state.products[index] = clone(savedProduct);
    else this.state.products.unshift(clone(savedProduct));
    this.state.remoteSnapshots.set(normalizedKey, clone(savedProduct));
    this.state.dirtyProducts.delete(normalizedKey);
    this.state.newProductKeys.delete(normalizedKey);
    if (emit) {
      this.emit('product-updated', { key: normalizedKey });
      this.emit('dirty');
    }
  }

  setLastPublication(publication) {
    this.state.lastPublication = publication;
    this.emit('publication', { publication });
  }
}
