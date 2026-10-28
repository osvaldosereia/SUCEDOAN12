import { notFound } from "next/navigation";

export const dynamicParams = false;

export function generateStaticParams(): Array<{ id: string }> {
	return [];
}

export default function ProdutoDetalheDinamicoDesativado(): never {
	return notFound();
}
