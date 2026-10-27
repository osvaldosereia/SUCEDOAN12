import type { ReactNode } from "react";
import { AdminFrame } from "@/components/admin-frame";
import { requireAdminSession } from "@/lib/auth/require-admin-session";

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	await requireAdminSession();

	return <AdminFrame>{children}</AdminFrame>;
}
