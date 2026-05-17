/**
 * SaleorAdapter — implements @xpaysh/adapter-contract's PlatformAdapter
 * against the Saleor 3.x GraphQL API.
 *
 * Saleor quirks worth knowing:
 *   - Everything is GraphQL. One POST endpoint, no REST verbs.
 *   - Channels are mandatory — every catalog/checkout query takes a channel.
 *   - Saleor calls carts "Checkouts" (CheckoutCreate / checkoutLinesAdd /
 *     checkoutLineDelete / checkoutComplete).
 *   - Money is decimal in major units (19.99); mappers multiply by 100.
 *   - Product IDs are opaque base64 strings (Relay-style global IDs);
 *     slugs are stable + human-readable, used for the canonical URL.
 *   - `checkoutComplete` actually creates an Order; v0.1 defers to the
 *     storefront's checkout UI so the merchant's existing PSP integration
 *     handles payment. We pre-fill email/address and surface the checkout
 *     URL via Order.meta.storefront_checkout_url.
 */

import type {
  PlatformAdapter,
  AdapterCapabilities,
  Product,
  ProductQuery,
  Paginated,
  ProductId,
  CartId,
  Cart,
  CreateCartInput,
  CartMutation,
  CompleteCheckoutInput,
  Order,
  OrderId,
  OrderQuery,
  OrderStatus,
  RefundResult,
  DisputeHandle,
} from "@xpaysh/adapter-contract";

