import type { LiveSession } from "./live";

export interface Env {
  DB: D1Database;
  LIVE: DurableObjectNamespace<LiveSession>;
  ASSETS: Fetcher;
  ADMIN_EMAIL: string;
  MICROSOFT_ALLOWED_TENANTS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  /** "true" only in .dev.vars for local testing. Never set in production. */
  DEV_LOGIN?: string;
}
