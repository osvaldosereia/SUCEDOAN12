import type { ReactNode } from "react";
import { AdminSessionGate } from "@/components/admin-session-gate";

export default function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	return <AdminSessionGate>{children}</AdminSessionGate>;
}
