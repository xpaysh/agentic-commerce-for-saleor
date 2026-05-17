import type { SaleorClient } from "../saleor-client";
import type { RouteHandler } from "./types";

export function buildHealthRoute(sl: SaleorClient, version: string): RouteHandler {
  return async () => {
    let reachable = false;
    let err: string | undefined;
    try {
      // Cheap reachability probe — ask for a single product.
      await sl.query<{ products: { totalCount: number } }>(
        `query Ping($channel: String!) { products(first: 1, channel: $channel) { totalCount } }`,
        { channel: sl.channel },
      );
      reachable = true;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    return {
      status: reachable ? 200 : 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        ok: reachable,
        saleor_reachable: reachable,
        saleor_error: err,
        version,
        ts: new Date().toISOString(),
      }),
    };
  };
}
