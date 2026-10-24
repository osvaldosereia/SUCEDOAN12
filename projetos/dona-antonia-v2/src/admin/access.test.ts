import { describe, expect, it } from 'vitest';
import { canManagePrivatePricing, getAllowedAdminSections } from './access';

describe('admin section access', () => {
  it('allows administrators into every available section', () => {
    expect(getAllowedAdminSections('ADMIN')).toEqual([
      'inicio',
      'pedidos',
      'atendimento',
      'produtos',
      'tipos',
      'cestas',
      'extras',
    ]);
  });

  it('limits product operators to catalog sections', () => {
    expect(getAllowedAdminSections('PRODUCTS')).toEqual([
      'inicio',
      'produtos',
      'tipos',
      'cestas',
      'extras',
    ]);
  });

  it('limits separation and support roles to order work', () => {
    expect(getAllowedAdminSections('SEPARATION')).toEqual(['inicio', 'pedidos']);
    expect(getAllowedAdminSections('SUPPORT')).toEqual(['inicio', 'pedidos', 'atendimento']);
  });

  it('keeps the private basket price field restricted to administrators', () => {
    expect(canManagePrivatePricing('ADMIN')).toBe(true);
    expect(canManagePrivatePricing('PRODUCTS')).toBe(false);
    expect(canManagePrivatePricing('SEPARATION')).toBe(false);
    expect(canManagePrivatePricing('SUPPORT')).toBe(false);
  });
});
