import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export async function createClient() {
	if (!supabaseUrl || !supabasePublishableKey) {
		throw new Error("A conexão com o Supabase ainda não foi configurada.");
	}

	const cookieStore = await cookies();

	return createServerClient(supabaseUrl, supabasePublishableKey, {
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(cookiesToSet) {
				try {
					for (const { name, value, options } of cookiesToSet) {
						cookieStore.set(name, value, options);
					}
				} catch {
					// Server Components cannot write cookies; src/proxy.ts refreshes them.
				}
			},
		},
	});
}
