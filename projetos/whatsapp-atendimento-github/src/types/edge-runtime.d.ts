/** Minimal local typing for the Supabase Edge Runtime; no server secrets are exposed by this declaration. */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};
