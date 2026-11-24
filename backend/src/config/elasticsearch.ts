import { Client } from "@elastic/elasticsearch";
import { env } from "./env";

// Search is a "nice to have" next to sending, so ES gets a short timeout and
// no automatic retries: if it's slow or down we give up quickly, and the
// index can always be rebuilt from Postgres with `npm run reindex`.
export const es = new Client({
  node: env.ELASTICSEARCH_URL,
  requestTimeout: env.ES_REQUEST_TIMEOUT_MS,
  maxRetries: 0,
});
