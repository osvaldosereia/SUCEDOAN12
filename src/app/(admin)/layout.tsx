import type { ReactNode } from "react";
import { AdminFrame } from "@/components/admin-frame";
import { requireStaff } from "@/lib/auth/require-staff";

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	const staff = await requireStaff();

	return <AdminFrame role={staff.role}>{children}</AdminFrame>;
}
