import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleRetiredAdmin1ProductsReadRequest } from "./retired-handler.mjs";

Deno.serve(handleRetiredAdmin1ProductsReadRequest);

