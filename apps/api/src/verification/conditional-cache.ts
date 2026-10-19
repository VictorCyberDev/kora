export interface CachedResponse {
  etag: string;
  /** The JSON body of the response that carried the ETag, already validated. */
  json: unknown;
}

const MAX_ETAG_LENGTH = 256;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

/**
 * The last ETag and validated JSON per URL, held in memory only. It is never
 * persisted, so a restart starts empty, and it holds no token or header.
 * Bounded: when full, the oldest entry is dropped.
 */
export class ConditionalCache {
  readonly #entries = new Map<string, CachedResponse>();
  readonly #maxEntries: number;

  constructor(maxEntries = 32) {
    this.#maxEntries = maxEntries;
  }

  get size() {
    return this.#entries.size;
  }
  get(url: string): CachedResponse | undefined {
    return this.#entries.get(url);
  }
  /** An unusable ETag (too long, not printable ASCII) is not remembered. */
  set(url: string, etag: string, json: unknown) {
    if (etag.length > MAX_ETAG_LENGTH || !PRINTABLE_ASCII.test(etag))
      return this.delete(url);
    this.#entries.delete(url);
    this.#entries.set(url, { etag, json });
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }
  }
  delete(url: string) {
    this.#entries.delete(url);
  }
}
