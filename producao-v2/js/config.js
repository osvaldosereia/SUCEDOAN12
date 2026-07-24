export const DEFAULT_CONFIG = Object.freeze({
  firebaseUrl: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
  productsNode: 'produtos',
  writeMode: false,
  nfeImportMode: false,
  stockWriteMode: false,
  pageSize: 50,
  githubToken: '',
  githubOwner: 'osvaldosereia',
  githubRepo: 'SUCEDOAN12',
  githubBranch: 'main',
  productsHomePath: 'site/produtos-home.json',
  catalogVersionPath: 'catalog-version.json',
});

export const STORAGE_KEYS = Object.freeze({
  config: 'da_admin_v2_config',
  lastPublication: 'da_admin_v2_last_publication',
});
