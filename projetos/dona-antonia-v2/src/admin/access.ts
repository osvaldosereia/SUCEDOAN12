import { ADMIN_SECTIONS } from './navigation';
import type { AdminSectionId, AvailableAdminSection } from './navigation';
import { hasPermission, type Permission, type StaffRole } from '../application/authorization';

const SECTION_PERMISSION: Partial<Record<AdminSectionId, Permission>> = {
  pedidos: 'orders.read',
  atendimento: 'conversations.read',
  produtos: 'catalog.read',
  estoque: 'inventory.read',
  tipos: 'catalog.read',
  cestas: 'catalog.read',
  extras: 'catalog.read',
  clientes: 'customers.read',
  relatorios: 'orders.read',
};

/** Navigation is a usability gate; PostgreSQL RLS remains the data boundary. */
export function getAllowedAdminSections(role: StaffRole): AvailableAdminSection[] {
  return ADMIN_SECTIONS.filter((section) => {
    if (!section.available) return false;
    if (section.id === 'inicio') return true;
    return hasPermission(role, SECTION_PERMISSION[section.id] ?? 'admin.all');
  }).map((section) => section.id as AvailableAdminSection);
}

export function canManagePrivatePricing(role: StaffRole): boolean {
  return hasPermission(role, 'private.manage');
}
