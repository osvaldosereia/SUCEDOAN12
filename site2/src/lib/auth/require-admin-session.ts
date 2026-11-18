import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Confirms only that this request has a valid Supabase Auth session.
 * Admin membership and role are checked by the existing server gateway for
 * every business-data request; this app never reads admin_users directly.
 */
export async function requireAdminSession(): Promise<{ userId: string }> {
	if (!hasSupabaseConfig) redirect("/login");

	const supabase = await createClient();
	const { data, error } = await supabase.auth.getClaims();
	const userId = data?.claims?.sub;

	if (error || !userId) redirect("/login");
	return { userId };
}
