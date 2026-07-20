import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

export const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 5) {
      logger.error('Redis connection failed after 5 retries');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));

export async function connectRedis(): Promise<void> {
  await redis.connect();
}

// URL redirect cache helpers
const URL_CACHE_TTL = 3600; // 1 hour

export const RedisKeys = {
  urlByCode: (code: string) => `url:code:${code}`,
  refreshTokenBlacklist: (token: string) => `blacklist:${token}`,
  clickCount: (urlId: string) => `clicks:${urlId}`,
};

export async function cacheUrl(
  code: string,
  data: object,
  ttl = URL_CACHE_TTL
): Promise<void> {
  await redis.setex(RedisKeys.urlByCode(code), ttl, JSON.stringify(data));
}

export async function getCachedUrl(code: string): Promise<unknown | null> {
  const data = await redis.get(RedisKeys.urlByCode(code));
  return data ? JSON.parse(data) : null;
}

export async function invalidateCachedUrl(code: string): Promise<void> {
  await redis.del(RedisKeys.urlByCode(code));
}

export async function blacklistToken(
  token: string,
  expiresInSeconds: number
): Promise<void> {
  await redis.setex(
    RedisKeys.refreshTokenBlacklist(token),
    expiresInSeconds,
    '1'
  );
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const result = await redis.get(RedisKeys.refreshTokenBlacklist(token));
  return result !== null;
}