import { SaleorClient, SaleorError } from "./saleor-client";
import {
  mapProduct,
  mapCheckout,
  mapOrder,
  contractAddressToSaleor,
  type SaleorProduct,
  type SaleorCheckout,
  type SaleorOrder,
} from "./mappers";
import {
  PRODUCTS_QUERY,
  PRODUCT_BY_ID_QUERY,
  PRODUCT_BY_SLUG_QUERY,
  CHECKOUT_CREATE_MUTATION,
  CHECKOUT_QUERY,
  CHECKOUT_LINES_ADD_MUTATION,
  CHECKOUT_LINES_UPDATE_MUTATION,
  CHECKOUT_LINE_DELETE_MUTATION,
  CHECKOUT_SHIPPING_ADDRESS_UPDATE_MUTATION,
  CHECKOUT_EMAIL_UPDATE_MUTATION,
  ORDER_BY_ID_QUERY,
  ORDERS_QUERY,
} from "./queries";

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented in v0.1`);
    this.name = "NotImplementedError";
  }
}

export interface SaleorAdapterOptions {
  saleor: SaleorClient;
  siteUrl: string;
  defaultCurrency?: string;
}

export class SaleorAdapter implements PlatformAdapter {
  readonly platformName = "saleor";

  readonly capabilities: AdapterCapabilities = {
    cart: true,
    checkout: true,
    catalogSearch: true,
    catalogLookup: true,
    order: true,
    refunds: false, // v0.3 (orderRefund)
    disputes: false, // v0.3
    inventoryRealtime: true,
    webhooks: false, // v0.3 (Saleor webhook subscriptions)
    extras: {},
  };

  private sl: SaleorClient;
  private siteUrl: string;
  private defaultCurrency: string;

  constructor(opts: SaleorAdapterOptions) {
    this.sl = opts.saleor;
    this.siteUrl = opts.siteUrl.endsWith("/") ? opts.siteUrl : opts.siteUrl + "/";
    this.defaultCurrency = opts.defaultCurrency || "USD";
  }

  // -- Catalog -------------------------------------------------------------

  async listProducts(query: ProductQuery): Promise<Paginated<Product>> {
    const first = Math.min(query.limit ?? 24, 100);
    const after = query.cursor || null;
    const filter: Record<string, unknown> = {};
    if (query.q) filter.search = query.q;
    if (query.sku) filter.search = query.sku; // Saleor's product filter doesn't expose sku directly; search covers it
    if (query.category) filter.categories = [query.category];
    let sortBy: { field: string; direction: "ASC" | "DESC" } | undefined;
    if (query.sort === "price_asc") sortBy = { field: "PRICE", direction: "ASC" };
    else if (query.sort === "price_desc") sortBy = { field: "PRICE", direction: "DESC" };
    else if (query.sort === "newest") sortBy = { field: "DATE", direction: "DESC" };

    const data = await this.sl.query<{
      products: {
        edges: Array<{ cursor: string; node: SaleorProduct }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        totalCount: number;
      };
    }>(PRODUCTS_QUERY, {
      first,
      after,
      channel: this.sl.channel,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      sortBy,
    });

    const items = data.products.edges.map((e) => mapProduct(e.node, this.siteUrl));
    return {
      items,
      nextCursor: data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null,
      total: data.products.totalCount,
    };
  }

  async getProduct(id: ProductId): Promise<Product | null> {
    // Heuristic: Saleor global IDs are base64; slugs are kebab-case ASCII.
    const looksLikeBase64Id = /^[A-Za-z0-9+/=]+$/.test(id) && id.length >= 12 && !id.includes("-");
    try {
      const data = await this.sl.query<{ product: SaleorProduct | null }>(
        looksLikeBase64Id ? PRODUCT_BY_ID_QUERY : PRODUCT_BY_SLUG_QUERY,
        looksLikeBase64Id
          ? { id, channel: this.sl.channel }
          : { slug: id, channel: this.sl.channel },
      );
      if (!data.product) return null;
      return mapProduct(data.product, this.siteUrl);
    } catch (err) {
      // GraphQL "not found" comes back as null product, not an error; an error
      // here means transport/auth. Surface it.
      throw err;
    }
  }

  // -- Cart (Checkout) -----------------------------------------------------

  async createCart(input: CreateCartInput): Promise<Cart> {
    const lines = input.items.map((it) => ({
      variantId: it.variantId ?? it.sku, // Saleor CheckoutLineInput requires variantId
      quantity: it.quantity,
    }));
    const data = await this.sl.query<{
      checkoutCreate: {
        checkout: SaleorCheckout | null;
        errors: Array<{ field?: string; code: string; message?: string }>;
      };
    }>(CHECKOUT_CREATE_MUTATION, {
      input: { channel: this.sl.channel, lines, email: undefined },
    });
    if (data.checkoutCreate.errors.length > 0 || !data.checkoutCreate.checkout) {
      throw new Error(
        `checkoutCreate failed: ${data.checkoutCreate.errors.map((e) => `${e.code}@${e.field}`).join(", ")}`,
      );
    }
    return mapCheckout(data.checkoutCreate.checkout, this.defaultCurrency);
  }

  async getCart(id: CartId): Promise<Cart | null> {
    try {
      const data = await this.sl.query<{ checkout: SaleorCheckout | null }>(CHECKOUT_QUERY, { id });
      if (!data.checkout) return null;
      return mapCheckout(data.checkout, this.defaultCurrency);
    } catch (err) {
      if (err instanceof SaleorError && err.errors.some((e) => /not.*found/i.test(e.message))) return null;
      throw err;
    }
  }

  async updateCart(id: CartId, mutation: CartMutation): Promise<Cart> {
    // Fetch current to know existing line ids by sku.
    const current = await this.sl.query<{ checkout: SaleorCheckout | null }>(CHECKOUT_QUERY, { id });
    if (!current.checkout) throw new Error(`updateCart: checkout ${id} not found`);
    const existingBySku = new Map<string, { lineId: string; quantity: number; variantId: string }>();
    for (const ln of current.checkout.lines ?? []) {
      existingBySku.set(ln.variant.sku || ln.variant.id, {
        lineId: ln.id,
        quantity: ln.quantity,
        variantId: ln.variant.id,
      });
    }

    if (Array.isArray(mutation.setItems)) {
      const targetBySku = new Map(mutation.setItems.map((it) => [it.sku, it]));
      // Remove items in existing but not target.
      for (const [sku, ex] of existingBySku.entries()) {
        if (!targetBySku.has(sku)) {
          await this.sl.query(CHECKOUT_LINE_DELETE_MUTATION, { id, lineId: ex.lineId });
        }
      }
      // Add new + update existing in target.
      const linesToAdd: Array<{ variantId: string; quantity: number }> = [];
      const linesToUpdate: Array<{ lineId: string; quantity: number }> = [];
      for (const [sku, target] of targetBySku.entries()) {
        const ex = existingBySku.get(sku);
        if (!ex) {
          linesToAdd.push({ variantId: target.variantId ?? sku, quantity: target.quantity });
        } else if (ex.quantity !== target.quantity) {
          linesToUpdate.push({ lineId: ex.lineId, quantity: target.quantity });
        }
      }
      if (linesToAdd.length > 0) {
        await this.sl.query(CHECKOUT_LINES_ADD_MUTATION, { id, lines: linesToAdd });
      }
      if (linesToUpdate.length > 0) {
        await this.sl.query(CHECKOUT_LINES_UPDATE_MUTATION, { id, lines: linesToUpdate });
      }
    }

    if (Array.isArray(mutation.removeSkus)) {
      for (const sku of mutation.removeSkus) {
        const ex = existingBySku.get(sku);
        if (ex) await this.sl.query(CHECKOUT_LINE_DELETE_MUTATION, { id, lineId: ex.lineId });
      }
    }

    if (mutation.shippingAddress) {
      await this.sl.query(CHECKOUT_SHIPPING_ADDRESS_UPDATE_MUTATION, {
        id,
        shippingAddress: contractAddressToSaleor(mutation.shippingAddress),
      });
    }

    const after = await this.sl.query<{ checkout: SaleorCheckout | null }>(CHECKOUT_QUERY, { id });
    if (!after.checkout) throw new Error(`updateCart: checkout ${id} disappeared`);
    return mapCheckout(after.checkout, this.defaultCurrency);
  }

  // -- Checkout / Order ----------------------------------------------------

  async completeCheckout(input: CompleteCheckoutInput): Promise<Order> {
    // v0.1 defers payment to the storefront's existing checkout. Pre-fill
    // what we can, surface a pending Order pointing at the storefront URL.
    if (input.shippingAddress) {
      try {
        await this.sl.query(CHECKOUT_SHIPPING_ADDRESS_UPDATE_MUTATION, {
          id: input.cartId,
          shippingAddress: contractAddressToSaleor(input.shippingAddress),
        });
      } catch {
        // Non-fatal — storefront checkout will collect.
      }
    }
    if (input.shippingAddress?.email) {
      try {
        await this.sl.query(CHECKOUT_EMAIL_UPDATE_MUTATION, {
          id: input.cartId,
          email: input.shippingAddress.email,
        });
      } catch {
        // Non-fatal.
      }
    }

    const orderUrl = `${this.siteUrl}checkout?id=${encodeURIComponent(input.cartId)}`;
    return {
      id: `pending:${input.cartId}`,
      cartId: input.cartId,
      status: "created",
      items: [],
      subtotal: { amount: 0, currency: this.defaultCurrency },
      total: { amount: 0, currency: this.defaultCurrency },
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress ?? input.shippingAddress,
      createdAt: new Date().toISOString(),
      meta: { storefront_checkout_url: orderUrl, saleor_checkout_id: input.cartId },
    };
  }

  async getOrder(id: OrderId): Promise<Order | null> {
    try {
      const data = await this.sl.query<{ order: SaleorOrder | null }>(ORDER_BY_ID_QUERY, { id });
      if (!data.order) return null;
      return mapOrder(data.order, this.defaultCurrency);
    } catch (err) {
      if (err instanceof SaleorError && err.errors.some((e) => /not.*found/i.test(e.message))) return null;
      throw err;
    }
  }

  async listOrders(query: OrderQuery): Promise<Paginated<Order>> {
    const first = Math.min(query.limit ?? 24, 100);
    const after = query.cursor || null;
    const filter: Record<string, unknown> = {};
    if (query.createdAfter) filter.created = { gte: query.createdAfter };
    if (query.createdBefore) {
      filter.created = { ...(filter.created as object), lte: query.createdBefore };
    }
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      filter.status = statuses
        .map(contractStatusToSaleorStatus)
        .filter((x): x is string => !!x);
    }
    if (query.externalId) filter.externalReference = query.externalId;

    const data = await this.sl.query<{
      orders: {
        edges: Array<{ cursor: string; node: SaleorOrder }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        totalCount: number;
      };
    }>(ORDERS_QUERY, {
      first,
      after,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      sortBy: { field: "CREATION_DATE", direction: "DESC" },
    });
    const items = data.orders.edges.map((e) => mapOrder(e.node, this.defaultCurrency));
    return {
      items,
      nextCursor: data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null,
      total: data.orders.totalCount,
    };
  }

  async refundOrder(): Promise<RefundResult> {
    throw new NotImplementedError("refundOrder");
  }

  async openDispute(): Promise<DisputeHandle> {
    throw new NotImplementedError("openDispute");
  }
}

function contractStatusToSaleorStatus(s: OrderStatus): string | undefined {
  switch (s) {
    case "created":
      return "UNFULFILLED";
    case "confirmed":
    case "processing":
      return "PARTIALLY_FULFILLED";
    case "fulfilled":
    case "shipped":
    case "delivered":
      return "FULFILLED";
    case "cancelled":
      return "CANCELED";
    case "refunded":
      return "RETURNED";
    default:
      return undefined;
  }
}
