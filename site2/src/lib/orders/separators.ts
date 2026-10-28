export const ORDER_SEPARATORS = [
	{ key: "jose", label: "José" },
	{ key: "claudio", label: "Cláudio" },
	{ key: "jovenil", label: "Jovenil" },
	{ key: "kelly", label: "Kelly" },
] as const;

export type OrderSeparatorKey = (typeof ORDER_SEPARATORS)[number]["key"];

export function isOrderSeparatorKey(value: string): value is OrderSeparatorKey {
	return ORDER_SEPARATORS.some((separator) => separator.key === value);
}
