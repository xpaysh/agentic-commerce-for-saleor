# agentic-commerce-for-saleor

**Multi-protocol agentic-commerce layer for [Saleor](https://saleor.io/) 3.x.** Speaks ACP, UCP, AP2; emits real-standard discovery files; signed-JWT cart-deeplinks; rail-agnostic (your existing Saleor payment app completes payment).

Runs as a Node sidecar talking to Saleor over its GraphQL API. Needs only a Saleor App token. Implements [`@xpaysh/adapter-contract`](https://www.npmjs.com/package/@xpaysh/adapter-contract) — same contract as the WooCommerce, commercetools, BigCommerce, and Magento siblings.

## What v0.1 ships

### Discovery (real standards only)

| Path | Standard |
|---|---|
| `GET /llms.txt` | [llmstxt.org](https://llmstxt.org) |
| `GET /.well-known/ucp` | UCP profile |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 (off by default) |
| `GET /.well-known/agent-card.json` | A2A 1.0 (off by default) |
| `GET /robots.txt` | RFC 9309 + AI-bot allowlist |
| `GET /api/v1/jsonld/product/:slug-or-id` | schema.org JSON-LD |

### Protocols

- **UCP**: catalog search/lookup, cart CRUD (Saleor Checkout), checkout, order lookup
- **ACP**: `checkout_sessions` create / get / update / complete, order lookup
- **AP2**: structural mandate verification, mandate-bound checkout

### Cart handoff

`GET /cart/deeplink?token=<jwt>` redeems an HS256-signed JWT and lands the agent on the storefront's checkout with a pre-filled Saleor Checkout.

## Capabilities

```
cart                ✓
checkout            ✓  (hands off to storefront for payment leg)
catalogSearch       ✓
catalogLookup       ✓
order               ✓
inventoryRealtime   ✓
refunds             —  v0.3 (orderRefund)
disputes            —  v0.3
webhooks            —  v0.3 (Saleor webhook subscriptions)
```

## Quickstart (Docker)

```bash
git clone https://github.com/xpaysh/agentic-commerce-for-saleor.git
cd agentic-commerce-for-saleor
cp .env.example .env
# Fill in XPAY_MERCHANT_SLUG, SITE_URL, XPAY_API_KEY,
# SALEOR_API_URL, SALEOR_APP_TOKEN, SALEOR_CHANNEL

docker compose -f examples/docker-compose.yml up --build
```

## Manual run

```bash
npm install
cp .env.example .env       # fill in
npm run build
node --env-file=.env dist/server.js
```

## Get a Saleor App token

1. Saleor Dashboard → **Configuration → Apps → Local Apps → Create App**
2. Name it `xpay agentic commerce`
3. Grant permissions:
   - Manage products (read)
   - Manage orders (read)
   - Manage checkouts (create/update)
4. Save → **API Tokens → Create token** → copy into `SALEOR_APP_TOKEN`
5. Find your channel slug under **Configuration → Channels** (usually `default-channel`).

## Architecture

This package is one of a family of `agentic-commerce-for-<platform>` repos under [xpaysh](https://github.com/xpaysh) that all implement the same `@xpaysh/adapter-contract`:

- [agentic-commerce-for-woocommerce](https://github.com/xpaysh/agentic-commerce-for-woocommerce) — PHP-native reference
- [agentic-commerce-for-commercetools](https://github.com/xpaysh/agentic-commerce-for-commercetools) — TypeScript reference
- [agentic-commerce-for-bigcommerce](https://github.com/xpaysh/agentic-commerce-for-bigcommerce) — TypeScript sibling
- [agentic-commerce-for-magento](https://github.com/xpaysh/agentic-commerce-for-magento) — TypeScript sidecar
- [agentic-commerce-for-saleor](https://github.com/xpaysh/agentic-commerce-for-saleor) — *this repo*

Per-platform delta is ~4 files (`saleor-client.ts`, `queries.ts`, `adapter.ts`, `mappers.ts`); every protocol route handler, discovery emitter, JWT verifier, and JSON-LD generator is shared.

## License

Apache-2.0
