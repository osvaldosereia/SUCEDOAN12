import fs from 'node:fs';

const ADMIN_UI_FILES = [
  'vitrine/admin/index.html',
  'vitrine/admin/admin-runtime.js',
  'vitrine/admin/styles/admin-main.css',
];

export function readAdminUiSource() {
  return ADMIN_UI_FILES.map((path) => fs.readFileSync(path, 'utf8')).join('\n');
}
