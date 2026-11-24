import Redis from "ioredis";
import { env } from "./env";

// maxRetriesPerRequest: null is required by BullMQ workers. They hold long
// blocking commands; with a retry limit ioredis would reject them while Redis
// is briefly down and the worker would crash. null = wait until Redis is back.
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

// Shared client for our own commands (rate-limit counters, notification dedupe).
// BullMQ gets its own connections, so our calls never queue behind its blocking ones.
export const redis = createRedisConnection();
