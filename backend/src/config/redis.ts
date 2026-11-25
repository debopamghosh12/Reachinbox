import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

// Everything connects through the one REDIS_URL (redis://user:pass@host:port,
// the format Railway and docker-compose both use).
//
// maxRetriesPerRequest: null is required by BullMQ workers. They hold long
// blocking commands; with a retry limit ioredis would reject them while Redis
// is briefly down and the worker would crash. null = wait until Redis is back.
//
// family: 0 lets DNS return IPv4 or IPv6. Railway's private network
// (*.railway.internal) is IPv6-only, and ioredis defaults to IPv4.
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, family: 0 });
}

// Shared client for our own commands (rate-limit counters, notification dedupe).
// BullMQ gets its own connections, so our calls never queue behind its blocking ones.
export const redis = createRedisConnection();

// Delayed jobs and rate counters are plain Redis keys. Any eviction policy
// other than noeviction lets Redis delete them under memory pressure, which
// would silently drop scheduled emails (reconcile only repairs this on boot).
export async function warnIfRedisCanEvict(): Promise<void> {
  try {
    const reply = (await redis.config("GET", "maxmemory-policy")) as string[];
    const policy = reply[1];
    if (policy !== "noeviction") {
      logger.warn(
        `[redis] maxmemory-policy is "${policy}", should be "noeviction": Redis may evict queued jobs under memory pressure`,
      );
    }
  } catch (err) {
    // Some managed Redis services disable CONFIG.
    logger.warn(`[redis] could not read maxmemory-policy: ${err instanceof Error ? err.message : String(err)}`);
  }
}
