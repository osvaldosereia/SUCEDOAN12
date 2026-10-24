import { describe, expect, it } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS, type StaffRole } from './authorization';

describe('staff role permissions', () => {
  it('gives the administrator the complete permission set', () => {
    for (const permission of ROLE_PERMISSIONS.ADMIN) {
      expect(hasPermission('ADMIN', permission)).toBe(true);
    }
  });

  it('keeps catalog, separation and support responsibilities distinct', () => {
    expect(hasPermission('PRODUCTS', 'catalog.manage')).toBe(true);
    expect(hasPermission('PRODUCTS', 'orders.read')).toBe(false);
    expect(hasPermission('PRODUCTS', 'private.read')).toBe(false);

    expect(hasPermission('SEPARATION', 'orders.separate')).toBe(true);
    expect(hasPermission('SEPARATION', 'catalog.manage')).toBe(false);
    expect(hasPermission('SEPARATION', 'conversations.manage')).toBe(false);

    expect(hasPermission('SUPPORT', 'conversations.manage')).toBe(true);
    expect(hasPermission('SUPPORT', 'orders.read')).toBe(true);
    expect(hasPermission('SUPPORT', 'orders.separate')).toBe(false);
    expect(hasPermission('SUPPORT', 'private.read')).toBe(false);
  });

  it('denies an absent role and only accepts the closed role set', () => {
    expect(hasPermission(null, 'catalog.read')).toBe(false);
    expect(hasPermission(undefined, 'admin.all')).toBe(false);
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      (['ADMIN', 'PRODUCTS', 'SEPARATION', 'SUPPORT'] satisfies StaffRole[]).sort(),
    );
  });
});
