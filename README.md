# Agentic Commerce for Saleor

Multi-protocol agentic-commerce layer for [Saleor](https://saleor.io/) — the GraphQL-native, headless commerce platform. Speaks **[ACP](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)**, **[UCP](https://github.com/Universal-Commerce-Protocol/ucp)**, and **[AP2](https://github.com/google-agentic-commerce/AP2)** out of the box, emits real-standard discovery files (`/llms.txt`, schema.org JSON-LD, real-AI-crawler `robots.txt`), and settles through your existing Saleor payment app — cards, [Stripe MPP](https://mpp.dev), [x402](https://x402.org), stablecoins.

> Scaffold for the [`agentic-commerce-for-*`](https://github.com/xpaysh?q=agentic-commerce-for-) family. Full implementation lands in coming weeks alongside the [plugin template](https://github.com/xpaysh/agentic-commerce-plugin-template).

## Why this exists alongside `saleor/saleor-mcp`

Saleor ships an official [`saleor-mcp`](https://github.com/saleor/saleor-mcp) — an MCP server exposing Saleor operations as tools. That's an MCP transport binding; it doesn't speak ACP, UCP, or AP2 directly.

This repo is the **commerce-protocol layer**, not a competing MCP server:

- **ACP** endpoints (per-session `checkout_session` capability negotiation) on top of Saleor's GraphQL.
- **UCP** REST surface with [RFC 9421](https://datatracker.ietf.org/doc/rfc9421/) signed requests, mapping cart / checkout / order operations onto Saleor's GraphQL mutations.
- **AP2** mandate acceptance alongside Saleor's existing payment apps.
- Real-standard discovery emission (`/llms.txt`, schema.org JSON-LD, AI-crawler `robots.txt` allowlist).

The two compose: a Saleor store can run `saleor-mcp` for the MCP transport binding *and* this app for ACP/UCP/AP2 protocol surface, with the same Saleor instance backing both.

## What this gives a Saleor merchant

- **Multi-protocol coverage** — beyond MCP, the same Saleor catalog is reachable via ACP (OpenAI `Buy It in ChatGPT`), UCP (any UCP-speaking agent with RFC 9421 signed integrity), and AP2 (Google Agent Builder).
- **Rail-agnostic settlement** — your existing Saleor payment app (Stripe, Adyen, Mollie, custom) handles money. Optional MPP / x402 / stablecoin rails are configurable.
- **Cart deeplinks** — JWT-signed (commercial mode) or query-string (standalone) — pre-fill a Saleor checkout via GraphQL and redirect the buyer.
- **Two-mode operation** — *standalone* or *commercial* (xpay backend adds catalog hosting, attribution).

## Distribution shape

Saleor's [Apps framework](https://docs.saleor.io/developer/extending/apps/overview) is the canonical extension model. This repo ships as a **Saleor App** — a separate hosted service authenticating via Saleor's app manifest and webhook subscriptions.

```
   AI Agent  ───►  agentic-commerce-for-saleor (Saleor App)  ───►  Saleor GraphQL API
                  (ACP / UCP / AP2 endpoints,                     (Checkout, Order, Product)
                   listens to Saleor webhooks)                    + Webhooks
                          │
                          └──►  Merchant's existing Saleor payment app
                                (Stripe, Adyen, Mollie, MPP, x402, …)
```

## Status

- 🚧 **Scaffold** — README + LICENSE only. Headless / GraphQL-native shape reuses the same TypeScript scaffolding as the commercetools sibling.
- Track progress and adjacent platforms in the [awesome-agentic-commerce](https://github.com/xpaysh/awesome-agentic-commerce) registry.

## See also

- [Plugin template](https://github.com/xpaysh/agentic-commerce-plugin-template) — shared TypeScript core
- [awesome-agentic-commerce](https://github.com/xpaysh/awesome-agentic-commerce) — ecosystem registry
- [`saleor/saleor-mcp`](https://github.com/saleor/saleor-mcp) — official Saleor MCP server (composes with this app)
- [Agentic Commerce for commercetools](https://github.com/xpaysh/agentic-commerce-for-commercetools) — sibling headless scaffold
- [ACP vs UCP vs AP2 — Technical Comparison](https://docs.xpay.sh/agentic-commerce-protocols/comparison)
- [Saleor Apps documentation](https://docs.saleor.io/developer/extending/apps/overview)

## License

Apache-2.0.
