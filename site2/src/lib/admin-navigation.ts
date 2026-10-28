import {
	Bot,
	ClipboardList,
	House,
	type LucideIcon,
	MessageCircle,
	Package,
	Settings2,
	ShoppingBasket,
	Users,
} from "lucide-react";

export type NavigationItem = {
	href: string;
	label: string;
	icon: LucideIcon;
};

export type NavigationGroup = {
	label: string;
	items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
	{
		label: "Início",
		items: [{ href: "/", label: "Visão geral", icon: House }],
	},
	{
		label: "Operação",
		items: [
			{ href: "/atendimento", label: "Atendimento", icon: MessageCircle },
			{ href: "/pedidos", label: "Pedidos", icon: ClipboardList },
		],
	},
	{
		label: "Cadastros",
		items: [
			{ href: "/cestas", label: "Cestas", icon: ShoppingBasket },
			{ href: "/produtos", label: "Produtos", icon: Package },
			{ href: "/clientes", label: "Clientes", icon: Users },
		],
	},
	{
		label: "Assistente",
		items: [{ href: "/ana", label: "ANA", icon: Bot }],
	},
	{
		label: "Sistema",
		items: [
			{ href: "/configuracoes", label: "Configurações", icon: Settings2 },
		],
	},
];

export const navigationItems = navigationGroups.flatMap((group) => group.items);
