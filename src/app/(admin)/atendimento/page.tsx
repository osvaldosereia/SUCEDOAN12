import { InboxWorkspace } from "./workspace";

export default async function AtendimentoPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return <InboxWorkspace searchParams={await searchParams} />;
}
