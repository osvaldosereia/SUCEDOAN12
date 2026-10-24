/**
 * Registro único das funcionalidades do admin.
 * Um item futuro fica desabilitado até existir tela, controle de acesso e testes.
 */
export const ADMIN_GROUPS = [
  { id: 'operation', label: 'OPERAÇÃO' },
  { id: 'catalog', label: 'CATÁLOGO' },
  { id: 'management', label: 'GESTÃO' },
  { id: 'system', label: 'SISTEMA' },
] as const;

export const ADMIN_SECTIONS = [
  {
    id: 'inicio',
    label: 'Início',
    title: 'Visão geral',
    description: 'Acesso rápido às operações e configurações da loja.',
    group: 'operation',
    icon: 'home',
    available: true,
  },
  {
    id: 'pedidos',
    label: 'Pedidos',
    title: 'Pedidos',
    description: 'Novo, em separação, pronto e entregue.',
    group: 'operation',
    icon: 'orders',
    available: true,
  },
  {
    id: 'atendimento',
    label: 'Atendimento',
    title: 'Atendimento WhatsApp',
    description: 'Conversas conectadas a clientes e pedidos.',
    group: 'operation',
    icon: 'users',
    available: true,
  },

  {
    id: 'produtos',
    label: 'Produtos',
    title: 'Produtos',
    description: 'Busque produtos e revise seu cadastro, preço e disponibilidade.',
    group: 'catalog',
    icon: 'package',
    available: true,
  },
  {
    id: 'estoque',
    label: 'Estoque',
    title: 'Estoque',
    description: 'Saldo disponível, ajustes e conferências.',
    group: 'catalog',
    icon: 'chart',
    available: false,
  },
  {
    id: 'tipos',
    label: 'Tipos de produto',
    title: 'Tipos de produto',
    description: 'Escolhas de marcas e apresentações por tipo da cesta.',
    group: 'catalog',
    icon: 'layers',
    available: true,
  },
  {
    id: 'cestas',
    label: 'Cestas básicas',
    title: 'Cestas básicas',
    description: 'Cinco tamanhos, composição e valor interno de cada cesta.',
    group: 'catalog',
    icon: 'basket',
    available: true,
  },
  {
    id: 'extras',
    label: 'Produtos extras',
    title: 'Produtos extras',
    description: 'Grupos complementares da segunda etapa de compra.',
    group: 'catalog',
    icon: 'sparkles',
    available: true,
  },

  {
    id: 'clientes',
    label: 'Clientes',
    title: 'Clientes',
    description: 'Cadastros e histórico de compras.',
    group: 'management',
    icon: 'users',
    available: false,
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    title: 'Relatórios',
    description: 'Indicadores operacionais e de venda.',
    group: 'management',
    icon: 'chart',
    available: false,
  },
  {
    id: 'marketing',
    label: 'Marketing',
    title: 'Marketing',
    description: 'Comunicações e campanhas futuras.',
    group: 'management',
    icon: 'megaphone',
    available: false,
  },

  {
    id: 'integracoes',
    label: 'Integrações',
    title: 'Integrações',
    description: 'Bling, Meta WhatsApp e monitoramento.',
    group: 'system',
    icon: 'plug',
    available: false,
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    title: 'Configurações',
    description: 'Entrega, pagamento, regras e acesso.',
    group: 'system',
    icon: 'settings',
    available: false,
  },
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];
export type AdminSectionId = AdminSection['id'];
export type AvailableAdminSection = Extract<AdminSection, { available: true }>['id'];
export function isActiveAdminSection(value: string): value is AvailableAdminSection {
  return ADMIN_SECTIONS.some((section) => section.id === value && section.available);
}
