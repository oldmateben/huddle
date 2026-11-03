import { handleApi } from "./api";
import { handleAuth } from "./auth";
import type { Env } from "./env";

export { LiveSession } from "./live";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, env, url);
      if (url.pathname.startsWith("/auth/")) return await handleAuth(req, env, url);
    } catch (err) {
      console.error(err);
      return Response.json({ error: "Something went wrong on the server. Try again." }, { status: 500 });
    }
    return env.ASSETS.fetch(req); // the React app (SPA fallback is configured in wrangler.toml)
  },
} satisfies ExportedHandler<Env>;
