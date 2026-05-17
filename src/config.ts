/**
 * Runtime configuration — loaded from environment variables at startup.
 */

export interface SaleorCredentials {
  /** Full GraphQL endpoint URL, e.g. https://store.example.com/graphql/ */
  apiUrl: string;
  /** App token used as Bearer auth on every GraphQL request. */
  appToken: string;
  /** Channel slug — Saleor queries are channel-scoped (default-channel, etc.). */
  channel: string;
}

export interface AppConfig {
  merchantSlug: string;
  siteUrl: string;
  siteName: string;
  siteDescription?: string;
  checkoutPath: string;
  xpayApiKey: string;
  saleor: SaleorCredentials;
  host: string;
  port: number;
  emitOauthProtectedResource: boolean;
  emitAgentCard: boolean;
}

function readRequired(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`config: missing required env var ${name}`);
  return v.trim();
}
function readOptional(name: string, defaultValue = ""): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : defaultValue;
}
function readBool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return defaultValue;
  return /^(1|true|yes|on)$/i.test(v.trim());
}
function readInt(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (v === undefined || !v.trim()) return defaultValue;
  const n = parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : defaultValue;
}

export function loadConfig(): AppConfig {
  return {
    merchantSlug: readRequired("XPAY_MERCHANT_SLUG"),
    siteUrl: ensureTrailingSlash(readRequired("SITE_URL")),
    siteName: readRequired("SITE_NAME"),
    siteDescription: readOptional("SITE_DESCRIPTION") || undefined,
    checkoutPath: readOptional("CHECKOUT_PATH", "/checkout"),
    xpayApiKey: readRequired("XPAY_API_KEY"),
    saleor: {
      apiUrl: readRequired("SALEOR_API_URL"),
      appToken: readRequired("SALEOR_APP_TOKEN"),
      channel: readOptional("SALEOR_CHANNEL", "default-channel"),
    },
    host: readOptional("HOST", "0.0.0.0"),
    port: readInt("PORT", 8787),
    emitOauthProtectedResource: readBool("EMIT_OAUTH_PROTECTED_RESOURCE", false),
    emitAgentCard: readBool("EMIT_AGENT_CARD", false),
  };
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : url + "/";
}
