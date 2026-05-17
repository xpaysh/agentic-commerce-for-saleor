/**
 * Saleor GraphQL shapes → adapter-contract value types.
 *
 * Saleor money is already in major units (decimal), so we multiply by 100
 * to align with the contract's integer minor units convention. Currency
 * is per-amount in Saleor's `Money` shape.
 */

import type {
  Address,
  Cart,
  Image,
  LineItem,
  Money,
  Order,
  OrderStatus,
  Product,
  ProductVariant,
} from "@xpaysh/adapter-contract";

// --- Saleor shapes (subset we consume) --------------------------------

export interface SaleorMoney {
  amount: number;
  currency: string;
}
export interface SaleorTaxedMoney {
  gross?: SaleorMoney;
}
export interface SaleorImage {
  url: string;
  alt?: string;
  sortOrder?: number;
  type?: string;
}
export interface SaleorProductVariant {
  id: string;
  sku?: string;
  name?: string;
  pricing?: { price?: { gross?: SaleorMoney } };
  quantityAvailable?: number;
}
export interface SaleorProduct {
  id: string;
  name: string;
  slug: string;
  description?: string;
  seoDescription?: string;
  productType?: { name?: string };
  thumbnail?: { url: string; alt?: string };
  media?: SaleorImage[];
  defaultVariant?: SaleorProductVariant;
  variants?: SaleorProductVariant[];
  category?: { id: string; name: string; slug: string };
  attributes?: Array<{
    attribute: { slug: string; name?: string };
    values: Array<{ name?: string; slug: string }>;
  }>;
}

export interface SaleorAddress {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  streetAddress1?: string;
  streetAddress2?: string;
  city?: string;
  countryArea?: string;
  postalCode?: string;
  country?: { code?: string };
  phone?: string;
}

export interface SaleorCheckoutLine {
  id: string;
  quantity: number;
  variant: { id: string; sku?: string; name?: string; product: { id: string; name: string } };
  totalPrice?: SaleorTaxedMoney;
  unitPrice?: SaleorTaxedMoney;
}
export interface SaleorCheckout {
  id: string;
  token?: string;
  email?: string;
  channel?: { slug?: string };
  lines?: SaleorCheckoutLine[];
  subtotalPrice?: SaleorTaxedMoney;
  shippingPrice?: SaleorTaxedMoney;
  totalPrice?: SaleorTaxedMoney;
  shippingAddress?: SaleorAddress;
  billingAddress?: SaleorAddress;
}

export interface SaleorOrderLine {
  id: string;
  productSku?: string;
  productName?: string;
  variantName?: string;
  quantity: number;
  totalPrice?: SaleorTaxedMoney;
  unitPrice?: SaleorTaxedMoney;
  variant?: { id?: string; product?: { id?: string } };
}
export interface SaleorOrder {
  id: string;
  number?: string;
  status?: string;
  created?: string;
  updatedAt?: string;
  userEmail?: string;
  channel?: { slug?: string };
  total?: SaleorTaxedMoney;
  subtotal?: SaleorTaxedMoney;
  lines?: SaleorOrderLine[];
  shippingAddress?: SaleorAddress;
  billingAddress?: SaleorAddress;
}

// --- Money helper -----------------------------------------------------

export function toMoney(m: SaleorMoney | undefined, fallbackCurrency = "USD"): Money {
  if (!m) return { amount: 0, currency: fallbackCurrency };
  return { amount: Math.round((m.amount ?? 0) * 100), currency: (m.currency || fallbackCurrency).toUpperCase() };
}

// --- Product ----------------------------------------------------------

export function mapProduct(p: SaleorProduct, siteUrl: string): Product {
  const variants: ProductVariant[] = (p.variants ?? (p.defaultVariant ? [p.defaultVariant] : [])).map(
    (v) => ({
      id: v.id,
      sku: v.sku || v.id,
      name: v.name,
      price: v.pricing?.price?.gross ? toMoney(v.pricing.price.gross) : undefined,
      inventory: typeof v.quantityAvailable === "number" ? v.quantityAvailable : null,
      inStock: (v.quantityAvailable ?? 1) > 0,
    }),
  );
  if (variants.length === 0) {
    variants.push({
      id: p.id,
      sku: p.id,
      inStock: true,
      inventory: null,
    });
  }

  return {
    id: p.id,
    sku: p.defaultVariant?.sku,
    name: p.name,
    description: p.seoDescription || p.description ? stripJsonRichText(p.description) || p.seoDescription : undefined,
    price: p.defaultVariant?.pricing?.price?.gross ? toMoney(p.defaultVariant.pricing.price.gross) : undefined,
    images: mapImages(p),
    url: joinUrl(siteUrl, `products/${p.slug}`),
    variants,
    attributes: mapAttributes(p),
    categories: p.category ? [p.category.slug] : undefined,
  };
}

function mapImages(p: SaleorProduct): Image[] {
  if (p.media && p.media.length > 0) {
    return p.media
      .filter((m) => (m.type ?? "IMAGE") === "IMAGE")
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map<Image>((m) => ({ url: m.url, alt: m.alt }));
  }
  if (p.thumbnail) return [{ url: p.thumbnail.url, alt: p.thumbnail.alt }];
  return [];
}

function mapAttributes(p: SaleorProduct): Record<string, string> | undefined {
  if (!p.attributes || p.attributes.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const a of p.attributes) {
    const slug = a.attribute.slug;
    const values = a.values.map((v) => v.name || v.slug).filter(Boolean) as string[];
    if (values.length > 0) out[slug] = values.join(",");
  }
  if (p.productType?.name) out.product_type = p.productType.name;
  return Object.keys(out).length > 0 ? out : undefined;
}

