/** Application permission names mirror the RLS permission function in migration R03. */
export type StaffRole = 'ADMIN' | 'PRODUCTS' | 'SEPARATION' | 'SUPPORT';

export type Permission =
  | 'admin.all'
  | 'users.manage'
  | 'catalog.read'
  | 'catalog.manage'
  | 'inventory.read'
  | 'orders.read'
  | 'orders.separate'
  | 'customers.read'
  | 'conversations.read'
  | 'conversations.manage'
  | 'private.read'
  | 'private.manage'
  | 'audit.read'
  | 'audit.write';

export const ROLE_PERMISSIONS: Readonly<Record<StaffRole, readonly Permission[]>> = {
  ADMIN: [
    'admin.all',
    'users.manage',
    'catalog.read',
    'catalog.manage',
    'inventory.read',
    'orders.read',
    'orders.separate',
    'customers.read',
    'conversations.read',
    'conversations.manage',
    'private.read',
    'private.manage',
    'audit.read',
    'audit.write',
  ],
  PRODUCTS: ['catalog.read', 'catalog.manage', 'inventory.read', 'audit.write'],
  SEPARATION: ['orders.read', 'orders.separate', 'customers.read', 'inventory.read', 'audit.write'],
  SUPPORT: [
    'orders.read',
    'customers.read',
    'conversations.read',
    'conversations.manage',
    'audit.write',
  ],
};

/** UI convenience only; database RLS is the authorization boundary. */
export function hasPermission(role: StaffRole | null | undefined, permission: Permission): boolean {
  return role !== null && role !== undefined && ROLE_PERMISSIONS[role].includes(permission);
}
