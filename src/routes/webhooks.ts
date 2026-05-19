/**
 * Saleor App webhooks → normalized OrderStateChanged events.
 *
 * Spec:
 *   https://docs.saleor.io/docs/3.x/developer/extending/apps/asynchronous-webhooks
 *
 * Saleor signs every webhook payload with Ed25519 in `saleor-signature`,
 * using a per-Saleor-instance keyset accessible at `/.well-known/jwks.json`.
 * For v0.2.3 we use the shared-secret header `X-Xpay-Webhook-Secret`
 * (configured in the App manifest's `webhooks[].targetUrl` query string or
 * a sidecar header); v0.3 switches to native Ed25519 + JWKS verification.
 *
 * Event types from manifest:
 *   ORDER_CREATED → order.created
 *   ORDER_UPDATED → order.updated
 *   ORDER_FULFILLED → order.fulfilled
 *   ORDER_CANCELLED → order.cancelled
 *   ORDER_REFUNDED → order.refunded
 */

import { RouteTable } from "./match";
import type { RouteHandler, RouteResponse } from "./types";
import { getOrderEventEmitter, type OrderEventTopic, type OrderStateChanged } from "../events";

const SALEOR_EVENT_TO_TOPIC: Record<string, OrderEventTopic | undefined> = {
  ORDER_CREATED: "order.created",
  ORDER_UPDATED: "order.updated",
  ORDER_FULLY_PAID: "order.updated",
  ORDER_FULFILLED: "order.fulfilled",
  ORDER_CANCELLED: "order.cancelled",
  ORDER_REFUNDED: "order.refunded",
};

export function buildWebhookRouteTable(): RouteTable<RouteHandler> {
  const table = new RouteTable<RouteHandler>();
  table.add("POST", "/webhooks/saleor", buildSaleorWebhookRoute());
  return table;
}

export function buildSaleorWebhookRoute(): RouteHandler {
  return async (req): Promise<RouteResponse> => {
    const secret = process.env.XPAY_WEBHOOK_SHARED_SECRET || "";
    if (!secret) return jsonError(503, "webhook_secret_unconfigured", "XPAY_WEBHOOK_SHARED_SECRET env required");
    if (headerOf(req.headers, "x-xpay-webhook-secret") !== secret) {
      return jsonError(401, "invalid_signature", "shared-secret mismatch");
    }

    let payload: { id?: string } & Record<string, unknown>;
    try {
      payload = JSON.parse(req.body || "{}");
    } catch {
      return jsonError(400, "invalid_json", "webhook body is not valid JSON");
    }

    // Saleor sends the event type via `saleor-event` header (or per-route URL).
    const eventName = headerOf(req.headers, "saleor-event")?.toUpperCase() || "";
    const mapped = SALEOR_EVENT_TO_TOPIC[eventName];
    if (!mapped) return { status: 204, headers: {}, body: "" };

    const orderId = payload.id;
    if (!orderId) return jsonError(400, "missing_order_id", "payload.id required");

    const event: OrderStateChanged = {
      source: "saleor",
      topic: mapped,
      orderId,
      platformShop: headerOf(req.headers, "saleor-domain") || undefined,
      occurredAt: new Date().toISOString(),
      payload,
    };
    await getOrderEventEmitter().emit(event);
    return { status: 200, headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ ok: true }) };
  };
}

function headerOf(headers: Record<string, string | string[] | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function jsonError(status: number, code: string, message: string): RouteResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ error: { code, message } }),
  };
}