function stripJsonRichText(s?: string): string | undefined {
  // Saleor description may be Editor.js JSON or HTML; lightweight strip to plain text.
  if (!s) return undefined;
  try {
    const parsed = JSON.parse(s) as { blocks?: Array<{ data?: { text?: string } }> };
    if (parsed.blocks) {
      return parsed.blocks
        .map((b) => b.data?.text ?? "")
        .filter(Boolean)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }
  } catch {
    // Not JSON; treat as HTML.
  }
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base : base + "/";
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}${p}`;
}

// --- Cart (Saleor Checkout) -------------------------------------------

export function mapCheckout(c: SaleorCheckout, fallbackCurrency = "USD"): Cart {
  const items: LineItem[] = (c.lines ?? []).map((ln) => {
    const unit = ln.unitPrice?.gross ? toMoney(ln.unitPrice.gross, fallbackCurrency) : { amount: 0, currency: fallbackCurrency };
    const lineTotal = ln.totalPrice?.gross ? toMoney(ln.totalPrice.gross, fallbackCurrency) : { amount: unit.amount * ln.quantity, currency: fallbackCurrency };
    return {
      id: ln.id,
      productId: ln.variant.product.id,
      variantId: ln.variant.id,
      sku: ln.variant.sku || ln.variant.id,
      name: ln.variant.product.name + (ln.variant.name ? ` — ${ln.variant.name}` : ""),
      quantity: ln.quantity,
      unitPrice: unit,
      lineTotal,
    };
  });
  const subtotal = c.subtotalPrice?.gross ? toMoney(c.subtotalPrice.gross, fallbackCurrency) : { amount: items.reduce((a, i) => a + i.lineTotal.amount, 0), currency: fallbackCurrency };
  const total = c.totalPrice?.gross ? toMoney(c.totalPrice.gross, fallbackCurrency) : subtotal;
  const shipping = c.shippingPrice?.gross ? toMoney(c.shippingPrice.gross, fallbackCurrency) : null;
  return {
    id: c.id,
    items,
    subtotal,
    shipping,
    total,
    shippingAddress: c.shippingAddress ? mapAddress(c.shippingAddress) : undefined,
    billingAddress: c.billingAddress ? mapAddress(c.billingAddress) : undefined,
    meta: {
      saleor_checkout_id: c.id,
      saleor_token: c.token,
      saleor_channel: c.channel?.slug,
    },
  };
}

// --- Order ------------------------------------------------------------

export function mapOrder(o: SaleorOrder, _fallbackCurrency = "USD"): Order {
  const currency = o.total?.gross?.currency || _fallbackCurrency;
  const items: LineItem[] = (o.lines ?? []).map((ln) => {
    const unit = ln.unitPrice?.gross ? toMoney(ln.unitPrice.gross, currency) : { amount: 0, currency };
    const lineTotal = ln.totalPrice?.gross
      ? toMoney(ln.totalPrice.gross, currency)
      : { amount: unit.amount * ln.quantity, currency };
    return {
      id: ln.id,
      productId: ln.variant?.product?.id ?? ln.id,
      variantId: ln.variant?.id,
      sku: ln.productSku || ln.id,
      name: [ln.productName, ln.variantName].filter(Boolean).join(" — ") || ln.id,
      quantity: ln.quantity,
      unitPrice: unit,
      lineTotal,
    };
  });
  return {
    id: o.number || o.id,
    status: mapStatus(o.status),
    items,
    subtotal: o.subtotal?.gross ? toMoney(o.subtotal.gross, currency) : { amount: 0, currency },
    total: o.total?.gross ? toMoney(o.total.gross, currency) : { amount: 0, currency },
    shippingAddress: o.shippingAddress ? mapAddress(o.shippingAddress) : undefined,
    billingAddress: o.billingAddress ? mapAddress(o.billingAddress) : undefined,
    createdAt: o.created ?? new Date().toISOString(),
    updatedAt: o.updatedAt,
    meta: {
      saleor_id: o.id,
      saleor_status: o.status,
      saleor_channel: o.channel?.slug,
      customer_email: o.userEmail,
    },
  };
}

function mapStatus(s?: string): OrderStatus {
  const v = (s || "").toUpperCase();
  switch (v) {
    case "UNCONFIRMED":
    case "UNFULFILLED":
    case "DRAFT":
      return "created";
    case "PARTIALLY_FULFILLED":
      return "processing";
    case "FULFILLED":
      return "fulfilled";
    case "CANCELED":
      return "cancelled";
    case "RETURNED":
    case "PARTIALLY_RETURNED":
      return "refunded";
    default:
      return "created";
  }
}

function mapAddress(a: SaleorAddress): Address | undefined {
  const line1 = a.streetAddress1;
  const city = a.city;
  const postalCode = a.postalCode;
  const country = a.country?.code;
  if (!line1 || !city || !postalCode || !country) return undefined;
  return {
    name: [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || undefined,
    company: a.companyName,
    line1,
    line2: a.streetAddress2,
    city,
    region: a.countryArea,
    postalCode,
    country,
    phone: a.phone,
  };
}

export function contractAddressToSaleor(addr: Address): Record<string, unknown> {
  const parts = (addr.name ?? "").trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ") || firstName;
  return {
    firstName,
    lastName,
    companyName: addr.company,
    streetAddress1: addr.line1,
    streetAddress2: addr.line2,
    city: addr.city,
    countryArea: addr.region,
    postalCode: addr.postalCode,
    country: addr.country,
    phone: addr.phone,
  };
}
