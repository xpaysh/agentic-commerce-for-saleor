/**
 * Thin GraphQL POST wrapper around the Saleor 3.x API.
 *
 * Auth: Bearer App token via the `Authorization` header. App tokens are
 * created in Saleor Dashboard → Configuration → Apps → Local Apps →
 * Create App → API Tokens.
 *
 * Every operation is a single POST to /graphql/ with `{query, variables}`.
 * Saleor returns `{data?, errors?}`; we surface errors as SaleorError.
 */

import type { SaleorCredentials } from "./config";

export interface GraphQLError {
  message: string;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

export class SaleorError extends Error {
  constructor(
    public readonly errors: GraphQLError[],
    public readonly status: number,
    public readonly url: string,
  ) {
    const summary = errors.map((e) => e.message).join("; ");
    super(`Saleor GraphQL error: ${summary || "(no message)"}`);
    this.name = "SaleorError";
  }
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export class SaleorClient {
  constructor(private readonly creds: SaleorCredentials) {}

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(this.creds.apiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.creds.appToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    let body: GraphQLResponse<T> = {};
    if (text) {
      try {
        body = JSON.parse(text) as GraphQLResponse<T>;
      } catch {
        throw new SaleorError(
          [{ message: `non-JSON response: ${text.slice(0, 200)}` }],
          res.status,
          this.creds.apiUrl,
        );
      }
    }
    if (body.errors && body.errors.length > 0) {
      throw new SaleorError(body.errors, res.status, this.creds.apiUrl);
    }
    if (!res.ok) {
      throw new SaleorError(
        [{ message: `HTTP ${res.status} ${res.statusText}` }],
        res.status,
        this.creds.apiUrl,
      );
    }
    if (!body.data) {
      throw new SaleorError([{ message: "no data returned" }], res.status, this.creds.apiUrl);
    }
    return body.data;
  }

  get channel(): string {
    return this.creds.channel;
  }
}
