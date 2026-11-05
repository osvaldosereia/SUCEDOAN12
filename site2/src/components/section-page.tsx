import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

type SectionPageProps = {
	title: string;
	eyebrow: string;
	description: string;
	icon: LucideIcon;
	emptyTitle: string;
	emptyDescription: string;
	nextStep: string;
};

export function SectionPage({
	title,
	eyebrow,
	description,
	icon: Icon,
	emptyTitle,
	emptyDescription,
	nextStep,
}: SectionPageProps) {
	return (
		<div className="page-stack">
			<div className="section-intro">
				<div className="section-icon" aria-hidden="true">
					<Icon size={20} strokeWidth={1.8} />
				</div>
				<div className="section-intro__copy">
					<p className="eyebrow">{eyebrow}</p>
					<h1>{title}</h1>
					<p>{description}</p>
				</div>
			</div>

			<section className="empty-panel" aria-labelledby="empty-heading">
				<div className="empty-panel__content">
					<div className="empty-panel__icon" aria-hidden="true">
						<Icon size={21} strokeWidth={1.8} />
					</div>
					<h2 id="empty-heading">{emptyTitle}</h2>
					<p>{emptyDescription}</p>
					<Link className="empty-panel__hint" href="/configuracoes">
						{nextStep}
						<ArrowRight aria-hidden="true" size={14} />
					</Link>
				</div>
			</section>
		</div>
	);
}
