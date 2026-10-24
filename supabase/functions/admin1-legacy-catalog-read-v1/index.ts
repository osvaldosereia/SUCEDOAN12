import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleRetiredLegacyCatalogRequest } from "./retired-handler.mjs";

Deno.serve(handleRetiredLegacyCatalogRequest);
