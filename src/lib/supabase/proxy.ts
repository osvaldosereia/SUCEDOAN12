import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
	let response = NextResponse.next({ request });

	if (!supabaseUrl || !supabasePublishableKey) {
		return response;
	}

	const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet) {
				for (const { name, value } of cookiesToSet) {
					request.cookies.set(name, value);
				}

				response = NextResponse.next({ request });

				for (const { name, value, options } of cookiesToSet) {
					response.cookies.set(name, value, options);
				}
			},
		},
	});

	await supabase.auth.getClaims();

	return response;
}
