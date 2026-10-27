import { redirect } from "next/navigation";
import { isStaffRole, type StaffContext } from "@/lib/auth/roles";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function requireStaff(): Promise<StaffContext> {
	if (!hasSupabaseConfig) {
		redirect("/login");
	}

	const supabase = await createClient();
	const { data, error: claimsError } = await supabase.auth.getClaims();
	const userId = data?.claims?.sub;

	if (claimsError || !userId) {
		redirect("/login");
	}

	const { data: profile, error: profileError } = await supabase
		.from("staff_profiles")
		.select("role, enabled")
		.eq("user_id", userId)
		.maybeSingle();

	if (profileError || !profile?.enabled || !isStaffRole(profile.role)) {
		redirect("/login");
	}

	return { userId, role: profile.role };
}
