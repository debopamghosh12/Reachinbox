import { Client } from "@elastic/elasticsearch";
import { env } from "./env";

// Elasticsearch is optional. Without ELASTICSEARCH_URL there is no client:
// nothing is indexed and search falls back to Postgres (see emails.service).
export const searchEnabled = Boolean(env.ELASTICSEARCH_URL);

// Search is a "nice to have" next to sending, so ES gets a short timeout and
// no automatic retries: if it's slow or down we give up quickly, and the
// index can always be rebuilt from Postgres with `npm run reindex`.
export const es: Client | null = env.ELASTICSEARCH_URL
  ? new Client({
      node: env.ELASTICSEARCH_URL,
      requestTimeout: env.ES_REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    })
  : null;

// For shutdown code: closing a client that was never created is a no-op.
export async function closeSearch(): Promise<void> {
  await es?.close();
}
