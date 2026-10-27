"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

export function createClient() {
	if (!supabaseUrl || !supabasePublishableKey) {
		throw new Error("A conexão com o Supabase ainda não foi configurada.");
	}

	return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
