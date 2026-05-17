/**
 * Public package entry. Exports the adapter + the request handler factory
 * for use as a library (e.g. embedded in another Node service).
 */

export { SaleorAdapter, NotImplementedError } from "./adapter";
export type { SaleorAdapterOptions } from "./adapter";
export { SaleorClient, SaleorError } from "./saleor-client";
export { loadConfig } from "./config";
export type { AppConfig, SaleorCredentials } from "./config";
export { buildHandler } from "./server";
export * as mappers from "./mappers";
