import { notFound } from "next/navigation";

// Legacy dynamic links are no longer generated. Basket editing is served by
// the static query route /cestas/editar?id=... for GitHub Pages.
export function generateStaticParams() {
	return [];
}

export const dynamicParams = false;

export default function LegacyBasketMoldPage() {
	notFound();
}
